'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isTerminal } from '@bjj/core/status';

export function VideoActions({
  videoId,
  status,
  hasVideo,
  hasAudio,
  canRedownload,
}: {
  videoId: string;
  status: string;
  hasVideo: boolean;
  hasAudio: boolean;
  canRedownload: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const done = status === 'COMPLETED';

  async function call(path: string, init: RequestInit, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(data.error ?? `HTTP ${r.status}`);
    return data;
  }

  const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {done && (hasVideo || hasAudio) && (
          <button className="btn-ghost" disabled={busy} onClick={async () => {
            if (await call(`/api/videos/${videoId}/reprocess`, post({ kind: 'RETRANSCRIBE' }))) { setMsg('Retranscrição na fila (usa o arquivo já armazenado).'); router.refresh(); }
          }}>Reprocessar transcrição</button>
        )}
        {done && (
          <button className="btn-ghost" disabled={busy} onClick={async () => {
            if (await call(`/api/videos/${videoId}/reprocess`, post({ kind: 'REANALYZE' }))) { setMsg('Nova análise de técnicas na fila.'); router.refresh(); }
          }}>Reanalisar técnicas</button>
        )}
        {done && !hasVideo && canRedownload && (
          <button className="btn-primary" disabled={busy} onClick={async () => {
            if (await call(`/api/videos/${videoId}/retry`, { method: 'POST' })) router.refresh();
          }}>Baixar novamente</button>
        )}
        {isTerminal(status) && (
          <button className="btn-danger" disabled={busy} onClick={async () => {
            if (await call(`/api/videos/${videoId}`, { method: 'DELETE' }, 'Apagar o vídeo, áudio, miniatura, transcrição e notas? Isso remove os arquivos do Vercel Blob.')) {
              router.replace('/');
              router.refresh();
            }
          }}>Apagar</button>
        )}
      </div>
      {msg && <p className="text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
