import { hostname } from 'node:os';
import { query, queryOne } from '@bjj/core/db';
import type { JobKind, JobOptions, VideoStage } from '@bjj/core/status';
import { overallProgress } from '@bjj/core/status';
import { config } from './config.ts';

export interface JobRow {
  id: string;
  video_id: string;
  kind: JobKind;
  status: string;
  attempts: number;
  max_attempts: number;
  options: JobOptions;
  cancel_requested: boolean;
}

/**
 * Reserva atômica: um único UPDATE com SELECT ... FOR UPDATE SKIP LOCKED.
 * Dois workers nunca pegam o mesmo job. Jobs RUNNING com lease expirado
 * (worker morreu) voltam a ser elegíveis. Jobs PENDING com cancelamento pedido
 * também são reservados — para serem finalizados como CANCELLED (nunca ficam presos).
 */
export async function claimJob(): Promise<JobRow | null> {
  return queryOne<JobRow>(
    `update download_jobs j
        set status = 'RUNNING', worker_id = $1, attempts = j.attempts + 1,
            lease_expires_at = now() + make_interval(secs => $2),
            started_at = coalesce(j.started_at, now()), error_message = null
      where j.id = (
        select id from download_jobs
         where (status = 'PENDING' and (next_attempt_at <= now() or cancel_requested))
            or (status = 'RUNNING' and lease_expires_at < now())
         order by cancel_requested desc, created_at
         for update skip locked
         limit 1)
      returning j.id, j.video_id, j.kind, j.status, j.attempts, j.max_attempts, j.options, j.cancel_requested`,
    [config.workerId, config.leaseSeconds],
  );
}

/** Renova o lease. Retorna null se o job não pertence mais a este worker. */
export async function extendLease(jobId: string): Promise<{ cancel_requested: boolean } | null> {
  return queryOne(
    `update download_jobs set lease_expires_at = now() + make_interval(secs => $3)
      where id = $1 and worker_id = $2 and status = 'RUNNING'
      returning cancel_requested`,
    [jobId, config.workerId, config.leaseSeconds],
  );
}

export async function heartbeat(currentJobs: string[]) {
  await query(
    `insert into worker_heartbeats (worker_id, hostname, version, current_job, capabilities, last_seen_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (worker_id) do update set last_seen_at = now(), current_job = excluded.current_job,
       capabilities = excluded.capabilities, version = excluded.version`,
    [config.workerId, hostname(), config.version, currentJobs[0] ?? null, { concurrency: config.concurrency, whisperModel: config.whisperModel }],
  );
}

export async function removeHeartbeat() {
  await query('delete from worker_heartbeats where worker_id = $1', [config.workerId]);
}

// Escritas de progresso em voo, por job — aguardadas antes de qualquer transição terminal.
const inflight = new Map<string, Set<Promise<unknown>>>();

export async function drainProgress(jobId: string) {
  const set = inflight.get(jobId);
  if (set?.size) await Promise.allSettled([...set]);
  inflight.delete(jobId);
}

/**
 * Atualiza etapa/progresso do job e do vídeo num ÚNICO statement, condicionado a o job
 * ainda estar RUNNING e pertencer a este worker. Escritas atrasadas nunca sobrescrevem
 * um status terminal (COMPLETED/FAILED/CANCELLED).
 */
export function setStage(
  job: JobRow,
  stage: VideoStage,
  stagePercent: number,
  extra: { bytesDownloaded?: number | null; bytesTotal?: number | null } = {},
): Promise<void> {
  const pct = Math.round(Math.max(0, Math.min(100, stagePercent)));
  const p = query(
    `with j as (
       update download_jobs set stage = $2, progress = $3,
           bytes_downloaded = coalesce($4, bytes_downloaded), bytes_total = coalesce($5, bytes_total)
        where id = $1 and worker_id = $6 and status = 'RUNNING'
        returning video_id)
     update videos set download_status = $2, processing_progress = $7, error_message = null
      where id = (select video_id from j)`,
    [job.id, stage, pct, extra.bytesDownloaded ?? null, extra.bytesTotal ?? null, config.workerId, overallProgress(stage, pct)],
  ).then(() => undefined);
  const set = inflight.get(job.id) ?? new Set();
  set.add(p);
  inflight.set(job.id, set);
  p.finally(() => set.delete(p)).catch(() => {});
  return p;
}

/** Transição terminal do job guardada por posse (worker_id + RUNNING). Retorna false se o job já não é nosso. */
async function finishJob(job: JobRow, sets: string, params: unknown[] = []): Promise<boolean> {
  await drainProgress(job.id);
  const row = await queryOne(
    `update download_jobs set ${sets}, lease_expires_at = null
      where id = $1 and worker_id = $2 and status = 'RUNNING' returning id`,
    [job.id, config.workerId, ...params],
  );
  return !!row;
}

export async function completeJob(job: JobRow): Promise<boolean> {
  const ok = await finishJob(job, `status = 'COMPLETED', progress = 100, stage = 'COMPLETED', completed_at = now()`);
  if (ok) await query(`update videos set download_status = 'COMPLETED', processing_progress = 100 where id = $1`, [job.video_id]);
  return ok;
}

/** Desligamento gracioso: devolve o job à fila sem consumir tentativa. */
export async function releaseJob(job: JobRow): Promise<boolean> {
  const ok = await finishJob(job, `status = 'PENDING', worker_id = null, attempts = greatest(attempts - 1, 0), next_attempt_at = now()`);
  if (ok) {
    await query(
      `update videos set download_status = case when blob_pathname is not null and $2 not in ('INGEST','PROCESS_UPLOAD') then 'COMPLETED' else 'PENDING' end,
          error_message = 'Worker reiniciado; job devolvido à fila.' where id = $1`,
      [job.video_id, job.kind],
    );
  }
  return ok;
}

export async function cancelJob(job: JobRow): Promise<boolean> {
  return finishJob(job, `status = 'CANCELLED', completed_at = now(), error_message = 'Cancelado pelo usuário'`);
}

export async function failJob(job: JobRow, message: string, retryInSeconds: number | null): Promise<boolean> {
  return retryInSeconds != null
    ? finishJob(job, `status = 'PENDING', worker_id = null, next_attempt_at = now() + make_interval(secs => $4), error_message = $3`, [message, retryInSeconds])
    : finishJob(job, `status = 'FAILED', completed_at = now(), error_message = $3`, [message]);
}
