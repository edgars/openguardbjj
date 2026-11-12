import { assertUuid, json, withUser } from '@/lib/api';
import { getStatus } from '@/lib/data';

/** Polling leve do frontend (sem conexões abertas durante o processamento). */
export const GET = withUser<{ id: string }>(async (_req, userId, { id }) => {
  assertUuid(id);
  return json(await getStatus(userId, id));
});
