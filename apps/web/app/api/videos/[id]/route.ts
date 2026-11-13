import { getStorage } from '@bjj/core/storage';
import { assertUuid, HttpError, json, withAdmin } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { getVideo } from '@/lib/data';

/** Remove o vídeo da biblioteca: apaga todos os blobs e depois o registro (cascade). */
export const DELETE = withAdmin<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const video = await getVideo(user, id);

  // Cancela job pendente atomicamente; se o worker já reservou (RUNNING), recusa.
  const paths = await withTransaction(async (c) => {
    await c.query(
      `update download_jobs set status = 'CANCELLED', completed_at = now(), error_message = 'Vídeo apagado'
        where video_id = $1 and status = 'PENDING'`,
      [video.id],
    );
    const running = await c.query(`select 1 from download_jobs where video_id = $1 and status = 'RUNNING' for update`, [video.id]);
    if (running.rowCount) throw new HttpError(409, 'Processamento em andamento. Cancele antes de apagar.');
    const uploads = await c.query<{ p: string }>(
      `select distinct options->>'uploadPathname' as p from download_jobs where video_id = $1 and options ? 'uploadPathname'`,
      [video.id],
    );
    const del = await c.query(`delete from videos where id = $1 returning blob_pathname, audio_pathname, thumbnail_pathname`, [video.id]);
    const row = del.rows[0] ?? {};
    return [row.blob_pathname, row.audio_pathname, row.thumbnail_pathname, ...uploads.rows.map((r) => r.p)].filter((p): p is string => !!p);
  });

  const storage = getStorage();
  for (const p of paths) await storage.deleteAsset(p).catch(() => {});
  return json({ ok: true, deletedAssets: paths.length });
});
