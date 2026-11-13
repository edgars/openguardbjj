import { assertUuid, HttpError, json, readJson, withAdmin } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { getVideo } from '@/lib/data';

/** Reprocessa transcrição/análise a partir do áudio/vídeo já no Blob — sem baixar da origem. */
export const POST = withAdmin<{ id: string }>(async (req, user, { id }) => {
  assertUuid(id);
  const { kind = 'RETRANSCRIBE' } = await readJson<{ kind?: 'RETRANSCRIBE' | 'REANALYZE' }>(req);
  if (kind !== 'RETRANSCRIBE' && kind !== 'REANALYZE') throw new HttpError(400, 'Tipo inválido.');
  const video = await getVideo(user, id);
  if (video.download_status !== 'COMPLETED') throw new HttpError(409, 'Aguarde a conclusão do processamento atual.');
  if (kind === 'RETRANSCRIBE' && !video.audio_pathname && !video.blob_pathname) {
    throw new HttpError(400, 'Sem vídeo ou áudio armazenado para transcrever.');
  }
  const jobId = await withTransaction(async (c) => {
    await c.query(
      `update videos set analysis_status = 'PENDING', error_message = null,
          transcription_status = case when $2 = 'RETRANSCRIBE' then 'PENDING' else transcription_status end where id = $1`,
      [video.id, kind],
    );
    try {
      const r = await c.query<{ id: string }>('insert into download_jobs (video_id, kind, options) values ($1,$2,$3) returning id', [
        video.id, kind, { analyze: true },
      ]);
      return r.rows[0]!.id;
    } catch (err: any) {
      if (err?.code === '23505') throw new HttpError(409, 'Já existe um processamento ativo para este vídeo.');
      throw err;
    }
  });
  return json({ jobId }, 201);
});
