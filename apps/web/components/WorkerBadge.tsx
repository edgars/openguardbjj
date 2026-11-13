'use client';

import { useEffect, useState } from 'react';

interface WorkerInfo {
  online: boolean;
  queue: { PENDING?: number; RUNNING?: number };
}

/** Indica se há um bjj-media-worker ativo (heartbeat < 60 s) e o tamanho da fila. */
export function WorkerBadge() {
  const [info, setInfo] = useState<WorkerInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch('/api/worker/status', { cache: 'no-store' }).catch(() => null);
      if (alive && r?.ok) setInfo(await r.json());
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!info) return null;
  const pending = info.queue.PENDING ?? 0;
  const running = info.queue.RUNNING ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs ${
        info.online ? 'border-emerald-800 text-emerald-300' : 'border-amber-800 text-amber-300'
      }`}
      title={info.online ? 'Worker ativo' : 'Nenhum worker ativo: jobs ficam na fila até um worker ser iniciado'}
    >
      <span className={`h-2 w-2 rounded-full ${info.online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <span><span className="hidden sm:inline">Worker </span>{info.online ? 'online' : 'offline'}</span>
      {(pending > 0 || running > 0) && (
        <span className="text-zinc-400">
          · {running}<span className="hidden sm:inline"> rodando</span> / {pending}<span className="hidden sm:inline"> na fila</span>
        </span>
      )}
    </span>
  );
}
