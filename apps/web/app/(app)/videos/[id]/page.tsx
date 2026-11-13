import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatBytes, formatTimestamp } from '@bjj/core/format';
import { isTerminal } from '@bjj/core/status';
import { requireUser } from '@/lib/auth';
import { HttpError, isUuid } from '@/lib/api';
import { activeJob, getNotes, getPlaylist, getTechniques, getTranscript, getVideo, isFavorite, playbackUrls, playlistsForVideo } from '@/lib/data';
import { ImportStatus } from '@/components/ImportStatus';
import { VideoWorkspace } from '@/components/VideoWorkspace';
import { VideoActions } from '@/components/VideoActions';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AddToPlaylist } from '@/components/AddToPlaylist';
import { PlaylistNav } from '@/components/PlaylistNav';
import { SourceLink } from '@/components/SourceLink';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', youtube_shorts: 'YouTube Shorts', instagram: 'Instagram', upload: 'Upload próprio' };

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; pl?: string }> }) {
  const user = await requireUser();
  const admin = user.role === 'admin';
  const { id } = await params;
  const { t, pl } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const video = await getVideo(user, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const [transcript, techniques, notes, urls, job, favorite, playlists] = await Promise.all([
    getTranscript(id), getTechniques(id), getNotes(id, user.id), playbackUrls(video), admin ? activeJob(id) : null,
    isFavorite(user.id, id), playlistsForVideo(user.id, id),
  ]);
  const playing = pl && isUuid(pl) ? await getPlaylist(user, pl).catch(() => null) : null;
  const processing = !isTerminal(video.download_status);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200">← Biblioteca</Link>
          <h1 className="mt-1 break-words text-lg font-semibold sm:text-xl">{video.title ?? 'Sem título'}</h1>
          <p className="break-words text-sm text-zinc-400">
            {PLATFORM_LABEL[video.platform] ?? video.platform}
            {video.author && <> · {video.author}</>}
            {video.duration_seconds != null && <> · {formatTimestamp(video.duration_seconds)}</>}
            {video.resolution && <> · {video.resolution}</>}
            {video.file_size_bytes != null && <> · {formatBytes(video.file_size_bytes)} no Blob</>}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <SourceLink platform={video.platform} url={video.source_url} author={video.author} />
            <FavoriteButton videoId={video.id} initial={favorite} withLabel className="btn-ghost" />
            {video.download_status === 'COMPLETED' && (
              <AddToPlaylist videoId={video.id} initial={playlists} />
            )}
          </div>
          {admin && (
            <VideoActions
              videoId={video.id}
              status={video.download_status}
              hasVideo={!!video.blob_pathname}
              hasAudio={!!video.audio_pathname}
              canRedownload={!!video.source_url}
            />
          )}
        </div>
      </div>

      {playing && (
        <PlaylistNav pl={playing.playlist.id} name={playing.playlist.name} ids={playing.videos.map((v) => v.id)} current={video.id} />
      )}

      {urls.video && job && (
        <div className="card p-4">
          <p className="mb-3 text-sm text-zinc-400">Reprocessamento em andamento (o vídeo continua disponível):</p>
          <ImportStatus videoId={video.id} showOpenLink={false} />
        </div>
      )}

      {urls.video ? (
        <VideoWorkspace
          videoId={video.id}
          src={urls.video}
          poster={urls.thumbnail}
          initialTime={t ? Number(t) || 0 : 0}
          segments={transcript.segments.map((s) => ({ start: s.start_seconds, end: s.end_seconds, text: s.text }))}
          transcriptMeta={transcript.meta ? { language: transcript.meta.language, model: transcript.meta.model } : null}
          transcriptionStatus={video.transcription_status}
          techniques={techniques}
          notes={notes}
        />
      ) : (
        <div className="card p-4 sm:p-5">
          {processing || video.download_status === 'FAILED' || video.download_status === 'CANCELLED' ? (
            <ImportStatus videoId={video.id} showOpenLink={false} />
          ) : (
            <div className="space-y-2 text-sm text-zinc-300">
              <p>O arquivo MP4 deste vídeo não está mais no storage.</p>
              {!admin ? (
                <p className="text-zinc-400">O administrador removeu o arquivo; ele pode ser reimportado depois.</p>
              ) : video.source_url ? (
                <p className="text-zinc-400">Use “Baixar novamente” para reimportá-lo da origem (requer worker ativo).</p>
              ) : (
                <p className="text-zinc-400">Era um upload próprio — envie o arquivo novamente para reproduzir.</p>
              )}
              {transcript.segments.length > 0 && <p className="text-zinc-400">A transcrição e as técnicas continuam disponíveis abaixo.</p>}
            </div>
          )}
        </div>
      )}

      {!urls.video && transcript.segments.length > 0 && (
        <div className="card max-h-[60vh] overflow-y-auto p-3 text-sm sm:p-4">
          {transcript.segments.map((s) => (
            <p key={s.idx} className="py-0.5"><span className="mr-2 font-mono text-xs text-zinc-500">{formatTimestamp(s.start_seconds)}</span>{s.text}</p>
          ))}
        </div>
      )}

      {video.description && (
        <details className="card p-4 text-sm text-zinc-300">
          <summary className="cursor-pointer text-zinc-400">Descrição original</summary>
          <p className="mt-2 whitespace-pre-wrap">{video.description}</p>
        </details>
      )}
    </div>
  );
}
