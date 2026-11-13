'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimestamp } from '@bjj/core/format';

interface Item { id: string; title: string | null; author: string | null; duration: number | null; thumbnail: string | null }

/** Renomear, reordenar (↑/↓), remover vídeos e apagar a playlist. */
export function PlaylistEditor({ playlist, initial }: { playlist: { id: string; name: string; description: string | null }; initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? '');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/playlists/${playlist.id}`;

  async function call(url: string, init: RequestInit) {
    setError(null);
    const r = await fetch(url, init).catch(() => null);
    if (!r?.ok) {
      setError((await r?.json().catch(() => ({})))?.error ?? 'Falha. Tente novamente.');
      return false;
    }
    return true;
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const prev = items;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
    const ok = await call(`${base}/videos`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoIds: next.map((x) => x.id) }) });
    if (!ok) setItems(prev);
  }

  async function remove(id: string) {
    const prev = items;
    setItems(items.filter((x) => x.id !== id));
    if (!(await call(`${base}/videos?videoId=${id}`, { method: 'DELETE' }))) setItems(prev);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await call(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description }) });
    setBusy(false);
    if (ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function destroy() {
    if (!confirm(`Apagar a playlist “${playlist.name}”? Os vídeos continuam na biblioteca.`)) return;
    if (await call(base, { method: 'DELETE' })) {
      router.replace('/playlists');
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <form onSubmit={save} className="card space-y-3 p-4">
          <div>
            <label className="label" htmlFor="pl-name">Nome</label>
            <input id="pl-name" className="input" value={name} maxLength={100} required onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pl-desc">Descrição</label>
            <textarea id="pl-desc" className="input min-h-20" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
            <button className="btn-primary" disabled={busy || !name.trim()}>Salvar</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold">{name}</h1>
            {description && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{description}</p>}
            <p className="mt-1 text-xs text-zinc-500">{items.length} {items.length === 1 ? 'vídeo' : 'vídeos'} · privada</p>
          </div>
          <div className="flex gap-2">
            {items[0] && <Link className="btn-primary" href={`/videos/${items[0].id}?pl=${playlist.id}`}>▶ Assistir</Link>}
            <button className="btn-ghost" onClick={() => setEditing(true)}>Editar</button>
            <button className="btn-danger" onClick={destroy}>Apagar</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!items.length ? (
        <div className="card p-6 text-center text-sm text-zinc-400">
          Playlist vazia. Abra um vídeo na <Link href="/" className="text-belt hover:underline">biblioteca</Link> e use “≡+ Playlist”.
        </div>
      ) : (
        <ol className="card divide-y divide-mat-700">
          {items.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 p-2 sm:p-3">
              <span className="w-5 shrink-0 text-center font-mono text-xs text-zinc-500">{i + 1}</span>
              <Link href={`/videos/${v.id}?pl=${playlist.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-mat-800 sm:w-32">
                  {v.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {v.duration != null && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 font-mono text-[10px]">{formatTimestamp(v.duration)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium">{v.title ?? 'Sem título'}</p>
                  {v.author && <p className="truncate text-xs text-zinc-400">{v.author}</p>}
                </div>
              </Link>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                <button className="btn-ghost px-2 py-1 text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Mover para cima">↑</button>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Mover para baixo">↓</button>
              </div>
              <button className="shrink-0 p-2 text-zinc-500 hover:text-red-400" onClick={() => remove(v.id)} aria-label="Remover da playlist" title="Remover da playlist">✕</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
