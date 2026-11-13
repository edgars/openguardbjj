'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewPlaylistForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await fetch('/api/playlists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(data.error ?? 'Falha ao criar.');
    setName('');
    router.push(`/playlists/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <input className="input min-w-0 flex-1 sm:max-w-sm" placeholder="Nome da nova playlist (ex.: Passagens de guarda)" value={name}
        maxLength={100} onChange={(e) => setName(e.target.value)} />
      <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? 'Criando…' : '+ Criar playlist'}</button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </form>
  );
}
