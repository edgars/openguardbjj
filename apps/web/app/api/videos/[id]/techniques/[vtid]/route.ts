import { assertUuid, HttpError, json, withAdmin } from '@/lib/api';
import { withTransaction } from '@/lib/db';

/**
 * Admin remove uma técnica do vídeo.
 * - Manual: apaga só aquela marcação.
 * - Automática (palavra-chave, IA, descrição): apaga todas as marcações automáticas dessa técnica
 *   no vídeo e registra a rejeição, para a reanálise do worker não recolocá-la.
 */
export const DELETE = withAdmin<{ id: string; vtid: string }>(async (_req, _admin, { id, vtid }) => {
  assertUuid(id);
  if (!/^\d{1,18}$/.test(vtid)) throw new HttpError(400, 'Técnica inválida.');
  await withTransaction(async (c) => {
    await c.query(`select pg_advisory_xact_lock(hashtext('video_techniques:' || $1::text))`, [id]);
    const { rows } = await c.query<{ technique_id: number; source: string }>(
      'delete from video_techniques where id = $1 and video_id = $2 returning technique_id, source',
      [vtid, id],
    );
    const removed = rows[0];
    if (!removed) throw new HttpError(404, 'Técnica não encontrada neste vídeo.');
    if (removed.source !== 'manual') {
      await c.query(`delete from video_techniques where video_id = $1 and technique_id = $2 and source <> 'manual'`, [id, removed.technique_id]);
      await c.query(
        'insert into video_technique_rejections (video_id, technique_id) values ($1, $2) on conflict do nothing',
        [id, removed.technique_id],
      );
    }
  });
  return json({ ok: true });
});
