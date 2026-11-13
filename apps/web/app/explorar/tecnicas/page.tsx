import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTION_CATEGORIES, POSITION_CATEGORIES, taxonomy, type TaxonomyCategory } from '@/lib/public';
import { catColor } from '@/components/PublicVideoGrid';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Taxonomia de técnicas · itaimjj',
  description: 'Guardas, posições, raspagens, passagens, finalizações, pegada de costas, quedas e saídas — com vídeos por técnica.',
};

const INTRO: Record<string, string> = {
  guard: 'Posições de baixo: de onde se ataca, raspa ou finaliza.',
  position: 'Posições de controle por cima e nas costas.',
  sweep: 'Inverter a posição a partir da guarda.',
  guard_pass: 'Vencer as pernas e estabilizar por cima.',
  submission: 'Estrangulamentos e chaves articulares.',
  back_take: 'Chegar às costas e estabelecer controle.',
  takedown: 'Levar a luta para o chão a partir da luta em pé.',
  escape: 'Sair de posições ruins.',
};

function CategoryBlock({ c }: { c: TaxonomyCategory }) {
  const withVideos = c.techniques.filter((t) => t.videos > 0);
  const empty = c.techniques.filter((t) => t.videos === 0);
  return (
    <section id={c.category} className="card scroll-mt-24 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold">{c.label}</h3>
        <Link href={`/explorar?cat=${c.category}`} className="text-xs text-belt hover:underline">{c.videos} {c.videos === 1 ? 'vídeo' : 'vídeos'} →</Link>
        <p className="w-full text-xs text-zinc-500">{INTRO[c.category]}</p>
      </div>
      {withVideos.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {withVideos.map((t) => (
            <li key={t.slug}>
              <Link href={`/explorar?tec=${t.slug}`} className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-sm ${catColor(t.category)} hover:bg-mat-800`}
                title={t.name_en}>
                {t.name_pt} <span className="rounded bg-mat-800 px-1 text-[11px] text-zinc-300">{t.videos}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {empty.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-zinc-500">{empty.length} técnicas ainda sem vídeo</summary>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">{empty.map((t) => t.name_pt).join(' · ')}</p>
        </details>
      )}
    </section>
  );
}

export default async function TaxonomyPage() {
  const tax = await taxonomy();
  const pick = (cats: string[]) => tax.categories.filter((c) => cats.includes(c.category));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Taxonomia de técnicas</h1>
        <p className="text-sm text-zinc-400">Organizada por tipo de posição e por ação. Toque numa técnica para ver os vídeos.</p>
        <nav className="mt-3 flex flex-wrap gap-2 text-xs">
          {tax.categories.map((c) => (
            <a key={c.category} href={`#${c.category}`} className="rounded-full border border-mat-600 px-2.5 py-1 text-zinc-300 hover:border-zinc-400">{c.label}</a>
          ))}
        </nav>
      </div>
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipos de posição</h2>
        <div className="grid gap-3 lg:grid-cols-2">{pick(POSITION_CATEGORIES).map((c) => <CategoryBlock key={c.category} c={c} />)}</div>
      </div>
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ações</h2>
        <div className="grid gap-3 lg:grid-cols-2">{pick(ACTION_CATEGORIES).map((c) => <CategoryBlock key={c.category} c={c} />)}</div>
      </div>
    </div>
  );
}
