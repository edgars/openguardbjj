import { assertUuid, json, withUser } from '@/lib/api';
import { query } from '@/lib/db';
import { getVideo } from '@/lib/data';

/** Favoritar / desfavoritar um vídeo da biblioteca (por usuário). Idempotente. */
export const POST = withUser<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const video = await getVideo(user, id);
  await query('insert into favorites (user_id, video_id) values ($1, $2) on conflict do nothing', [user.id, video.id]);
  return json({ favorite: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  await query('delete from favorites where user_id = $1 and video_id = $2', [user.id, id]);
  return json({ favorite: false });
});
