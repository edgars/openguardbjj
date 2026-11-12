'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PIPELINE_SEQUENCE, STAGE_LABEL_PT, type VideoStage } from '@bjj/core/status';
import { formatBytes } from '@bjj/core/format';

export interface StatusPayload {
  video: {
    id: string;
    title: string | null;
    download_status: VideoStage;
    processing_progress: number;
    transcription_status: string;
    analysis_status: string;
    error_message: string | null;
    file_size_bytes: number | null;
    has_video: boolean;
  };
  job: {
    id: string;
    kind: string;
    status: string;
    stage: string | null;
    progress: number;
    attempts: number;
    max_attempts: number;
    bytes_downloaded: number | null;
    bytes_total: number | null;
    cancel_requested: boolean;
    next_attempt_at: string;
    error_message: string | null;
  } | null;
  worker: { online: boolean };
}

const POLL_MS = 2000;

/**
 * Acompanha um processamento por polling curto (GET /status a cada 2 s).
 * Nenhuma conexão HTTP fica aberta durante o processamento.
 */
export function ImportStatus({ videoId, onFinished, showOpenLink = true }: { videoId: string; onFinished?: (s: StatusPayload) => void; showOpenLink?: boolean }) {
  const [s, setS] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finishedRef = useRef(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/videos/${videoId}/status`, { cache: 'no-store' }).catch(() => null);
    if (!r) return setError('Sem conexão com o servidor.');
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    setError(null);
    const data = (await r.json()) as StatusPayload;
    setS(data);
    return data;
  }, [videoId]);

  const active = !s || !!(s.job && (s.job.status === 'PENDING' || s.job.status === 'RUNNING'));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const loop = async () => {
      const data = await load();
      if (!alive) return;
      const stillActive = !data || !!(data.job && (data.job.status === 'PENDING' || data.job.status === 'RUNNING'));
      if (stillActive) {
        finishedRef.current = false;
        timer = setTimeout(loop, POLL_MS);
      } else if (!finishedRef.current) {
        finishedRef.current = true;
        onFinished?.(data);
      }
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [load, onFinished, tick]);

  async function act(path: 'cancel' | 'retry') {
    setBusy(true);
    const r = await fetch(`/api/videos/${videoId}/${path}`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'Falha.');
    setTick((t) => t + 1);
  }

  if (!s) return <p className="text-sm text-zinc-400">{error ?? 'Carregando status…'}</p>;

  const stage = s.video.download_status;
  const currentIdx = PIPELINE_SEQUENCE.indexOf(stage);
  const failed = stage === 'FAILED' || stage === 'CANCELLED';
  const job = s.job;
  const waitingWorker = job?.status === 'PENDING' && !s.worker.online;
  const retryAt = job?.status === 'PENDING' && job.attempts > 0 ? new Date(job.next_attempt_at) : null;
  const message = s.video.error_message ?? (failed ? job?.error_message : null);
  const skipped = (st: VideoStage) =>
    (st === 'TRANSCRIBING' && s.video.transcription_status === 'NOT_REQUESTED') ||
    (st === 'ANALYZING' && s.video.analysis_status === 'NOT_REQUESTED');

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-medium">{STAGE_LABEL_PT[stage]}</span>
          <span className="tabular-nums text-zinc-400">{failed ? '—' : `${s.video.processing_progress}%`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-mat-700">
          <div
            className={`h-full transition-all ${failed ? 'bg-red-500' : stage === 'COMPLETED' ? 'bg-emerald-500' : 'bg-belt'}`}
            style={{ width: `${failed ? 100 : s.video.processing_progress}%` }}
          />
        </div>
        {job?.status === 'RUNNING' && (
          <p className="mt-1 text-xs text-zinc-400">
            Etapa atual: {job.progress}%
            {job.bytes_downloaded != null && (
              <> · {formatBytes(job.bytes_downloaded)}{job.bytes_total ? ` de ${formatBytes(job.bytes_total)}` : ''}</>
            )}
            {job.attempts > 1 && <> · tentativa {job.attempts}/{job.max_attempts}</>}
          </p>
        )}
        {s.video.file_size_bytes != null && <p className="mt-1 text-xs text-zinc-400">Arquivo armazenado: {formatBytes(s.video.file_size_bytes)}</p>}
      </div>

      <ol className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {PIPELINE_SEQUENCE.map((st, i) => {
          const done = stage === 'COMPLETED' || (currentIdx > i && !failed);
          const current = st === stage;
          return (
            <li key={st} className={`flex items-center gap-2 ${skipped(st) ? 'text-zinc-600 line-through' : current ? 'text-belt' : done ? 'text-zinc-300' : 'text-zinc-500'}`}>
              <span className="w-4 text-center">{done ? '✓' : current ? '●' : '○'}</span>
              <span className="font-mono text-xs">{st}</span>
            </li>
          );
        })}
        {failed && (
          <li className="flex items-center gap-2 text-red-400">
            <span className="w-4 text-center">✕</span>
            <span className="font-mono text-xs">{stage}</span>
          </li>
        )}
      </ol>

      {waitingWorker && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
          Nenhum worker ativo. O job está salvo na fila e começa assim que você iniciar o worker:
          <code className="mt-1 block font-mono text-xs">npm run worker</code>
        </div>
      )}
      {retryAt && !failed && (
        <p className="text-xs text-amber-300">Nova tentativa automática após {retryAt.toLocaleTimeString()}.</p>
      )}
      {job?.cancel_requested && job.status === 'RUNNING' && <p className="text-xs text-zinc-400">Cancelamento solicitado — aguardando o worker interromper…</p>}
      {message && (
        <pre className={`whitespace-pre-wrap rounded-md border p-3 text-xs ${failed ? 'border-red-900 bg-red-950/40 text-red-200' : 'border-mat-600 text-zinc-300'}`}>
          {message}
        </pre>
      )}
      {s.video.transcription_status === 'FAILED' && stage === 'COMPLETED' && job?.error_message && (
        <p className="text-xs text-amber-300">{job.error_message}</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {active && job && !job.cancel_requested && (
          <button className="btn-danger" disabled={busy} onClick={() => act('cancel')}>Cancelar</button>
        )}
        {failed && (
          <button className="btn-primary" disabled={busy} onClick={() => act('retry')}>Tentar novamente</button>
        )}
        {stage === 'COMPLETED' && showOpenLink && (
          <Link className="btn-primary" href={`/videos/${videoId}`}>Abrir vídeo</Link>
        )}
      </div>
    </div>
  );
}
