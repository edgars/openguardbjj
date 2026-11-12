import { json, withUser } from '@/lib/api';
import { query } from '@/lib/db';
import { workerStatus } from '@/lib/data';

export const GET = withUser(async () => {
  const [worker, queue] = await Promise.all([
    workerStatus(),
    query<{ status: string; n: number }>(`select status, count(*)::int as n from download_jobs where status in ('PENDING','RUNNING') group by status`),
  ]);
  return json({ ...worker, queue: Object.fromEntries(queue.map((q) => [q.status, q.n])) });
});
