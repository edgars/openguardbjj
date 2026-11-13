import { isUuid, json, withAdmin } from '@/lib/api';
import { query } from '@/lib/db';

/** Status resumido dos vídeos em processamento (polling da biblioteca). ?ids=a,b,c */
export const GET = withAdmin(async (req) => {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(isUuid).slice(0, 100);
  if (!ids.length) return json({ videos: [] });
  const videos = await query(
    `select id, download_status, processing_progress, transcription_status, analysis_status, error_message
       from videos where id = any($1::uuid[])`,
    [ids],
  );
  return json({ videos });
});
