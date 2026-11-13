import { QUALITIES, type Quality } from '@bjj/core/status';
import { parseVideoUrl } from '@bjj/core/url';
import { HttpError, json, readJson, withAdmin } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { createVideoWithJob, workerStatus } from '@/lib/data';

interface ImportBody {
  url?: string;
  quality?: number;
  authorized?: boolean;
  transcribe?: boolean;
  analyze?: boolean;
}

/**
 * Cria o registro do vídeo + job de download no Neon e retorna imediatamente.
 * Nenhum download acontece aqui: o bjj-media-worker reserva o job e processa.
 */
export const POST = withAdmin(async (req, user) => {
  const body = await readJson<ImportBody>(req);
  const parsed = parseVideoUrl(body.url ?? '');
  if (!parsed.ok) throw new HttpError(400, parsed.error);

  const quality = Number(body.quality ?? 720) as Quality;
  if (!QUALITIES.includes(quality)) throw new HttpError(400, 'Qualidade inválida (480, 720 ou 1080).');
  if (body.authorized !== true) {
    throw new HttpError(
      400,
      'Confirme que você tem autorização para baixar e armazenar este vídeo. Sem autorização, use "Enviar arquivo" com um arquivo próprio/autorizado.',
    );
  }

  const existing = await queryOne<{ id: string; download_status: string }>(
    `select id, download_status from videos
      where platform = $1 and external_id = $2 and download_status not in ('FAILED','CANCELLED')
      order by created_at desc limit 1`,
    [parsed.platform, parsed.externalId],
  );
  if (existing) return json({ videoId: existing.id, existing: true, status: existing.download_status }, 200);

  const transcribe = body.transcribe !== false;
  const analyze = body.analyze !== false;
  const { videoId, jobId } = await createVideoWithJob(
    user.id,
    {
      platform: parsed.platform,
      sourceUrl: parsed.normalizedUrl,
      externalId: parsed.externalId,
      quality,
      transcribe,
      analyze,
      authorized: true,
    },
    'INGEST',
    { quality, transcribe, analyze },
  );
  const worker = await workerStatus();
  return json({ videoId, jobId, workerOnline: worker.online }, 201);
});
