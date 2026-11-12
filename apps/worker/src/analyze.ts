import { classifyByKeywords, type Segment, type TechniqueHit } from '@bjj/core/classifier';
import { TECHNIQUES } from '@bjj/core/techniques';
import { config } from './config.ts';

export interface AnalysisHit extends TechniqueHit {
  source: 'keyword' | 'llm';
}

/**
 * Classificação sem API paga: (1) lexical sobre a transcrição, sempre;
 * (2) opcionalmente refinada por um LLM local via Ollama (OLLAMA_URL), se configurado.
 */
export async function analyzeTechniques(segments: Segment[], signal?: AbortSignal): Promise<AnalysisHit[]> {
  const hits: AnalysisHit[] = classifyByKeywords(segments).map((h) => ({ ...h, source: 'keyword' as const }));
  if (!config.ollamaUrl || !segments.length) return hits;

  try {
    const llm = await ollamaClassify(segments, signal);
    for (const h of llm) {
      const overlap = hits.some((k) => k.slug === h.slug && Math.abs(k.start - h.start) < 60);
      if (!overlap) hits.push(h);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn('[analyze] Ollama indisponível, mantendo apenas classificação lexical:', (err as Error).message);
  }
  return hits.sort((a, b) => a.start - b.start);
}

async function ollamaClassify(segments: Segment[], signal?: AbortSignal): Promise<AnalysisHit[]> {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let transcript = segments.map((s) => `[${fmt(s.start)}|${s.start.toFixed(0)}] ${s.text}`).join('\n');
  if (transcript.length > 24_000) transcript = transcript.slice(0, 24_000);
  const catalog = TECHNIQUES.map((t) => `${t.slug}: ${t.nameEn} / ${t.namePt}`).join('\n');

  const resp = await fetch(new URL('/api/chat', config.ollamaUrl), {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      format: 'json',
      options: { temperature: 0 },
      messages: [
        {
          role: 'system',
          content:
            'Você analisa transcrições de aulas de Jiu-Jitsu. Identifique apenas técnicas efetivamente ensinadas ou demonstradas, ' +
            'usando SOMENTE slugs do catálogo. Responda JSON: {"techniques":[{"slug":"...","start_seconds":0,"end_seconds":0,"confidence":0.0,"evidence":"..."}]}.\n' +
            `Catálogo:\n${catalog}`,
        },
        { role: 'user', content: `Transcrição (formato [mm:ss|segundos] texto):\n${transcript}` },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
  const body = (await resp.json()) as { message?: { content?: string } };
  const parsed = JSON.parse(body.message?.content ?? '{}') as {
    techniques?: Array<{ slug: string; start_seconds?: number; end_seconds?: number; confidence?: number; evidence?: string }>;
  };
  const valid = new Set(TECHNIQUES.map((t) => t.slug));
  return (parsed.techniques ?? [])
    .filter((t) => valid.has(t.slug))
    .map((t) => ({
      slug: t.slug,
      start: Number(t.start_seconds) || 0,
      end: Number(t.end_seconds) || Number(t.start_seconds) || 0,
      confidence: Math.max(0, Math.min(0.9, Number(t.confidence) || 0.5)),
      mentions: 1,
      evidence: String(t.evidence ?? '').slice(0, 240),
      source: 'llm' as const,
    }));
}
