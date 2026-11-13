import { head } from '@vercel/blob';
import type { JobKind, JobOptions } from '@bjj/core/status';
import { assertUuid, HttpError, json, withAdmin } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { getVideo, latestJob } from '@/lib/data';

/** Tenta novamente um import que falhou/cancelou, ou baixa de novo um MP4 apagado do storage. */
export const POST = withAdmin<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const video = await getVideo(user, id);
  const failed = video.download_status === 'FAILED' || video.download_status === 'CANCELLED';
  const missingFile = !video.blob_pathname && video.download_status === 'COMPLETED';
  if (!failed && !missingFile) throw new HttpError(409, 'Este vídeo não está em estado de falha.');

  const last = await latestJob(video.id);
  const options: JobOptions = { quality: video.requested_quality as 480 | 720 | 1080, transcribe: video.auto_transcribe, analyze: video.auto_analyze };
  let kind: JobKind;
  if (video.source_url) {
    if (!video.download_authorized) throw new HttpError(400, 'Download não autorizado para este vídeo.');
    kind = 'INGEST';
  } else if (last?.options?.uploadPathname && !video.blob_pathname) {
    if (!(await head(last.options.uploadPathname).catch(() => null))) {
      throw new HttpError(400, 'O arquivo enviado não está mais no storage. Envie-o novamente.');
    }
    kind = 'PROCESS_UPLOAD';
    options.uploadPathname = last.options.uploadPathname;
  } else {
    throw new HttpError(400, 'Não há origem para reprocessar. Envie o arquivo novamente.');
  }

  // Vídeo atualizado ANTES do insert do job, na mesma transação: o worker nunca vê o job sem o vídeo pronto.
  const jobId = await withTransaction(async (c) => {
    await c.query(
      `update videos set download_status = 'PENDING', processing_progress = 0, error_message = null,
          transcription_status = case when auto_transcribe then 'PENDING' else 'NOT_REQUESTED' end,
          analysis_status = case when auto_analyze then 'PENDING' else 'NOT_REQUESTED' end
        where id = $1`,
      [video.id],
    );
    try {
      const r = await c.query<{ id: string }>('insert into download_jobs (video_id, kind, options) values ($1,$2,$3) returning id', [video.id, kind, options]);
      return r.rows[0]!.id;
    } catch (err: any) {
      if (err?.code === '23505') throw new HttpError(409, 'Já existe um processamento ativo para este vídeo.');
      throw err;
    }
  });
  return json({ jobId }, 201);
});
