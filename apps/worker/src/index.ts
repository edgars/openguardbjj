import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { query } from '@bjj/core/db';
import { getPool } from '@bjj/core/db';
import { VercelBlobStorageService } from '@bjj/core/storage';
import { assertRuntimeEnv, config } from './config.ts';
import { CancelledError, PermanentError, describe } from './errors.ts';
import { enrichPending } from './instructors.ts';
import { cancelJob, claimJob, completeJob, extendLease, failJob, heartbeat, releaseJob, removeHeartbeat, type JobRow } from './jobs.ts';
import { loadVideo, runPipeline } from './pipeline.ts';

assertRuntimeEnv();

const storage = new VercelBlobStorageService();
const active = new Map<string, AbortController>();
let stopping = false;

const log = (msg: string) => console.log(`${new Date().toISOString()} [${config.workerId}] ${msg}`);

/** Backoff exponencial com jitter: 30s, 60s, 120s... (máx. 30 min). */
const backoffSeconds = (attempt: number) => Math.min(1800, 30 * 2 ** Math.max(0, attempt - 1)) + Math.floor(Math.random() * 10);

async function processJob(job: JobRow) {
  const ac = new AbortController();
  active.set(job.id, ac);
  const dir = path.join(config.tmpRoot, job.id);
  const jlog = (m: string) => log(`job ${job.id.slice(0, 8)} (${job.kind}): ${m}`);
  const uploaded: string[] = [];

  // Lease + verificação de cancelamento a cada 10 s. Se o banco ficar inacessível por quase
  // todo o lease, aborta: outro worker vai assumir e não podemos continuar escrevendo.
  let leaseFailures = 0;
  const leaseTimer = setInterval(async () => {
    try {
      const r = await extendLease(job.id);
      leaseFailures = 0;
      if (!r) ac.abort('lease-lost');
      else if (r.cancel_requested) ac.abort('cancel');
    } catch (e) {
      leaseFailures++;
      jlog(`falha ao renovar lease (${leaseFailures}): ${(e as Error).message}`);
      if (leaseFailures * 10 >= config.leaseSeconds - 20) ac.abort('lease-lost');
    }
  }, 10_000);

  try {
    if (job.cancel_requested) ac.abort('cancel');
    if (ac.signal.aborted) throw new CancelledError(String(ac.signal.reason));
    if (job.attempts > job.max_attempts) throw new PermanentError(`Excedeu ${job.max_attempts} tentativas.`);
    await mkdir(dir, { recursive: true });
    const video = await loadVideo(job.video_id);
    jlog(`iniciado (tentativa ${job.attempts}/${job.max_attempts}) — ${video.source_url ?? 'upload'}`);
    await runPipeline({ job, video, dir, signal: ac.signal, storage, uploaded, log: jlog });
    if (await completeJob(job)) jlog('✔ concluído');
    else {
      jlog('job não pertence mais a este worker ao concluir — nada gravado');
      await deleteUnreferenced(uploaded);
    }
  } catch (err) {
    const reason = ac.signal.aborted ? String(ac.signal.reason) : null;
    if (reason === 'shutdown') {
      if (await releaseJob(job)) jlog('devolvido à fila (shutdown)');
    } else if (reason === 'lease-lost') {
      jlog('lease perdido — outro worker assumiu; abandonando sem alterar estado');
      await deleteUnreferenced(uploaded);
    } else if (reason === 'cancel' || err instanceof CancelledError || (await cancelRequested(job.id))) {
      // Também cobre o caso de o cancelamento chegar entre a falha e o próximo lease.
      await handleCancel(job, uploaded, jlog);
    } else {
      await handleFailure(job, err, jlog);
    }
  } finally {
    clearInterval(leaseTimer);
    active.delete(job.id);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function cancelRequested(jobId: string): Promise<boolean> {
  const r = await query<{ cancel_requested: boolean }>('select cancel_requested from download_jobs where id = $1', [jobId]).catch(() => []);
  return !!r[0]?.cancel_requested;
}

/** Remove blobs enviados por esta tentativa que nenhum registro do banco referencia. */
async function deleteUnreferenced(uploaded: string[]) {
  for (const assetId of uploaded) {
    const ref = await query('select 1 from videos where $1 in (blob_pathname, audio_pathname, thumbnail_pathname) limit 1', [assetId]).catch(() => [1]);
    if (!ref.length) await storage.deleteAsset(assetId).catch(() => {});
  }
}

async function handleCancel(job: JobRow, uploaded: string[], jlog: (m: string) => void) {
  if (!(await cancelJob(job))) return jlog('cancelamento ignorado: job já não pertence a este worker');
  // Apaga apenas o que ESTA tentativa enviou; o que tentativas anteriores já concluíram é mantido.
  for (const assetId of uploaded) await storage.deleteAsset(assetId).catch(() => {});
  const reprocessing = job.kind === 'RETRANSCRIBE' || job.kind === 'REANALYZE';
  await query(
    `update videos set
        video_blob_url = case when blob_pathname = any($2::text[]) then null else video_blob_url end,
        file_size_bytes = case when blob_pathname = any($2::text[]) then null else file_size_bytes end,
        blob_pathname = case when blob_pathname = any($2::text[]) then null else blob_pathname end,
        thumbnail_blob_url = case when thumbnail_pathname = any($2::text[]) then null else thumbnail_blob_url end,
        thumbnail_size_bytes = case when thumbnail_pathname = any($2::text[]) then null else thumbnail_size_bytes end,
        thumbnail_pathname = case when thumbnail_pathname = any($2::text[]) then null else thumbnail_pathname end,
        audio_blob_url = case when audio_pathname = any($2::text[]) then null else audio_blob_url end,
        audio_size_bytes = case when audio_pathname = any($2::text[]) then null else audio_size_bytes end,
        audio_pathname = case when audio_pathname = any($2::text[]) then null else audio_pathname end
      where id = $1`,
    [job.video_id, uploaded],
  );
  await query(
    `update videos set
        download_status = case when $2 or blob_pathname is not null then 'COMPLETED' else 'CANCELLED' end,
        processing_progress = case when $2 or blob_pathname is not null then 100 else 0 end,
        error_message = case when $2 then 'Reprocessamento cancelado.' else 'Cancelado pelo usuário.' end,
        transcription_status = case when transcription_status in ('PENDING','PROCESSING') then 'NOT_REQUESTED' else transcription_status end,
        analysis_status = case when analysis_status in ('PENDING','PROCESSING') then 'NOT_REQUESTED' else analysis_status end
      where id = $1`,
    [job.video_id, reprocessing],
  );
  jlog(`cancelado; ${uploaded.length} asset(s) desta tentativa removido(s) do Blob`);
}

async function handleFailure(job: JobRow, err: unknown, jlog: (m: string) => void) {
  const message = describe(err);
  // Erros de configuração do Blob (store inexistente, token inválido) não melhoram com retry.
  const blobConfig = /BlobStoreNotFoundError|BlobAccessError|BlobStoreSuspendedError/.test((err as Error)?.name ?? '') ||
    (/store does not exist|Access denied|token/i.test(message) && /Vercel Blob/i.test(message));
  const permanent = err instanceof PermanentError || blobConfig;
  const canRetry = !permanent && job.attempts < job.max_attempts;
  const delay = canRetry ? backoffSeconds(job.attempts) : null;
  if (!(await failJob(job, message, delay))) {
    return jlog(`falha ignorada (job já não pertence a este worker): ${message}`);
  }

  const reprocessing = job.kind === 'RETRANSCRIBE' || job.kind === 'REANALYZE';
  if (canRetry) {
    await query(`update videos set download_status = $3, error_message = $2 where id = $1`, [
      job.video_id,
      `Tentativa ${job.attempts}/${job.max_attempts} falhou: ${message}\nNova tentativa automática em ~${delay}s.`,
      reprocessing ? 'COMPLETED' : 'PENDING',
    ]);
  } else if (reprocessing) {
    await query(
      `update videos set download_status = 'COMPLETED', processing_progress = 100, error_message = $2,
          transcription_status = case when transcription_status in ('PENDING','PROCESSING') then 'FAILED' else transcription_status end,
          analysis_status = case when analysis_status in ('PENDING','PROCESSING') then 'FAILED' else analysis_status end
        where id = $1`,
      [job.video_id, message],
    );
  } else {
    await query(`update videos set download_status = 'FAILED', error_message = $2 where id = $1`, [job.video_id, message]);
  }
  jlog(`✖ ${canRetry ? `falha transitória, retry em ${delay}s` : 'falha definitiva'}: ${message}`);
}

/** Remove diretórios temporários de jobs abandonados (ex.: worker morto com kill -9) com mais de 12 h. */
async function cleanStaleTmp() {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  for (const name of await readdir(config.tmpRoot).catch(() => [] as string[])) {
    const p = path.join(config.tmpRoot, name);
    const st = await stat(p).catch(() => null);
    if (st?.isDirectory() && st.mtimeMs < cutoff) await rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  await mkdir(config.tmpRoot, { recursive: true });
  await cleanStaleTmp();
  log(`bjj-media-worker iniciado — concorrência ${config.concurrency}, poll ${config.pollIntervalMs}ms, tmp ${config.tmpRoot}`);

  const beat = async () => heartbeat([...active.keys()]).catch((e) => log(`heartbeat falhou: ${e.message}`));
  await beat();
  const hb = setInterval(beat, config.heartbeatMs);

  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log(`${sig} recebido — interrompendo ${active.size} job(s) e devolvendo à fila...`);
    for (const ac of active.values()) ac.abort('shutdown');
    const deadline = Date.now() + 20_000;
    while (active.size && Date.now() < deadline) await sleep(200);
    clearInterval(hb);
    await removeHeartbeat().catch(() => {});
    await getPool().end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  let lastEnrich = 0;
  while (!stopping) {
    if (active.size >= config.concurrency) {
      await sleep(1000);
      continue;
    }
    let job: JobRow | null = null;
    try {
      job = await claimJob();
    } catch (e) {
      log(`erro ao buscar jobs: ${(e as Error).message}`);
    }
    if (job && !stopping) void processJob(job);
    else {
      // Ocioso: completa perfis de professores pendentes (no máx. 1 rodada por minuto).
      if (!active.size && Date.now() - lastEnrich > 60_000) {
        lastEnrich = Date.now();
        await enrichPending(3, log).catch((e) => log(`perfis de professores: ${(e as Error).message}`));
      }
      await sleep(config.pollIntervalMs);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
