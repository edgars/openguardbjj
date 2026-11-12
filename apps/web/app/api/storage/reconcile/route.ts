import { list } from '@vercel/blob';
import { json, withUser } from '@/lib/api';
import { query } from '@/lib/db';

/**
 * Soma o uso REAL do Blob (via list) e aponta blobs órfãos (sem registro no Neon) —
 * útil para conferir o banco contra o storage e evitar custo com arquivos esquecidos.
 */
export const GET = withUser(async (_req, userId) => {
  const known = new Set(
    (
      await query<{ p: string }>(
        `select unnest(array[blob_pathname, audio_pathname, thumbnail_pathname]) as p from videos where user_id = $1
         union select options->>'uploadPathname' from download_jobs j join videos v on v.id = j.video_id
          where v.user_id = $1 and j.options ? 'uploadPathname'`,
        [userId],
      )
    )
      .map((r) => r.p)
      .filter(Boolean),
  );
  let cursor: string | undefined;
  let totalBytes = 0;
  let count = 0;
  const orphans: Array<{ pathname: string; size: number; uploadedAt: Date }> = [];
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const b of page.blobs) {
      count++;
      totalBytes += b.size;
      if (!known.has(b.pathname) && (b.pathname.startsWith('videos/') || b.pathname.startsWith('uploads/'))) {
        orphans.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return json({ count, totalBytes, orphans: orphans.slice(0, 200), orphanBytes: orphans.reduce((s, o) => s + o.size, 0) });
});
