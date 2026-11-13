import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { HttpError, isUuid } from '@/lib/api';
import { getPlaylist, playbackUrls } from '@/lib/data';
import { PlaylistEditor } from '@/components/PlaylistEditor';

export const dynamic = 'force-dynamic';

export default async function PlaylistPage({ params }: { params: Promise<{ pid: string }> }) {
  const user = await requireUser();
  const { pid } = await params;
  if (!isUuid(pid)) notFound();
  const { playlist, videos } = await getPlaylist(user, pid).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const items = await Promise.all(
    videos.map(async (v) => ({
      id: v.id,
      title: v.title,
      author: v.author,
      duration: v.duration_seconds,
      thumbnail: v.thumbnail_pathname ? (await playbackUrls({ blob_pathname: null, thumbnail_pathname: v.thumbnail_pathname })).thumbnail : null,
    })),
  );
  return (
    <div className="space-y-4">
      <Link href="/playlists" className="text-xs text-zinc-400 hover:text-zinc-200">← Playlists</Link>
      <PlaylistEditor playlist={playlist} initial={items} />
    </div>
  );
}
