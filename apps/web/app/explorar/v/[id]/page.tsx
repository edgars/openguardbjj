import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTimestamp } from '@bjj/core/format';
import { isUuid } from '@/lib/api';
import { getTechniques, getTranscript, playbackUrls } from '@/lib/data';
import { PLATFORM_LABEL, categoryLabel, getPublicVideo } from '@/lib/public';
import { VideoWorkspace } from '@/components/VideoWorkspace';
import { catColor } from '@/components/PublicVideoGrid';
import { SourceLink } from '@/components/SourceLink';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const v = await getPublicVideo(id);
  if (!v) return {};
  const techs = await getTechniques(id);
  const names = [...new Set(techs.map((t) => t.name_pt))];
  return {
    title: `${v.title ?? 'Vídeo'}${names.length ? ` — ${names.slice(0, 3).join(', ')}` : ''} · OpenGuard BJJ`,
    description: names.length ? `Técnicas: ${names.join(', ')}.` : (v.description ?? undefined)?.slice(0, 160),
  };
}

export default async function PublicVideoPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!isUuid(id)) notFound();
  const video = await getPublicVideo(id);
  if (!video) notFound();
  const [transcript, techniques, urls] = await Promise.all([getTranscript(id), getTechniques(id), playbackUrls(video)]);
  const categories = [...new Set(techniques.map((x) => x.category))];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/explorar" className="text-xs text-zinc-400 hover:text-zinc-200">← Explorar</Link>
        <h1 className="mt-1 break-words text-lg font-semibold sm:text-xl">{video.title ?? 'Sem título'}</h1>
        <p className="break-words text-sm text-zinc-400">
          {PLATFORM_LABEL[video.platform] ?? video.platform}
          {video.author && <> · {video.author}</>}
          {video.duration_seconds != null && <> · {formatTimestamp(video.duration_seconds)}</>}
        </p>
        <SourceLink platform={video.platform} url={video.source_url} author={video.author} className="mt-2" />
        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Link key={c} href={`/explorar?cat=${c}`} className={`rounded-full border px-2.5 py-0.5 text-xs ${catColor(c)}`}>{categoryLabel(c)}</Link>
            ))}
          </div>
        )}
      </div>

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
          notes={[]}
          publicMode
        />
      ) : (
        <div className="card p-5 text-sm text-zinc-400">
          O arquivo deste vídeo não está disponível no momento.
          {video.source_url && <> Veja no <a href={video.source_url} target="_blank" rel="noreferrer" className="text-belt underline">post original</a>.</>}
        </div>
      )}

      {video.description && (
        <details className="card p-4 text-sm text-zinc-300">
          <summary className="cursor-pointer text-zinc-400">Descrição original</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{video.description}</p>
        </details>
      )}
    </div>
  );
}
