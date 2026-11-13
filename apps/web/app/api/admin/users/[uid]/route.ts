import { assertUuid, HttpError, json, readJson, withAdmin } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { SUPER_ADMIN_EMAIL } from '@/lib/auth';

/** Bloqueia/desbloqueia uma conta. O super admin e a própria conta não podem ser bloqueados. */
export const PATCH = withAdmin<{ uid: string }>(async (req, admin, { uid }) => {
  assertUuid(uid, 'Usuário');
  const { disabled } = await readJson<{ disabled?: unknown }>(req);
  if (typeof disabled !== 'boolean') throw new HttpError(400, 'Informe disabled: true|false.');
  if (uid === admin.id) throw new HttpError(400, 'Você não pode bloquear a própria conta.');
  const row = await queryOne<{ id: string; disabled: boolean }>(
    `update users set disabled = $2 where id = $1 and lower(email) <> $3 and role <> 'admin' returning id, disabled`,
    [uid, disabled, SUPER_ADMIN_EMAIL],
  );
  if (!row) throw new HttpError(404, 'Usuário não encontrado (ou é administrador).');
  return json(row);
});
