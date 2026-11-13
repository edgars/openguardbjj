import { assertUuid, HttpError, json, withUser } from '@/lib/api';
import { getVideo, playbackUrls } from '@/lib/data';

/**
 * Renova as URLs pré-assinadas (o player chama quando a URL expira).
 * ?redirect=thumbnail → 302 direto para a imagem (uso em <img>).
 */
export const GET = withUser<{ id: string }>(async (req, user, { id }) => {
  assertUuid(id);
  const video = await getVideo(user, id);
  const urls = await playbackUrls(video);
  const redirect = new URL(req.url).searchParams.get('redirect');
  if (redirect === 'thumbnail' || redirect === 'video') {
    const target = urls[redirect];
    if (!target) throw new HttpError(404, 'Arquivo não disponível.');
    return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'private, max-age=600' } });
  }
  if (!urls.video) throw new HttpError(404, 'O arquivo de vídeo não está armazenado.');
  return json({ ...urls, proxy: `/api/videos/${video.id}/stream` });
});
