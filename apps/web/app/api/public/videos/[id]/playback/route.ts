import { isUuid, json } from '@/lib/api';
import { playbackUrls } from '@/lib/data';
import { getPublicVideo } from '@/lib/public';

/** Renova a URL pré-assinada do player público (somente vídeos concluídos). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: 'Vídeo não encontrado.' }, 404);
  const video = await getPublicVideo(id);
  if (!video?.blob_pathname) return json({ error: 'Vídeo não encontrado.' }, 404);
  const urls = await playbackUrls(video);
  if (!urls.video) return json({ error: 'Arquivo indisponível.' }, 404);
  return json({ video: urls.video, thumbnail: urls.thumbnail });
}
