import { assertUuid, json, withAdmin } from '@/lib/api';
import { getStatus } from '@/lib/data';

/** Polling leve do frontend (sem conexões abertas durante o processamento). */
export const GET = withAdmin<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  return json(await getStatus(user, id));
});
