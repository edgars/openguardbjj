import { requireUser } from '@/lib/auth';
import { listVideos, playbackUrls } from '@/lib/data';
import { Library, type LibraryItem } from '@/components/Library';

export const dynamic = 'force-dynamic';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const { f } = await searchParams;
  const videos = await listVideos(user);
  const items: LibraryItem[] = await Promise.all(
    videos.map(async (v) => ({
      id: v.id,
      title: v.title,
      platform: v.platform,
      author: v.author,
      duration: v.duration_seconds,
      status: v.download_status,
      progress: v.processing_progress,
      hasVideo: !!v.blob_pathname,
      sizeBytes: v.file_size_bytes,
      transcription: v.transcription_status,
      techniques: v.techniques ?? [],
      thumbnail: v.thumbnail_pathname ? (await playbackUrls({ blob_pathname: null, thumbnail_pathname: v.thumbnail_pathname })).thumbnail : null,
      error: v.error_message,
      createdAt: v.created_at,
      favorite: v.is_favorite,
    })),
  );
  return <Library initial={items} isAdmin={user.role === 'admin'} initialFilter={f === 'favoritos' ? 'fav' : 'all'} />;
}
