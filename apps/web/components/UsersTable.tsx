'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRow } from '@/lib/data';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function UsersTable({ users, meId }: { users: UserRow[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setDisabled(u: UserRow, disabled: boolean) {
    if (disabled && !confirm(`Bloquear ${u.email}? A pessoa perde o acesso até ser desbloqueada.`)) return;
    setBusy(u.id);
    setError(null);
    const r = await fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disabled }) });
    setBusy(null);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? 'Falha.');
    router.refresh();
  }

  return (
    <div className="card">
      {error && <p className="border-b border-mat-700 p-3 text-sm text-red-400">{error}</p>}
      <ul className="divide-y divide-mat-700">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            {u.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image_url} alt="" className="h-9 w-9 shrink-0 rounded-full" />
            ) : (
              <div className="h-9 w-9 shrink-0 rounded-full bg-mat-700" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {u.name ?? u.email}
                {u.role === 'admin' && <span className="ml-2 rounded border border-belt/40 px-1.5 py-0.5 text-[10px] uppercase text-belt">admin</span>}
                {u.disabled && <span className="ml-2 rounded border border-red-900 px-1.5 py-0.5 text-[10px] uppercase text-red-300">bloqueado</span>}
              </p>
              <p className="truncate text-xs text-zinc-400">{u.email}</p>
              <p className="text-xs text-zinc-500">
                desde {fmt(u.created_at)} · último acesso {fmt(u.last_seen_at)} · {u.favorites} favoritos · {u.playlists} playlists
              </p>
            </div>
            {u.role !== 'admin' && u.id !== meId && (
              <button className={u.disabled ? 'btn-ghost' : 'btn-danger'} disabled={busy === u.id} onClick={() => setDisabled(u, !u.disabled)}>
                {u.disabled ? 'Desbloquear' : 'Bloquear'}
              </button>
            )}
          </li>
        ))}
        {!users.length && <li className="p-6 text-center text-sm text-zinc-500">Nenhum usuário.</li>}
      </ul>
    </div>
  );
}
