'use client';

import { useMemo, useState } from 'react';
import { formatTimestamp } from '@bjj/core/format';
import { CATEGORY_LABEL_PT, type TechniqueCategory } from '@bjj/core/techniques';

export interface CatalogItem { slug: string; name_pt: string; name_en: string; category: string; videos: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Painel do admin para adicionar uma técnica/posição ao vídeo, escolhendo do catálogo:
 * primeiro as já catalogadas em vídeos da biblioteca, depois a lista completa por categoria.
 * Opcionalmente marca no momento atual do player.
 */
export function TechniqueEditor(props: {
  catalog: CatalogItem[];
  present: Set<string>;
  currentTime: number;
  busy: boolean;
  onAdd: (slug: string, start: number | null) => void;
}) {
  const { catalog, present } = props;
  const [q, setQ] = useState('');
  const [atTime, setAtTime] = useState(false);

  const filtered = useMemo(() => {
    const f = fold(q.trim());
    return f ? catalog.filter((t) => fold(`${t.name_pt} ${t.name_en} ${t.slug}`).includes(f)) : catalog;
  }, [catalog, q]);
  const used = useMemo(() => filtered.filter((t) => t.videos > 0).sort((a, b) => b.videos - a.videos || a.name_pt.localeCompare(b.name_pt)), [filtered]);
  const byCategory = useMemo(() => {
    const m = new Map<string, CatalogItem[]>();
    for (const t of filtered) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [filtered]);

  const item = (t: CatalogItem) => {
    const has = present.has(t.slug) && !atTime;
    return (
      <button key={t.slug} type="button" disabled={props.busy || has}
        onClick={() => props.onAdd(t.slug, atTime ? Math.floor(props.currentTime) : null)}
        title={has ? 'Já está no vídeo' : t.name_en}
        className="rounded-md border border-mat-600 px-2.5 py-1.5 text-left text-xs hover:border-belt disabled:cursor-default disabled:border-mat-700 disabled:text-zinc-500 sm:px-2 sm:py-1">
        {has ? '✓ ' : '+ '}{t.name_pt}
        {t.videos > 0 && <span className="ml-1.5 text-zinc-500">{t.videos}</span>}
      </button>
    );
  };

  return (
    <div className="mt-3 space-y-3 rounded-md border border-mat-700 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input className="input py-1.5" placeholder="Buscar técnica ou posição (PT/EN)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} />
          marcar em <span className="font-mono text-belt">{formatTimestamp(props.currentTime)}</span>
        </label>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {used.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Já catalogadas na biblioteca</p>
            <div className="flex flex-wrap gap-2">{used.map(item)}</div>
          </div>
        )}
        {byCategory.map(([cat, list]) => (
          <div key={cat}>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{CATEGORY_LABEL_PT[cat as TechniqueCategory] ?? cat}</p>
            <div className="flex flex-wrap gap-2">{list.map(item)}</div>
          </div>
        ))}
        {!filtered.length && <p className="text-xs text-zinc-400">Nada no catálogo com “{q}”.</p>}
      </div>
    </div>
  );
}
