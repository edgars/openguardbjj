'use client';

import { useState } from 'react';
import { formatBytes } from '@bjj/core/format';

interface Result {
  count: number;
  totalBytes: number;
  orphanBytes: number;
  orphans: Array<{ pathname: string; size: number }>;
}

/** Confere o uso real do store (list) contra o Neon e lista blobs órfãos. */
export function ReconcileButton() {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button className="btn-ghost" disabled={busy} onClick={async () => {
        setBusy(true);
        setErr(null);
        const r = await fetch('/api/storage/reconcile', { cache: 'no-store' });
        setBusy(false);
        if (r.ok) setRes(await r.json());
        else setErr((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      }}>{busy ? 'Conferindo…' : 'Conferir uso real no Blob'}</button>
      {res && (
        <span className="text-zinc-400">
          {res.count} blobs · {formatBytes(res.totalBytes)} no store
          {res.orphans.length > 0 ? ` · ${res.orphans.length} órfão(s) (${formatBytes(res.orphanBytes)}) sem registro no banco` : ' · sem órfãos'}
        </span>
      )}
      {err && <span className="text-red-400">{err}</span>}
    </div>
  );
}
