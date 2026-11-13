import { nameSlug, normalizeName, sameName } from '@bjj/core/names';
import { assertUuid, HttpError, json, readJson, withAdmin } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { getVideo } from '@/lib/data';

/**
 * Admin informa o professor à mão: reaproveita um professor existente (nome tolerante a variações)
 * ou cria um novo com perfil pendente — o worker completa o perfil no laço ocioso.
 */
export const POST = withAdmin<{ id: string }>(async (req, admin, { id }) => {
  assertUuid(id);
  const video = await getVideo(admin, id);
  const { name: raw } = await readJson<{ name?: string }>(req);
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (normalizeName(name).split(' ').length < 2 || name.length > 80) throw new HttpError(400, 'Informe nome e sobrenome (até 80 caracteres).');

  const existing = await query<{ id: string; name: string }>('select id, name from instructors');
  let instructorId = existing.find((e) => sameName(e.name, name))?.id;
  if (!instructorId) {
    const row = await queryOne<{ id: string }>(
      `insert into instructors (slug, name) values ($1, $2)
       on conflict (slug) do update set updated_at = instructors.updated_at returning id`,
      [nameSlug(name), name],
    );
    instructorId = row!.id;
  }
  await query(
    `insert into video_instructors (video_id, instructor_id, source, confidence, status, evidence)
     values ($1, $2, 'manual', 1, 'confirmed', 'Informado pelo admin')
     on conflict (video_id, instructor_id) do update set status = 'confirmed', source = 'manual', confidence = 1`,
    [video.id, instructorId],
  );
  return json({ ok: true, instructorId }, 201);
});
