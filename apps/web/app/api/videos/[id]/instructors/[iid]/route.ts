import { assertUuid, HttpError, json, readJson, withAdmin } from '@/lib/api';
import { queryOne } from '@/lib/db';

/** Admin confirma ou rejeita a sugestão de professor (rejeitada não volta em reprocessamentos). */
export const PATCH = withAdmin<{ id: string; iid: string }>(async (req, _admin, { id, iid }) => {
  assertUuid(id);
  assertUuid(iid, 'Professor');
  const { status } = await readJson<{ status?: string }>(req);
  if (status !== 'confirmed' && status !== 'rejected' && status !== 'suggested') throw new HttpError(400, 'Status inválido.');
  const row = await queryOne(
    'update video_instructors set status = $3 where video_id = $1 and instructor_id = $2 returning status',
    [id, iid, status],
  );
  if (!row) throw new HttpError(404, 'Sugestão não encontrada.');
  return json(row);
});
