export type Platform = 'youtube' | 'youtube_shorts' | 'instagram' | 'upload';

export type ParsedVideoUrl =
  | { ok: true; platform: Exclude<Platform, 'upload'>; externalId: string; normalizedUrl: string }
  | { ok: false; error: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,64}$/;

export function parseVideoUrl(raw: string): ParsedVideoUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'URL inválida.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Use uma URL http(s).' };
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = parts[0];
    if (id && YT_ID.test(id)) return yt('youtube', id);
    return { ok: false, error: 'Link youtu.be sem ID de vídeo válido.' };
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'shorts' && parts[1] && YT_ID.test(parts[1])) return yt('youtube_shorts', parts[1]);
    if ((parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') && parts[1] && YT_ID.test(parts[1])) {
      return yt('youtube', parts[1]);
    }
    if (parts[0] === 'watch') {
      const v = url.searchParams.get('v');
      if (v && YT_ID.test(v)) return yt('youtube', v);
    }
    if (parts[0] === 'playlist') return { ok: false, error: 'Playlists não são suportadas — envie a URL de um vídeo.' };
    return { ok: false, error: 'URL do YouTube sem ID de vídeo reconhecível.' };
  }

  if (host === 'instagram.com') {
    const kind = parts[0];
    const code = parts[1];
    if ((kind === 'reel' || kind === 'reels' || kind === 'p' || kind === 'tv') && code && IG_CODE.test(code)) {
      const path = kind === 'p' ? 'p' : kind === 'tv' ? 'tv' : 'reel';
      return { ok: true, platform: 'instagram', externalId: code, normalizedUrl: `https://www.instagram.com/${path}/${code}/` };
    }
    return { ok: false, error: 'URL do Instagram não aponta para um Reel/post de vídeo.' };
  }

  return { ok: false, error: 'Plataforma não suportada. Use YouTube, YouTube Shorts ou Instagram Reels.' };
}

function yt(platform: 'youtube' | 'youtube_shorts', id: string): ParsedVideoUrl {
  const normalizedUrl =
    platform === 'youtube_shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
  return { ok: true, platform, externalId: id, normalizedUrl };
}
