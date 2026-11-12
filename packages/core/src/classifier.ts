import { TECHNIQUES, type Technique } from './techniques.ts';

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface TechniqueHit {
  slug: string;
  start: number;
  end: number;
  confidence: number;
  mentions: number;
  evidence: string;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface CompiledAlias {
  slug: string;
  needle: string; // " termo "
  weak: boolean;
}

function compile(taxonomy: Technique[]): CompiledAlias[] {
  const out: CompiledAlias[] = [];
  for (const t of taxonomy) {
    for (const raw of t.aliases) {
      const weak = raw.startsWith('~');
      const norm = normalizeText(weak ? raw.slice(1) : raw);
      if (norm) out.push({ slug: t.slug, needle: ` ${norm} `, weak });
    }
  }
  // Termos mais longos primeiro: "reverse de la riva" vence "de la riva" no mesmo trecho.
  return out.sort((a, b) => b.needle.length - a.needle.length);
}

/** Intervalo máximo (s) entre menções para considerá-las o mesmo trecho de ensino. */
const MERGE_GAP_SECONDS = 45;
const MIN_CONFIDENCE = 0.4; // termo ambíguo isolado (0.38) não basta; precisa de 2+ menções

/**
 * Classificador lexical (sem IA paga): procura nomes de técnicas (PT/EN) na transcrição,
 * agrupa menções próximas em intervalos de tempo e atribui confiança pela frequência.
 */
export function classifyByKeywords(segments: Segment[], taxonomy: Technique[] = TECHNIQUES): TechniqueHit[] {
  const aliases = compile(taxonomy);
  type Mention = { slug: string; start: number; end: number; weak: boolean; text: string };
  const mentions: Mention[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const next = segments[i + 1];
    // Janela com o próximo segmento captura termos quebrados entre segmentos.
    const nextNorm = next ? ` ${normalizeText(next.text)} ` : '';
    let consumed = ` ${normalizeText(seg.text)} `;
    for (const a of aliases) {
      const inOwn = consumed.includes(a.needle);
      const spans = !inOwn && !!next && `${consumed}${nextNorm.slice(1)}`.includes(a.needle) && !nextNorm.includes(a.needle);
      if (!inOwn && !spans) continue;
      mentions.push({ slug: a.slug, start: seg.start, end: spans && next ? next.end : seg.end, weak: a.weak, text: seg.text.trim() });
      // Remove o trecho casado para que aliases menores contidos nele não gerem falso positivo.
      if (inOwn) consumed = consumed.split(a.needle).join(' ');
    }
  }

  const bySlug = new Map<string, Mention[]>();
  for (const m of mentions) {
    const list = bySlug.get(m.slug) ?? [];
    list.push(m);
    bySlug.set(m.slug, list);
  }

  const hits: TechniqueHit[] = [];
  for (const [slug, list] of bySlug) {
    list.sort((a, b) => a.start - b.start);
    let cluster: Mention[] = [];
    const flush = () => {
      if (!cluster.length) return;
      const strong = cluster.filter((m) => !m.weak).length;
      const weak = cluster.length - strong;
      const score = strong * 1 + weak * 0.4;
      const confidence = Math.min(0.95, 0.3 + 0.2 * score);
      if (confidence >= MIN_CONFIDENCE) {
        hits.push({
          slug,
          start: cluster[0]!.start,
          end: Math.max(...cluster.map((m) => m.end)),
          confidence: Number(confidence.toFixed(3)),
          mentions: cluster.length,
          evidence: cluster[0]!.text.slice(0, 240),
        });
      }
      cluster = [];
    };
    for (const m of list) {
      const last = cluster[cluster.length - 1];
      if (last && m.start - last.end > MERGE_GAP_SECONDS) flush();
      cluster.push(m);
    }
    flush();
  }
  return hits.sort((a, b) => a.start - b.start);
}
