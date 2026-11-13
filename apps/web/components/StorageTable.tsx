'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBytes } from '@bjj/core/format';

interface Row {
  id: string;
  title: string | null;
  status: string;
  videoBytes: number | null;
  audioBytes: number | null;
  thumbBytes: number | null;
  transcription: string;
  resolution: string | null;
}

export function StorageTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<'size' | 'title'>('size');

  const sorted = [...rows].sort((a, b) =>
    sort === 'size'
      ? (b.videoBytes ?? 0) + (b.audioBytes ?? 0) - ((a.videoBytes ?? 0) + (a.audioBytes ?? 0))
      : (a.title ?? '').localeCompare(b.title ?? ''),
  );

  async function run(id: string, label: string, path: string, init: RequestInit, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(id);
    setMsg(null);
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? `${label}: ok` : `${label}: ${data.error ?? r.status}`);
    if (r.ok) router.refresh();
  }

  const del = (id: string, which: 'video' | 'audio' | 'both') =>
    run(id, `Apagar ${which}`, `/api/videos/${id}/assets?which=${which}`, { method: 'DELETE' },
      which === 'audio' ? 'Apagar o áudio armazenado? (retranscrições passarão a extrair o áudio do MP4)' : 'Apagar o arquivo de vídeo do Blob? A transcrição e as técnicas serão mantidas.');

  const actions = (r: Row) => (
    <>
      <button className="btn-ghost px-2 py-1 text-xs" disabled={busy === r.id || r.status !== 'COMPLETED' || (r.videoBytes == null && r.audioBytes == null)}
        onClick={() => run(r.id, 'Retranscrição', `/api/videos/${r.id}/reprocess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'RETRANSCRIBE' }) })}>
        Retranscrever
      </button>
      <button className="btn-danger px-2 py-1 text-xs" disabled={busy === r.id || r.videoBytes == null} onClick={() => del(r.id, 'video')}>Vídeo</button>
      <button className="btn-danger px-2 py-1 text-xs" disabled={busy === r.id || r.audioBytes == null} onClick={() => del(r.id, 'audio')}>Áudio</button>
      <button className="btn-danger px-2 py-1 text-xs" disabled={busy === r.id || (r.videoBytes == null && r.audioBytes == null)} onClick={() => del(r.id, 'both')}>Ambos</button>
    </>
  );

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-mat-700 p-3 text-sm">
        <span className="text-zinc-400">Ordenar:</span>
        <button className={sort === 'size' ? 'text-belt' : 'text-zinc-400'} onClick={() => setSort('size')}>tamanho</button>
        <button className={sort === 'title' ? 'text-belt' : 'text-zinc-400'} onClick={() => setSort('title')}>título</button>
        {msg && <span className="ml-auto text-xs text-zinc-400">{msg}</span>}
      </div>
      {/* Mobile: lista de cartões */}
      <ul className="divide-y divide-mat-700 md:hidden">
        {sorted.map((r) => (
          <li key={r.id} className="space-y-2 p-3 text-sm">
            <div>
              <Link href={`/videos/${r.id}`} className="line-clamp-2 break-words hover:text-belt">{r.title ?? r.id}</Link>
              <span className="text-xs text-zinc-500">{r.status}{r.resolution ? ` · ${r.resolution}` : ''} · transcrição {r.transcription}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-zinc-500">MP4</dt><dd className="tabular-nums">{formatBytes(r.videoBytes)}</dd></div>
              <div><dt className="text-zinc-500">Áudio</dt><dd className="tabular-nums">{formatBytes(r.audioBytes)}</dd></div>
              <div><dt className="text-zinc-500">Thumb</dt><dd className="tabular-nums">{formatBytes(r.thumbBytes)}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-1.5">{actions(r)}</div>
          </li>
        ))}
        {!rows.length && <li className="p-6 text-center text-sm text-zinc-500">Nenhum vídeo.</li>}
      </ul>
      <table className="hidden w-full min-w-[820px] text-sm md:table">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="p-3">Vídeo</th>
            <th className="p-3 text-right">MP4</th>
            <th className="p-3 text-right">Áudio</th>
            <th className="p-3 text-right">Thumb</th>
            <th className="p-3">Transcrição</th>
            <th className="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-mat-700">
              <td className="max-w-xs p-3">
                <Link href={`/videos/${r.id}`} className="line-clamp-1 hover:text-belt">{r.title ?? r.id}</Link>
                <span className="text-xs text-zinc-500">{r.status}{r.resolution ? ` · ${r.resolution}` : ''}</span>
              </td>
              <td className="p-3 text-right tabular-nums">{formatBytes(r.videoBytes)}</td>
              <td className="p-3 text-right tabular-nums">{formatBytes(r.audioBytes)}</td>
              <td className="p-3 text-right tabular-nums">{formatBytes(r.thumbBytes)}</td>
              <td className="p-3 text-xs text-zinc-400">{r.transcription}</td>
              <td className="p-3">
                <div className="flex flex-wrap justify-end gap-1.5">{actions(r)}</div>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={6} className="p-6 text-center text-zinc-500">Nenhum vídeo.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
