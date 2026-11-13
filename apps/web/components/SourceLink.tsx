const LABEL: Record<string, string> = {
  instagram: 'Ver no Instagram',
  youtube: 'Ver no YouTube',
  youtube_shorts: 'Ver no YouTube Shorts',
};

/** Botão para o post de origem (Instagram/YouTube). Uploads próprios não têm origem. */
export function SourceLink({ platform, url, author, className = '' }: { platform: string; url: string | null; author?: string | null; className?: string }) {
  if (!url || !/^https:\/\/(www\.)?(instagram\.com|youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(url)) return null;
  const label = LABEL[platform] ?? 'Ver post original';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn-ghost ${className}`}
      title={author ? `${label} — ${author}` : label}
    >
      <span aria-hidden>{platform === 'instagram' ? '◎' : '▶'}</span>
      {label}
      <span aria-hidden className="text-zinc-500">↗</span>
    </a>
  );
}
