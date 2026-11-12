import { assertUuid, HttpError, json, withUser } from '@/lib/api';
import { queryOne, query } from '@/lib/db';
import { getVideo } from '@/lib/data';

/**
 * Um único UPDATE decide o resultado (sem corrida com o worker):
 *  - job PENDING → CANCELLED na hora;
 *  - job RUNNING → cancel_requested; o worker interrompe em ≤10 s, apaga blobs parciais e confirma.
 * Se o worker devolver um job com cancel_requested à fila, o próximo claim o finaliza como cancelado.
 */
export const POST = withUser<{ id: string }>(async (_req, userId, { id }) => {
  assertUuid(id);
  const video = await getVideo(userId, id);
  const job = await queryOne<{ status: string; kind: string }>(
    `update download_jobs
        set cancel_requested = true,
            status = case when status = 'PENDING' then 'CANCELLED' else status end,
            completed_at = case when status = 'PENDING' then now() else completed_at end,
            error_message = case when status = 'PENDING' then 'Cancelado pelo usuário' else error_message end
      where video_id = $1 and status in ('PENDING','RUNNING')
      returning status, kind`,
    [video.id],
  );
  if (!job) throw new HttpError(409, 'Não há processamento em andamento para cancelar.');
  if (job.status === 'RUNNING') return json({ status: 'CANCELLING' }, 202);

  const reprocessing = job.kind === 'RETRANSCRIBE' || job.kind === 'REANALYZE';
  await query(
    `update videos set
        download_status = case when $2 or blob_pathname is not null then 'COMPLETED' else 'CANCELLED' end,
        processing_progress = case when $2 or blob_pathname is not null then 100 else 0 end,
        error_message = case when $2 then 'Reprocessamento cancelado.' else 'Cancelado pelo usuário.' end,
        transcription_status = case when transcription_status in ('PENDING','PROCESSING') then 'NOT_REQUESTED' else transcription_status end,
        analysis_status = case when analysis_status in ('PENDING','PROCESSING') then 'NOT_REQUESTED' else analysis_status end
      where id = $1`,
    [video.id, reprocessing],
  );
  return json({ status: 'CANCELLED' });
});
