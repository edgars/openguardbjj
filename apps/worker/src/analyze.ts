import { classifyByKeywords, type Segment, type TechniqueHit } from '@bjj/core/classifier';
import { CATEGORY_LABEL_PT, TECHNIQUES } from '@bjj/core/techniques';
import { config } from './config.ts';
import { chatJson } from './llm.ts';

export interface AnalysisHit extends Omit<TechniqueHit, 'start' | 'end'> {
  start: number | null;
  end: number | null;
  source: 'keyword' | 'llm' | 'metadata';
}

export interface VideoMeta {
  title?: string | null;
  description?: string | null;
}

/** Confiança de um termo nomeado pelo próprio autor no título/descrição do post. */
const METADATA_CONFIDENCE = 0.8;

/** "#DeLaRiva #x_guard" → "De La Riva x guard": hashtags viram texto pesquisável. */
export function metadataText(meta: VideoMeta): string {
  return [meta.title, meta.description]
    .filter(Boolean)
    .join('. ')
    .replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => ` ${tag.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')} `)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classificação sem API paga, em camadas:
 *  1. lexical sobre a transcrição (com timestamps);
 *  2. lexical sobre título/descrição/hashtags (o autor costuma nomear a posição ali; sem timestamp);
 *  3. opcional: LLM (LLM_BASE_URL, API compatível com OpenAI — ex.: Groq free tier ou Ollama local),
 *     que também deduz técnicas descritas pelo movimento, sem o nome.
 */
export async function analyzeTechniques(segments: Segment[], meta: VideoMeta = {}, signal?: AbortSignal): Promise<AnalysisHit[]> {
  const hits: AnalysisHit[] = classifyByKeywords(segments).map((h) => ({ ...h, source: 'keyword' as const }));

  const metaText = metadataText(meta);
  if (metaText.trim()) {
    for (const h of classifyByKeywords([{ start: 0, end: 0, text: metaText }])) {
      const spoken = hits.find((k) => k.slug === h.slug);
      if (spoken) {
        // Já citado na fala (com timestamp): o rótulo do autor só reforça a confiança.
        spoken.confidence = Math.max(spoken.confidence, METADATA_CONFIDENCE);
      } else {
        hits.push({ ...h, start: null, end: null, confidence: METADATA_CONFIDENCE, source: 'metadata', evidence: `Descrição: ${h.evidence}` });
      }
    }
  }

  if (config.llm.baseUrl && (segments.length || metaText.trim())) {
    try {
      for (const h of await llmClassify(segments, metaText, signal)) {
        const dup = hits.some((k) => k.slug === h.slug && (k.start == null || h.start == null || Math.abs(k.start - h.start) < 60));
        if (!dup) hits.push(h);
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn('[analyze] LLM indisponível, mantendo apenas a classificação lexical:', (err as Error).message);
    }
  }
  return hits.sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
}

/** Limite de transcrição enviada ao LLM (planos grátis têm teto de tokens por minuto). */
const LLM_TRANSCRIPT_CHARS = 12_000;

async function llmClassify(segments: Segment[], metaText: string, signal?: AbortSignal): Promise<AnalysisHit[]> {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let transcript = segments.map((s) => `[${fmt(s.start)}|${s.start.toFixed(0)}] ${s.text}`).join('\n');
  if (transcript.length > LLM_TRANSCRIPT_CHARS) transcript = `${transcript.slice(0, LLM_TRANSCRIPT_CHARS)}\n[...]`;
  const catalog = TECHNIQUES.map((t) => `${t.slug}|${t.nameEn}|${t.namePt}|${CATEGORY_LABEL_PT[t.category]}`).join('\n');

  const parsed = await chatJson<{
    techniques?: Array<{ slug: string; start_seconds?: number | null; end_seconds?: number | null; confidence?: number; evidence?: string }>;
  }>(
    [
      {
        role: 'system',
        content:
          'Você é faixa-preta de Jiu-Jitsu e cataloga vídeos de técnica. A partir do título/descrição do post e da transcrição, ' +
          'identifique as posições e técnicas ENSINADAS: guarda de partida, raspagens, passagens, finalizações, pegada das costas, quedas, escapes. ' +
          'Instrutores raramente dizem o nome: deduza pelos movimentos descritos (ex.: "move behind him", "take his back" → back-take; ' +
          '"load them on top and extend" a partir de uma guarda → a raspagem/elevação correspondente). ' +
          'A transcrição automática erra nomes (ex.: "Della" = De La Riva, "spied" = spider). ' +
          'Use SOMENTE slugs do catálogo; não invente. Use o timestamp (segundos) do trecho onde a técnica aparece; ' +
          'se vier só do título/descrição, use start_seconds null. Confiança: 0.8+ quando nomeada ou inequívoca, 0.5–0.7 quando deduzida. ' +
          'Responda apenas JSON: {"techniques":[{"slug":"...","start_seconds":0,"end_seconds":0,"confidence":0.0,"evidence":"trecho curto que justifica"}]}.\n' +
          `Catálogo (slug|inglês|português|categoria):\n${catalog}`,
      },
      {
        role: 'user',
        content: `Título/descrição do post:\n${metaText || '(vazio)'}\n\nTranscrição ([mm:ss|segundos] texto):\n${transcript || '(sem transcrição)'}`,
      },
    ],
    { signal },
  );

  const valid = new Set(TECHNIQUES.map((t) => t.slug));
  const seen = new Set<string>();
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
  return (parsed.techniques ?? [])
    .filter((t) => valid.has(t.slug) && !seen.has(`${t.slug}@${t.start_seconds}`) && seen.add(`${t.slug}@${t.start_seconds}`))
    .map((t) => {
      const start = num(t.start_seconds);
      return {
        slug: t.slug,
        start,
        end: num(t.end_seconds) ?? start,
        confidence: Math.max(0.3, Math.min(0.9, Number(t.confidence) || 0.5)),
        mentions: 1,
        evidence: String(t.evidence ?? '').slice(0, 240),
        source: 'llm' as const,
      };
    });
}
