import { getStorage } from '@bjj/core/storage';
import { assertUuid, HttpError, json, withAdmin } from '@/lib/api';
import { query } from '@/lib/db';
import { activeJob, getVideo } from '@/lib/data';

/** Apaga arquivos do Blob: ?which=video | audio | both. Transcrição e técnicas são mantidas. */
export const DELETE = withAdmin<{ id: string }>(async (req, user, { id }) => {
  assertUuid(id);
  const which = new URL(req.url).searchParams.get('which');
  if (which !== 'video' && which !== 'audio' && which !== 'both') throw new HttpError(400, 'Use which=video|audio|both.');
  const video = await getVideo(user, id);
  if (await activeJob(video.id)) throw new HttpError(409, 'Há um processamento ativo. Cancele ou aguarde.');

  const storage = getStorage();
  if ((which === 'video' || which === 'both') && video.blob_pathname) {
    await storage.deleteAsset(video.blob_pathname);
    await query('update videos set video_blob_url = null, blob_pathname = null, file_size_bytes = null where id = $1', [video.id]);
  }
  if ((which === 'audio' || which === 'both') && video.audio_pathname) {
    await storage.deleteAsset(video.audio_pathname);
    await query('update videos set audio_blob_url = null, audio_pathname = null, audio_size_bytes = null where id = $1', [video.id]);
  }
  return json({ ok: true });
});
