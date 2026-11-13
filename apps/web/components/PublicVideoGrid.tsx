import Link from 'next/link';
import { formatTimestamp } from '@bjj/core/format';
import { PLATFORM_LABEL, type PublicVideoCard } from '@/lib/public';

const CAT_COLOR: Record<string, string> = {
  guard: 'border-sky-800 text-sky-300',
  position: 'border-indigo-800 text-indigo-300',
  sweep: 'border-emerald-800 text-emerald-300',
  guard_pass: 'border-amber-800 text-amber-300',
  submission: 'border-red-900 text-red-300',
  back_take: 'border-fuchsia-800 text-fuchsia-300',
  takedown: 'border-orange-800 text-orange-300',
  escape: 'border-teal-800 text-teal-300',
};
export const catColor = (c: string) => CAT_COLOR[c] ?? 'border-mat-600 text-zinc-300';

export function PublicVideoGrid({ videos }: { videos: PublicVideoCard[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((v) => (
        <li key={v.id} className="card overflow-hidden">
          <Link href={`/explorar/v/${v.id}`} className="block">
            <div className="relative aspect-video bg-mat-800">
              {v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">sem miniatura</div>
              )}
              {v.duration != null && (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs">{formatTimestamp(v.duration)}</span>
              )}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-zinc-200">{PLATFORM_LABEL[v.platform] ?? v.platform}</span>
            </div>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 text-sm font-medium">{v.title ?? 'Sem título'}</p>
              {v.author && <p className="truncate text-xs text-zinc-400">{v.author}</p>}
              {v.techniques.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {v.techniques.slice(0, 5).map((t) => (
                    <span key={t.slug} className={`rounded border px-1.5 py-0.5 text-[11px] ${catColor(t.category)}`}>{t.name}</span>
                  ))}
                  {v.techniques.length > 5 && <span className="text-[11px] text-zinc-500">+{v.techniques.length - 5}</span>}
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
