'use client';

import { useEffect, useRef, useState } from 'react';

interface Item { id: string; name: string; has_video: boolean }

/** Menu "Salvar em playlist": marca/desmarca playlists e cria uma nova já com o vídeo. */
export function AddToPlaylist({ videoId, initial }: { videoId: string; initial: Item[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle(p: Item) {
    setBusy(p.id);
    setError(null);
    const r = p.has_video
      ? await fetch(`/api/playlists/${p.id}/videos?videoId=${videoId}`, { method: 'DELETE' })
      : await fetch(`/api/playlists/${p.id}/videos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoId }) });
    setBusy(null);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? 'Falha.');
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, has_video: !p.has_video } : x)));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('new');
    setError(null);
    const r = await fetch('/api/playlists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, videoId }) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(data.error ?? 'Falha.');
    setItems((prev) => [...prev, { id: data.id, name: data.name, has_video: true }].sort((a, b) => a.name.localeCompare(b.name)));
    setName('');
  }

  const count = items.filter((i) => i.has_video).length;

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ≡+ Playlist{count > 0 && <span className="text-belt">({count})</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-mat-600 bg-mat-900 p-2 shadow-xl sm:left-auto sm:right-0">
          <p className="px-2 pb-1 pt-1 text-xs uppercase tracking-wide text-zinc-500">Salvar em…</p>
          <ul className="max-h-64 overflow-y-auto">
            {items.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-mat-800">
                  <input type="checkbox" checked={p.has_video} disabled={busy === p.id} onChange={() => toggle(p)} />
                  <span className="truncate">{p.name}</span>
                </label>
              </li>
            ))}
            {!items.length && <li className="px-2 py-2 text-sm text-zinc-400">Nenhuma playlist ainda.</li>}
          </ul>
          <form onSubmit={create} className="mt-1 flex gap-2 border-t border-mat-700 pt-2">
            <input className="input min-w-0 py-1.5" placeholder="Nova playlist" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary" disabled={busy === 'new' || !name.trim()}>Criar</button>
          </form>
          {error && <p className="px-2 pt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
