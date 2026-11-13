import Link from 'next/link';

/** Barra "tocando da playlist" com anterior/próximo (quando o vídeo foi aberto com ?pl=). */
export function PlaylistNav({ pl, name, ids, current }: { pl: string; name: string; ids: string[]; current: string }) {
  const i = ids.indexOf(current);
  if (i < 0) return null;
  const prev = ids[i - 1];
  const next = ids[i + 1];
  return (
    <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
      <Link href={`/playlists/${pl}`} className="min-w-0 flex-1 truncate px-1 text-zinc-300 hover:text-belt">
        ≡ {name} <span className="text-zinc-500">· {i + 1}/{ids.length}</span>
      </Link>
      {prev ? <Link className="btn-ghost" href={`/videos/${prev}?pl=${pl}`}>← Anterior</Link> : null}
      {next ? <Link className="btn-primary" href={`/videos/${next}?pl=${pl}`}>Próximo →</Link> : null}
    </div>
  );
}
