import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listPlaylists, playbackUrls } from '@/lib/data';
import { NewPlaylistForm } from '@/components/NewPlaylistForm';

export const dynamic = 'force-dynamic';

export default async function PlaylistsPage() {
  const user = await requireUser();
  const playlists = await listPlaylists(user);
  const covers = await Promise.all(
    playlists.map((p) => (p.cover_pathname ? playbackUrls({ blob_pathname: null, thumbnail_pathname: p.cover_pathname }).then((u) => u.thumbnail) : null)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Minhas playlists</h1>
        <Link href="/?f=favoritos" className="ml-auto text-sm text-belt hover:underline">★ Ver favoritos</Link>
      </div>
      <NewPlaylistForm />
      {!playlists.length ? (
        <div className="card p-6 text-center text-sm text-zinc-400 sm:p-10">
          Nenhuma playlist ainda. Crie uma acima ou use “≡+ Playlist” na página de um vídeo.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playlists.map((p, i) => (
            <li key={p.id} className="card overflow-hidden">
              <Link href={`/playlists/${p.id}`} className="block">
                <div className="relative aspect-video bg-mat-800">
                  {covers[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={covers[i]!} alt="" className="h-full w-full object-cover opacity-80" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-zinc-600">≡</div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
                    {p.video_count} {p.video_count === 1 ? 'vídeo' : 'vídeos'}
                  </span>
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 font-medium">{p.name}</p>
                  {p.description && <p className="line-clamp-2 text-xs text-zinc-400">{p.description}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
