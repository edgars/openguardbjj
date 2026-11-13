'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Row { id: string; name: string; status: 'suggested' | 'confirmed' | 'rejected'; source: string; confidence: number; evidence: string | null; profile_source: string }

const SOURCE: Record<string, string> = { metadata: 'descrição/título', author: 'perfil', transcript: 'fala', ai: 'IA', manual: 'manual' };

/** Revisão do admin: confirmar/rejeitar sugestões da IA ou informar o professor à mão. */
export function InstructorAdmin({ videoId, rows }: { videoId: string; rows: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError(null);
    const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
    setBusy(null);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? 'Falha.');
    router.refresh();
  }

  return (
    <section className="card space-y-3 p-4 text-sm">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">Professor do vídeo</h2>
        <span className="text-xs text-zinc-500">só confirmados aparecem ao público</span>
      </div>
      {!rows.length && <p className="text-zinc-400">Nenhum professor identificado no post.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-mat-700 p-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.name}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase ${r.status === 'confirmed' ? 'bg-emerald-950 text-emerald-300' : r.status === 'rejected' ? 'bg-red-950 text-red-300' : 'bg-mat-700 text-zinc-300'}`}>
                  {r.status === 'confirmed' ? 'confirmado' : r.status === 'rejected' ? 'rejeitado' : 'sugestão'}
                </span>
              </p>
              <p className="truncate text-xs text-zinc-500">
                {SOURCE[r.source] ?? r.source} · {Math.round(r.confidence * 100)}%{r.evidence ? ` · “${r.evidence}”` : ''}
              </p>
            </div>
            {r.status !== 'confirmed' && (
              <button className="btn-primary px-2 py-1 text-xs" disabled={!!busy}
                onClick={() => call(r.id, `/api/videos/${videoId}/instructors/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) })}>Confirmar</button>
            )}
            {r.status !== 'rejected' && (
              <button className="btn-ghost px-2 py-1 text-xs" disabled={!!busy}
                onClick={() => call(r.id, `/api/videos/${videoId}/instructors/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) })}>Rejeitar</button>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) call('new', `/api/videos/${videoId}/instructors`, { method: 'POST', body: JSON.stringify({ name }) }).then(() => setName('')); }}>
        <input className="input min-w-0 py-1.5" placeholder="Informar professor (nome e sobrenome)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button className="btn-ghost" disabled={busy === 'new' || !name.trim()}>Adicionar</button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
