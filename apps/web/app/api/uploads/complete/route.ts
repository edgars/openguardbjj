import { head } from '@vercel/blob';
import { QUALITIES, type Quality } from '@bjj/core/status';
import { HttpError, json, readJson, withUser } from '@/lib/api';
import { createVideoWithJob } from '@/lib/data';

interface CompleteBody {
  pathname?: string;
  title?: string;
  quality?: number;
  authorized?: boolean;
  transcribe?: boolean;
  analyze?: boolean;
}

/** Após o Client Upload: confirma que o blob existe e enfileira o processamento no worker. */
export const POST = withUser(async (req, userId) => {
  const body = await readJson<CompleteBody>(req);
  if (!body.pathname || !body.pathname.startsWith('uploads/')) throw new HttpError(400, 'Pathname inválido.');
  if (body.authorized !== true) throw new HttpError(400, 'Confirme a autorização para armazenar este arquivo.');
  const quality = Number(body.quality ?? 1080) as Quality;
  if (!QUALITIES.includes(quality)) throw new HttpError(400, 'Qualidade inválida.');

  const meta = await head(body.pathname).catch(() => null);
  if (!meta) throw new HttpError(404, 'Arquivo não encontrado no Blob — o upload terminou?');
  if (!meta.contentType.startsWith('video/')) throw new HttpError(400, 'O arquivo enviado não é um vídeo.');

  const transcribe = body.transcribe !== false;
  const analyze = body.analyze !== false;
  const { videoId, jobId } = await createVideoWithJob(
    userId,
    {
      platform: 'upload',
      sourceUrl: null,
      externalId: null,
      title: body.title?.trim().slice(0, 300) || body.pathname.split('/').pop() || 'Upload',
      quality,
      transcribe,
      analyze,
      authorized: true,
    },
    'PROCESS_UPLOAD',
    { quality, transcribe, analyze, uploadPathname: meta.pathname },
  );
  return json({ videoId, jobId }, 201);
});
