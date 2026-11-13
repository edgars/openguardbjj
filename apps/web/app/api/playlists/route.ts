import { HttpError, isUuid, json, readJson, withUser } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { getVideo, listPlaylists } from '@/lib/data';
import { cleanDescription, cleanName, MAX_PLAYLISTS } from '@/lib/playlists';

export const GET = withUser(async (_req, user) => json({ playlists: await listPlaylists(user) }));

/** Cria uma playlist; com `videoId`, já adiciona o vídeo (atalho do player). */
export const POST = withUser(async (req, user) => {
  const body = await readJson<{ name?: string; description?: string | null; videoId?: string }>(req);
  const name = cleanName(body.name);
  const description = cleanDescription(body.description);
  if (body.videoId != null) {
    if (!isUuid(body.videoId)) throw new HttpError(400, 'Vídeo inválido.');
    await getVideo(user, body.videoId); // 404 se o usuário não pode ver o vídeo
  }
  const playlist = await withTransaction(async (c) => {
    // Trava a linha do usuário: o limite vale mesmo com requisições paralelas.
    await c.query('select 1 from users where id = $1 for update', [user.id]);
    const count = await c.query<{ n: number }>('select count(*)::int as n from playlists where user_id = $1', [user.id]);
    if ((count.rows[0]?.n ?? 0) >= MAX_PLAYLISTS) throw new HttpError(400, `Limite de ${MAX_PLAYLISTS} playlists atingido.`);
    const { rows } = await c.query<{ id: string; name: string; description: string | null }>(
      'insert into playlists (user_id, name, description) values ($1, $2, $3) returning id, name, description',
      [user.id, name, description],
    );
    if (body.videoId) await c.query('insert into playlist_videos (playlist_id, video_id, position) values ($1, $2, 0)', [rows[0]!.id, body.videoId]);
    return rows[0]!;
  });
  return json(playlist, 201);
});
