import { assertUuid, HttpError, isUuid, json, readJson, withUser } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { getVideo } from '@/lib/data';
import { MAX_PLAYLIST_VIDEOS, ownPlaylist } from '@/lib/playlists';

/** Adiciona um vídeo ao fim da playlist. Idempotente. */
export const POST = withUser<{ pid: string }>(async (req, user, { pid }) => {
  assertUuid(pid, 'Playlist');
  const id = await ownPlaylist(user.id, pid);
  const { videoId } = await readJson<{ videoId?: string }>(req);
  if (!videoId || !isUuid(videoId)) throw new HttpError(400, 'Vídeo inválido.');
  await getVideo(user, videoId);
  await withTransaction(async (c) => {
    // Trava a playlist: limite e próxima posição consistentes com requisições paralelas.
    await c.query('select 1 from playlists where id = $1 for update', [id]);
    const n = await c.query<{ n: number }>('select count(*)::int as n from playlist_videos where playlist_id = $1', [id]);
    if ((n.rows[0]?.n ?? 0) >= MAX_PLAYLIST_VIDEOS) throw new HttpError(400, `Limite de ${MAX_PLAYLIST_VIDEOS} vídeos por playlist.`);
    await c.query(
      `insert into playlist_videos (playlist_id, video_id, position)
       values ($1, $2, (select coalesce(max(position), -1) + 1 from playlist_videos where playlist_id = $1))
       on conflict do nothing`,
      [id, videoId],
    );
    await c.query('update playlists set updated_at = now() where id = $1', [id]);
  });
  return json({ ok: true }, 201);
});

/** Remove um vídeo: ?videoId=… */
export const DELETE = withUser<{ pid: string }>(async (req, user, { pid }) => {
  assertUuid(pid, 'Playlist');
  const id = await ownPlaylist(user.id, pid);
  const videoId = new URL(req.url).searchParams.get('videoId') ?? '';
  if (!isUuid(videoId)) throw new HttpError(400, 'Vídeo inválido.');
  await query('delete from playlist_videos where playlist_id = $1 and video_id = $2', [id, videoId]);
  await query('update playlists set updated_at = now() where id = $1', [id]);
  return json({ ok: true });
});

/**
 * Reordena: { videoIds: [...] } na nova ordem. Vídeos da playlist que não vieram na lista
 * (ex.: ocultos ao usuário por estarem em reprocessamento) vão para o fim, na ordem relativa atual.
 */
export const PUT = withUser<{ pid: string }>(async (req, user, { pid }) => {
  assertUuid(pid, 'Playlist');
  const id = await ownPlaylist(user.id, pid);
  const { videoIds } = await readJson<{ videoIds?: unknown }>(req);
  if (!Array.isArray(videoIds) || videoIds.length > MAX_PLAYLIST_VIDEOS || !videoIds.every((v) => typeof v === 'string' && isUuid(v))) {
    throw new HttpError(400, 'Lista de vídeos inválida.');
  }
  await withTransaction(async (c) => {
    await c.query('select 1 from playlists where id = $1 for update', [id]);
    await c.query(
      `with given as (
         select video_id, ord - 1 as pos from unnest($2::uuid[]) with ordinality as o(video_id, ord)
       ), rest as (
         select pv.video_id, cardinality($2::uuid[]) + row_number() over (order by pv.position, pv.added_at) - 1 as pos
           from playlist_videos pv where pv.playlist_id = $1 and pv.video_id <> all($2::uuid[])
       ), target as (select * from given union all select * from rest)
       update playlist_videos pv set position = t.pos from target t
        where pv.playlist_id = $1 and pv.video_id = t.video_id`,
      [id, videoIds],
    );
    await c.query('update playlists set updated_at = now() where id = $1', [id]);
  });
  return json({ ok: true });
});
