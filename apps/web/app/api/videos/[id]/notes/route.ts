import { assertUuid, HttpError, json, readJson, withUser } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { getVideo } from '@/lib/data';

export const POST = withUser<{ id: string }>(async (req, userId, { id }) => {
  assertUuid(id);
  const { body, timestamp } = await readJson<{ body?: string; timestamp?: number | null }>(req);
  const text = body?.trim();
  if (!text) throw new HttpError(400, 'Nota vazia.');
  const video = await getVideo(userId, id);
  const ts = typeof timestamp === 'number' && Number.isFinite(timestamp) ? Math.max(0, timestamp) : null;
  const note = await queryOne(
    'insert into notes (video_id, user_id, timestamp_seconds, body) values ($1,$2,$3,$4) returning id, timestamp_seconds, body, created_at',
    [video.id, userId, ts, text.slice(0, 5000)],
  );
  return json(note, 201);
});
