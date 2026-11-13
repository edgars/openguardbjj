import Link from 'next/link';
import { bjjHeroesLink, type InstructorProfile } from '@/lib/instructors';

const SOURCE_NOTE: Record<string, string> = {
  bjjheroes: 'Fonte: BJJ Heroes',
  wikipedia: 'Fonte: Wikipedia',
  ai: 'Resumo gerado por IA, não verificado — pode conter erros',
  manual: 'Informado pelo administrador',
  none: 'Sem perfil público encontrado',
};

/** Cartão do professor (dados já coletados; sem chamadas externas no render). */
export function InstructorCard({ p, linkToPage = true }: { p: InstructorProfile; linkToPage?: boolean }) {
  const facts = [
    p.belt && ['Faixa', p.belt],
    p.team && ['Equipe', p.team],
    p.lineage && ['Linhagem', p.lineage],
    p.nationality && ['Nacionalidade', p.nationality],
  ].filter(Boolean) as Array<[string, string]>;
  return (
    <section className="card space-y-3 p-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Professor</p>
        <h3 className="text-base font-semibold">
          {linkToPage ? <Link href={`/explorar/professor/${p.slug}`} className="hover:text-belt">{p.name}</Link> : p.name}
          {p.nickname && <span className="ml-2 font-normal text-zinc-400">“{p.nickname}”</span>}
        </h3>
      </div>
      {p.profile_status === 'pending' && <p className="text-xs text-zinc-500">Buscando informações públicas…</p>}
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.summary && <p className="text-zinc-300">{p.summary}</p>}
      {p.achievements.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 text-zinc-300 marker:text-belt">
          {p.achievements.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {p.wikipedia_url && <a className="btn-ghost px-2 py-1 text-xs" href={p.wikipedia_url} target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>}
        <a className="btn-ghost px-2 py-1 text-xs" href={bjjHeroesLink(p)} target="_blank" rel="noopener noreferrer">
          {p.bjjheroes_url ? 'BJJ Heroes ↗' : 'Buscar no BJJ Heroes ↗'}
        </a>
      </div>
      <p className={`text-[11px] ${p.profile_source === 'ai' ? 'text-amber-300' : 'text-zinc-500'}`}>{SOURCE_NOTE[p.profile_source]}</p>
    </section>
  );
}
