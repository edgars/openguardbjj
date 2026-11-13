import { assertUuid, json, readJson, withUser } from '@/lib/api';
import { queryOne, query } from '@/lib/db';
import { cleanDescription, cleanName, ownPlaylist } from '@/lib/playlists';

/** Renomeia / altera descrição. */
export const PATCH = withUser<{ pid: string }>(async (req, user, { pid }) => {
  assertUuid(pid, 'Playlist');
  const id = await ownPlaylist(user.id, pid);
  const body = await readJson<{ name?: string; description?: string | null }>(req);
  const row = await queryOne(
    `update playlists set name = coalesce($2, name),
            description = case when $4 then $3 else description end, updated_at = now()
      where id = $1 returning id, name, description`,
    [id, body.name !== undefined ? cleanName(body.name) : null, cleanDescription(body.description), body.description !== undefined],
  );
  return json(row);
});

/** Apaga a playlist (os vídeos continuam na biblioteca). */
export const DELETE = withUser<{ pid: string }>(async (_req, user, { pid }) => {
  assertUuid(pid, 'Playlist');
  const id = await ownPlaylist(user.id, pid);
  await query('delete from playlists where id = $1', [id]);
  return json({ ok: true });
});
