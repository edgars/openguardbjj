import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTION_CATEGORIES, PLATFORM_LABEL, POSITION_CATEGORIES, categoryLabel, isCategory, searchPublic, taxonomy } from '@/lib/public';
import { PublicVideoGrid, catColor } from '@/components/PublicVideoGrid';
import { publicInstructors } from '@/lib/instructors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Explorar técnicas de Jiu-Jitsu · OpenGuard BJJ',
  description: 'Busque vídeos de Jiu-Jitsu por guarda, posição, raspagem, passagem, finalização e pegada de costas, com transcrição e timestamps.',
};

type SP = { q?: string; cat?: string; tec?: string; plat?: string; prof?: string };

/** Monta a URL mantendo os filtros atuais e trocando/removendo os informados. */
function href(cur: SP, patch: Partial<Record<keyof SP, string | null>>) {
  const p = new URLSearchParams();
  const next = { ...cur, ...patch };
  for (const k of ['q', 'cat', 'tec', 'plat', 'prof'] as const) if (next[k]) p.set(k, next[k]!);
  const s = p.toString();
  return s ? `/explorar?${s}` : '/explorar';
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 120);
  const category = isCategory(sp.cat) ? sp.cat : undefined;
  const [tax, profs] = await Promise.all([taxonomy(), publicInstructors()]);
  const prof = sp.prof ? profs.find((p) => p.slug === sp.prof) : undefined;
  const tech = sp.tec ? tax.categories.flatMap((c) => c.techniques).find((t) => t.slug === sp.tec) : undefined;
  const platform = sp.plat && PLATFORM_LABEL[sp.plat] ? sp.plat : undefined;
  const cur: SP = { q: q || undefined, cat: category, tec: tech?.slug, plat: platform, prof: prof?.slug };
  const videos = await searchPublic({ q, category, technique: tech?.slug, platform, instructor: prof?.slug });
  const activeCat = tax.categories.find((c) => c.category === (category ?? tech?.category));
  const filtered = !!(q || category || tech || platform || prof);

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${active ? 'border-belt bg-belt/15 text-belt' : 'border-mat-600 text-zinc-300 hover:border-zinc-400'}`;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Explore técnicas de Jiu-Jitsu</h1>
          <p className="text-sm text-zinc-400">
            {tax.total} {tax.total === 1 ? 'vídeo' : 'vídeos'} com transcrição e técnicas identificadas por momento do vídeo.
          </p>
        </div>
        <form action="/explorar" className="flex gap-2">
          {category && <input type="hidden" name="cat" value={category} />}
          {tech && <input type="hidden" name="tec" value={tech.slug} />}
          {platform && <input type="hidden" name="plat" value={platform} />}
          {prof && <input type="hidden" name="prof" value={prof.slug} />}
          <input type="search" name="q" defaultValue={q} className="input min-w-0 flex-1" placeholder="Técnica, posição ou professor…" aria-label="Buscar" />
          <button className="btn-primary">Buscar</button>
        </form>
      </section>

      <section className="space-y-3" aria-label="Filtros por taxonomia">
        <div className="flex items-start gap-3">
          <span className="mt-2 w-20 shrink-0 text-xs uppercase tracking-wide text-zinc-500">Posições</span>
          <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {POSITION_CATEGORIES.map((c) => {
              const n = tax.categories.find((x) => x.category === c)!.videos;
              return <Link key={c} href={href(cur, { cat: category === c ? null : c, tec: null })} className={chip(category === c || tech?.category === c)}>{categoryLabel(c)} <span className="text-zinc-500">{n}</span></Link>;
            })}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-2 w-20 shrink-0 text-xs uppercase tracking-wide text-zinc-500">Ações</span>
          <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {ACTION_CATEGORIES.map((c) => {
              const n = tax.categories.find((x) => x.category === c)!.videos;
              return <Link key={c} href={href(cur, { cat: category === c ? null : c, tec: null })} className={chip(category === c || tech?.category === c)}>{categoryLabel(c)} <span className="text-zinc-500">{n}</span></Link>;
            })}
          </div>
        </div>
        {activeCat && (
          <div className="card p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{activeCat.label}: tipos</p>
            <div className="flex flex-wrap gap-1.5">
              {activeCat.techniques.map((t) => (
                <Link key={t.slug} href={href(cur, { tec: tech?.slug === t.slug ? null : t.slug, cat: null })}
                  className={`rounded border px-2 py-1 text-xs ${tech?.slug === t.slug ? 'border-belt bg-belt/15 text-belt' : t.videos ? catColor(t.category) : 'border-mat-700 text-zinc-600'}`}>
                  {t.name_pt} <span className="opacity-70">{t.videos}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {profs.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="mt-2 w-20 shrink-0 text-xs uppercase tracking-wide text-zinc-500">Professores</span>
            <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {profs.map((p) => (
                <Link key={p.slug} href={href(cur, { prof: prof?.slug === p.slug ? null : p.slug })} className={chip(prof?.slug === p.slug)}>
                  {p.name} <span className="text-zinc-500">{p.videos}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Origem</span>
          {Object.entries(PLATFORM_LABEL).map(([k, label]) => (
            <Link key={k} href={href(cur, { plat: platform === k ? null : k })} className={`rounded px-2 py-1 ${platform === k ? 'text-belt' : 'text-zinc-400 hover:text-zinc-200'}`}>{label}</Link>
          ))}
          {filtered && <Link href="/explorar" className="ml-auto text-xs text-zinc-400 underline hover:text-zinc-200">Limpar filtros</Link>}
        </div>
      </section>

      <section aria-live="polite" className="space-y-3">
        <p className="text-sm text-zinc-400">
          {videos.length} {videos.length === 1 ? 'resultado' : 'resultados'}
          {tech && <> · <span className="text-zinc-200">{tech.name_pt}</span></>}
          {!tech && category && <> · <span className="text-zinc-200">{categoryLabel(category)}</span></>}
          {prof && <> · Prof. <span className="text-zinc-200">{prof.name}</span></>}
          {q && <> · “{q}”</>}
        </p>
        {videos.length ? (
          <PublicVideoGrid videos={videos} />
        ) : (
          <div className="card p-8 text-center text-sm text-zinc-400">
            Nada encontrado. Tente outro termo ou <Link href="/explorar/tecnicas" className="text-belt hover:underline">navegue pela taxonomia</Link>.
          </div>
        )}
      </section>
    </div>
  );
}
