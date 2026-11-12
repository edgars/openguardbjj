import { json, withUser } from '@/lib/api';
import { query } from '@/lib/db';

/** Status resumido dos vídeos em processamento (polling da biblioteca). ?ids=a,b,c */
export const GET = withUser(async (req, userId) => {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 100);
  if (!ids.length) return json({ videos: [] });
  const videos = await query(
    `select id, download_status, processing_progress, transcription_status, analysis_status, error_message
       from videos where user_id = $1 and id = any($2::uuid[])`,
    [userId, ids],
  );
  return json({ videos });
});
