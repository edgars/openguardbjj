import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatBytes, formatTimestamp } from '@bjj/core/format';
import { isTerminal } from '@bjj/core/status';
import { requireUser } from '@/lib/auth';
import { HttpError } from '@/lib/api';
import { activeJob, getNotes, getTechniques, getTranscript, getVideo, playbackUrls } from '@/lib/data';
import { ImportStatus } from '@/components/ImportStatus';
import { VideoWorkspace } from '@/components/VideoWorkspace';
import { VideoActions } from '@/components/VideoActions';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', youtube_shorts: 'YouTube Shorts', instagram: 'Instagram', upload: 'Upload próprio' };

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { t } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const video = await getVideo(userId, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const [transcript, techniques, notes, urls, job] = await Promise.all([
    getTranscript(id), getTechniques(id), getNotes(id), playbackUrls(video), activeJob(id),
  ]);
  const processing = !isTerminal(video.download_status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200">← Biblioteca</Link>
          <h1 className="mt-1 text-xl font-semibold">{video.title ?? 'Sem título'}</h1>
          <p className="text-sm text-zinc-400">
            {PLATFORM_LABEL[video.platform] ?? video.platform}
            {video.author && <> · {video.author}</>}
            {video.duration_seconds != null && <> · {formatTimestamp(video.duration_seconds)}</>}
            {video.resolution && <> · {video.resolution}</>}
            {video.file_size_bytes != null && <> · {formatBytes(video.file_size_bytes)} no Blob</>}
            {video.source_url && (
              <> · <a href={video.source_url} target="_blank" rel="noreferrer" className="underline decoration-mat-600 hover:text-zinc-200">origem</a></>
            )}
          </p>
        </div>
        <VideoActions
          videoId={video.id}
          status={video.download_status}
          hasVideo={!!video.blob_pathname}
          hasAudio={!!video.audio_pathname}
          canRedownload={!!video.source_url}
        />
      </div>

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
        <div className="card p-5">
          {processing || video.download_status === 'FAILED' || video.download_status === 'CANCELLED' ? (
            <ImportStatus videoId={video.id} showOpenLink={false} />
          ) : (
            <div className="space-y-2 text-sm text-zinc-300">
              <p>O arquivo MP4 deste vídeo não está mais no storage.</p>
              {video.source_url ? (
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
        <div className="card max-h-96 overflow-y-auto p-4 text-sm">
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
