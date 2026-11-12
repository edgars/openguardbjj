'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAGE_LABEL_PT, isTerminal, type VideoStage } from '@bjj/core/status';
import { formatBytes, formatTimestamp } from '@bjj/core/format';
import { ImportModal } from './ImportModal';

export interface LibraryItem {
  id: string;
  title: string | null;
  platform: string;
  author: string | null;
  duration: number | null;
  status: string;
  progress: number;
  hasVideo: boolean;
  sizeBytes: number | null;
  transcription: string;
  techniques: string[];
  thumbnail: string | null;
  error: string | null;
  createdAt: string;
}

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', youtube_shorts: 'Shorts', instagram: 'Instagram', upload: 'Upload' };

export function Library({ initial }: { initial: LibraryItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState('');
  useEffect(() => setItems(initial), [initial]);

  // Polling só dos vídeos em processamento; quando algum termina, recarrega a página do servidor.
  const activeIds = useMemo(() => items.filter((i) => !isTerminal(i.status)).map((i) => i.id), [items]);
  useEffect(() => {
    if (!activeIds.length) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/videos?ids=${activeIds.join(',')}`, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      const { videos } = (await r.json()) as { videos: Array<{ id: string; download_status: string; processing_progress: number; error_message: string | null }> };
      let finished = false;
      setItems((prev) =>
        prev.map((it) => {
          const u = videos.find((v) => v.id === it.id);
          if (!u) return it;
          if (isTerminal(u.download_status)) finished = true;
          return { ...it, status: u.download_status, progress: u.processing_progress, error: u.error_message };
        }),
      );
      if (finished) router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [activeIds, router]);

  const filtered = items.filter((i) => {
    if (!q) return true;
    const hay = `${i.title ?? ''} ${i.author ?? ''} ${i.techniques.join(' ')}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Biblioteca</h1>
        <input className="input max-w-xs" placeholder="Buscar por título, autor ou técnica" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary ml-auto" onClick={() => setOpen(true)}>+ Importar vídeo</button>
      </div>

      {!items.length ? (
        <div className="card p-10 text-center text-zinc-400">
          <p className="mb-3">Nenhum vídeo ainda.</p>
          <button className="btn-primary" onClick={() => setOpen(true)}>Importar o primeiro vídeo</button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <li key={v.id} className="card overflow-hidden">
              <Link href={`/videos/${v.id}`} className="block">
                <div className="relative aspect-video bg-mat-800">
                  {v.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">sem miniatura</div>
                  )}
                  {v.duration != null && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs">{formatTimestamp(v.duration)}</span>
                  )}
                  {!isTerminal(v.status) && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-mat-700">
                      <div className="h-full bg-belt transition-all" style={{ width: `${v.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="line-clamp-2 text-sm font-medium">{v.title ?? 'Sem título (aguardando metadados)'}</p>
                  <p className="text-xs text-zinc-400">
                    {PLATFORM_LABEL[v.platform] ?? v.platform}
                    {v.author && <> · {v.author}</>}
                    {v.sizeBytes != null && <> · {formatBytes(v.sizeBytes)}</>}
                  </p>
                  <StatusPill status={v.status} hasVideo={v.hasVideo} progress={v.progress} />
                  {v.techniques.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {v.techniques.slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-mat-700 px-1.5 py-0.5 text-[11px] text-zinc-300">{t}</span>
                      ))}
                      {v.techniques.length > 4 && <span className="text-[11px] text-zinc-500">+{v.techniques.length - 4}</span>}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function StatusPill({ status, hasVideo, progress }: { status: string; hasVideo: boolean; progress: number }) {
  const st = status as VideoStage;
  if (st === 'COMPLETED' && !hasVideo) return <span className="text-xs text-amber-300">Arquivo removido do storage</span>;
  const color = st === 'COMPLETED' ? 'text-emerald-300' : st === 'FAILED' ? 'text-red-300' : st === 'CANCELLED' ? 'text-zinc-400' : 'text-belt';
  return (
    <span className={`text-xs ${color}`}>
      {STAGE_LABEL_PT[st] ?? status}
      {!isTerminal(st) && st !== 'PENDING' && ` · ${progress}%`}
    </span>
  );
}
