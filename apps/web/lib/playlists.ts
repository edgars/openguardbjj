import 'server-only';
import { HttpError } from './errors';
import { queryOne } from './db';

export const MAX_PLAYLISTS = 200;
export const MAX_PLAYLIST_VIDEOS = 1000;

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new HttpError(400, 'Dê um nome à playlist.');
  if (name.length > 100) throw new HttpError(400, 'Nome muito longo (máx. 100 caracteres).');
  return name;
}

export function cleanDescription(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new HttpError(400, 'Descrição inválida.');
  const d = raw.trim();
  if (d.length > 1000) throw new HttpError(400, 'Descrição muito longa (máx. 1000 caracteres).');
  return d || null;
}

/** Garante que a playlist pertence ao usuário (playlists são sempre privadas). */
export async function ownPlaylist(userId: string, playlistId: string) {
  const p = await queryOne<{ id: string }>('select id from playlists where id = $1 and user_id = $2', [playlistId, userId]);
  if (!p) throw new HttpError(404, 'Playlist não encontrada.');
  return p.id;
}
