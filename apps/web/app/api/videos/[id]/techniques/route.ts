import { assertUuid, HttpError, json, readJson, withAdmin } from '@/lib/api';
import { queryOne, withTransaction } from '@/lib/db';
import { getVideo } from '@/lib/data';

/**
 * Admin adiciona uma técnica/posição do catálogo ao vídeo (fonte 'manual', preservada em
 * reprocessamentos). Opcionalmente no momento `start` (segundos). Desfaz uma rejeição anterior.
 */
export const POST = withAdmin<{ id: string }>(async (req, admin, { id }) => {
  assertUuid(id);
  const video = await getVideo(admin, id);
  const body = await readJson<{ slug?: string; start?: number | null }>(req);
  const slug = String(body.slug ?? '');
  const tech = await queryOne<{ id: number }>('select id from techniques where slug = $1', [slug]);
  if (!tech) throw new HttpError(400, 'Técnica não encontrada no catálogo.');
  let start: number | null = null;
  if (body.start != null) {
    start = Number(body.start);
    const max = video.duration_seconds ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(start) || start < 0 || start > max) throw new HttpError(400, 'Momento inválido.');
    start = Math.round(start * 100) / 100;
  }

  const row = await withTransaction(async (c) => {
    // Serializa com outras edições e com a reanálise do worker (mesmo lock por vídeo).
    await c.query(`select pg_advisory_xact_lock(hashtext('video_techniques:' || $1::text))`, [video.id]);
    await c.query('delete from video_technique_rejections where video_id = $1 and technique_id = $2', [video.id, tech.id]);
    // Sem momento: não duplica uma técnica que o vídeo já tem.
    const dup = await c.query(
      `select id from video_techniques where video_id = $1 and technique_id = $2
         and (start_seconds is not distinct from $3::numeric or $3::numeric is null) limit 1`,
      [video.id, tech.id, start],
    );
    if (dup.rows[0]) return { id: String(dup.rows[0].id), created: false };
    const ins = await c.query(
      `insert into video_techniques (video_id, technique_id, start_seconds, confidence, mentions, source, evidence)
       values ($1, $2, $3, 1, 1, 'manual', 'Adicionada pelo admin') returning id`,
      [video.id, tech.id, start],
    );
    return { id: String(ins.rows[0].id), created: true };
  });
  return json(row, row.created ? 201 : 200);
});
