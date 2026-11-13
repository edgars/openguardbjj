import { query, queryOne, withTransaction } from '@bjj/core/db';
import type { Segment } from '@bjj/core/classifier';
import { nameSlug, normalizeName, sameName } from '@bjj/core/names';
import { chatJson, llmEnabled } from './llm.ts';

/**
 * Identificação do professor que ensina no vídeo + perfil público.
 *
 * Nome: extraído por LLM do que o próprio post diz (perfil, título, descrição, fala). Nada de
 * reconhecimento facial. O nome devolvido precisa existir no texto de entrada (trava contra invenção).
 *
 * Perfil, em cascata:
 *   1. BJJ Heroes — acesso direto com User-Agent identificado. O site usa desafio anti-bot do
 *      Cloudflare; se ele aparecer, NÃO é contornado: a fonte é pulada (e pausada por 24 h).
 *   2. Wikipedia (API oficial, licença livre) — só aceita página cujo nome bate e que fala de jiu-jitsu.
 *   3. IA sem fonte — só se o modelo declarar que conhece a pessoa; fica marcado como não verificado.
 * Tudo entra como SUGESTÃO; só o que o admin confirmar aparece ao público.
 */

const UA = 'OpenGuardBJJ/1.0 (+https://openguardbjj.vercel.app; catálogo de técnicas de jiu-jitsu)';
const BJJ_RE = /jiu[\s-]?jitsu|grappl|\bbjj\b|submission|judo|luta livre|vale tudo/i;

export interface InstructorCandidate {
  name: string;
  source: 'metadata' | 'transcript' | 'author';
  confidence: number;
  evidence: string;
}

interface VideoMeta {
  title: string | null;
  description: string | null;
  author: string | null;
}

// ---------------------------------------------------------------------------------------------
// 1) Quem está ensinando?

export async function extractInstructors(meta: VideoMeta, segments: Segment[], signal?: AbortSignal): Promise<InstructorCandidate[]> {
  const intro = segments.map((s) => s.text).join(' ').slice(0, 2500);
  const input = [
    `Nome do perfil/canal que publicou: ${meta.author ?? '(desconhecido)'}`,
    `Título: ${meta.title ?? ''}`,
    `Descrição: ${meta.description ?? ''}`,
    `Início da fala (transcrição automática): ${intro || '(sem transcrição)'}`,
  ].join('\n');

  const out = await chatJson<{ instructors?: Array<{ name?: string; source?: string; confidence?: number; evidence?: string }> }>(
    [
      {
        role: 'system',
        content:
          'Você identifica QUEM ESTÁ ENSINANDO a técnica num vídeo curto de Jiu-Jitsu, usando apenas os dados do post. ' +
          'Regras: (1) só nomes de pessoas que aparecem EXPLICITAMENTE no texto; não use conhecimento externo para adivinhar; ' +
          '(2) ignore pessoas apenas citadas (ex.: "my professor", adversários, alunos, campeonatos, academias); ' +
          '(3) o nome do perfil conta como professor quando for nome de pessoa (ex.: "Marcos Tinoco BIG OSS" → "Marcos Tinoco"), ' +
          'não quando for página/academia/compilado; (4) um nome na descrição/título do tipo "Fulano Ep.5" ou "with Fulano" indica o professor; ' +
          '(5) devolva o nome completo como escrito, sem emojis ou sufixos; (6) na dúvida, devolva lista vazia. ' +
          'Responda apenas JSON: {"instructors":[{"name":"...","source":"metadata|author|transcript","confidence":0.0,"evidence":"trecho que mostra"}]}',
      },
      { role: 'user', content: input },
    ],
    { signal, maxTokens: 800 },
  );

  const haystack = normalizeName(input).replace(/ /g, '');
  const seen = new Set<string>();
  return (out.instructors ?? [])
    .map((c) => ({
      name: String(c.name ?? '').replace(/\s+/g, ' ').trim(),
      source: (['metadata', 'transcript', 'author'].includes(String(c.source)) ? c.source : 'metadata') as InstructorCandidate['source'],
      confidence: Math.max(0.3, Math.min(0.95, Number(c.confidence) || 0.5)),
      evidence: String(c.evidence ?? '').slice(0, 240),
    }))
    .filter((c) => {
      const n = normalizeName(c.name);
      // ≥ 2 palavras, cada uma presente no texto de entrada; sem repetidos.
      const ok = n.split(' ').length >= 2 && n.split(' ').every((t) => haystack.includes(t)) && !seen.has(n);
      seen.add(n);
      return ok;
    })
    .slice(0, 2);
}

// ---------------------------------------------------------------------------------------------
// 2) Fontes do perfil

interface SourceDoc {
  source: 'bjjheroes' | 'wikipedia';
  url: string;
  text: string;
}

let bjjHeroesPausedUntil = 0;

async function get(url: string, timeoutMs = 12_000) {
  return fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/json' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
}

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

const isChallenge = (r: Response, body: string) =>
  r.status === 403 || r.status === 503 || r.headers.get('cf-mitigated') === 'challenge' || /Just a moment|cf_chl_opt|Enable JavaScript and cookies/i.test(body);

/** BJJ Heroes, se o site permitir acesso automatizado. Desafio anti-bot ⇒ desiste (não contorna). */
async function fromBjjHeroes(name: string): Promise<SourceDoc | null> {
  if (Date.now() < bjjHeroesPausedUntil) return null;
  try {
    const search = await get(`https://www.bjjheroes.com/?s=${encodeURIComponent(name)}`);
    const html = await search.text();
    if (isChallenge(search, html)) {
      bjjHeroesPausedUntil = Date.now() + 24 * 3600_000;
      console.warn('[instructors] BJJ Heroes exige verificação anti-bot; fonte pausada por 24 h (não contornamos).');
      return null;
    }
    if (!search.ok) return null;
    const links = [...html.matchAll(/href="(https:\/\/www\.bjjheroes\.com\/bjj-fighters\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const hit = links.find(([, , label]) => sameName(htmlToText(label!), name));
    if (!hit) return null;
    const page = await get(hit[1]!);
    const pageHtml = await page.text();
    if (isChallenge(page, pageHtml) || !page.ok) return null;
    const text = htmlToText(pageHtml.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? pageHtml).slice(0, 8000);
    return BJJ_RE.test(text) ? { source: 'bjjheroes', url: hit[1]!, text } : null;
  } catch (err) {
    console.warn('[instructors] BJJ Heroes indisponível:', (err as Error).message);
    return null;
  }
}

/** Wikipedia (en, depois pt): página cujo título/resumo bate com o nome e que fala de jiu-jitsu/grappling. */
async function fromWikipedia(name: string): Promise<SourceDoc | null> {
  for (const lang of ['en', 'pt']) {
    try {
      const api = `https://${lang}.wikipedia.org/w/api.php`;
      const s = await get(`${api}?action=query&list=search&srsearch=${encodeURIComponent(`${name} jiu-jitsu`)}&srlimit=3&format=json`);
      if (!s.ok) continue;
      const titles = ((await s.json()) as { query?: { search?: Array<{ title: string }> } }).query?.search?.map((r) => r.title) ?? [];
      for (const title of titles) {
        const e = await get(`${api}?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json`);
        if (!e.ok) continue;
        const pages = ((await e.json()) as { query?: { pages?: Record<string, { title: string; extract?: string }> } }).query?.pages ?? {};
        const page = Object.values(pages)[0];
        const text = page?.extract?.slice(0, 8000) ?? '';
        const lead = normalizeName(text.slice(0, 600));
        const matches = sameName(page?.title ?? '', name) || lead.replace(/ /g, '').includes(normalizeName(name).replace(/ /g, ''));
        if (page && matches && BJJ_RE.test(text.slice(0, 1500))) {
          return { source: 'wikipedia', url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, text };
        }
      }
    } catch (err) {
      console.warn(`[instructors] Wikipedia (${lang}) indisponível:`, (err as Error).message);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// 3) Perfil estruturado

interface Profile {
  known?: boolean;
  full_name?: string | null;
  nickname?: string | null;
  team?: string | null;
  belt?: string | null;
  lineage?: string | null;
  nationality?: string | null;
  achievements?: string[] | null;
  summary_pt?: string | null;
}

const PROFILE_SHAPE =
  '{"known":true,"full_name":null,"nickname":null,"team":null,"belt":null,"lineage":null,"nationality":null,"achievements":[],"summary_pt":null}';

async function structureProfile(name: string, doc: SourceDoc | null): Promise<Profile> {
  if (doc) {
    return chatJson<Profile>(
      [
        {
          role: 'system',
          content:
            'Extraia o perfil de um atleta/professor de Jiu-Jitsu USANDO SOMENTE o texto fornecido; campo ausente no texto = null. ' +
            'belt = cor da faixa em português no feminino (ex.: "preta", "marrom"); team = academia/equipe atual; lineage = de quem recebeu a faixa preta; achievements = até 5 títulos mais relevantes, curtos, em português; ' +
            'summary_pt = 2 frases em português. Responda apenas JSON no formato: ' + PROFILE_SHAPE,
        },
        { role: 'user', content: `Pessoa: ${name}\nFonte (${doc.source}):\n${doc.text}` },
      ],
      { maxTokens: 900 },
    );
  }
  // Sem fonte: só aceitamos se o modelo declarar que conhece a pessoa — e marcamos como não verificado.
  return chatJson<Profile>(
    [
      {
        role: 'system',
        content:
          'Você conhece a cena competitiva de Jiu-Jitsu. Diga o que sabe sobre a pessoa citada SOMENTE se tiver certeza de que é ' +
          'um atleta/professor de Jiu-Jitsu conhecido com exatamente esse nome. Se não tiver certeza, responda {"known":false}. ' +
          'Nunca invente títulos, equipes ou linhagem; campo incerto = null. belt = cor da faixa em português no feminino. achievements = até 5, curtos, em português; ' +
          'summary_pt = 2 frases em português. Responda apenas JSON no formato: ' + PROFILE_SHAPE,
      },
      { role: 'user', content: `Pessoa: ${name}` },
    ],
    { maxTokens: 900 },
  );
}

const clean = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

const BELT: Record<string, string> = { preto: 'preta', black: 'preta', brown: 'marrom', purple: 'roxa', roxo: 'roxa', blue: 'azul', white: 'branca', branco: 'branca', 'coral': 'coral', red: 'vermelha', vermelho: 'vermelha' };
/** "Preto"/"black belt" → "preta" (faixa é feminino em português). */
const beltPt = (v: unknown) => {
  const b = clean(v, 60);
  if (!b) return null;
  const key = b.toLowerCase().replace(/\b(faixa|belt)\b/g, '').trim();
  return BELT[key] ?? b;
};

/** Enriquece um professor pendente (cascata de fontes). Erros viram status 'failed' (re-tentado depois). */
export async function enrichInstructor(id: string, log: (m: string) => void = console.log) {
  const row = await queryOne<{ id: string; name: string }>('select id, name from instructors where id = $1', [id]);
  if (!row) return;
  try {
    const doc = (await fromBjjHeroes(row.name)) ?? (await fromWikipedia(row.name));
    const p = llmEnabled() ? await structureProfile(row.name, doc) : { known: false };
    const known = !!doc || p.known === true;
    const achievements = (Array.isArray(p.achievements) ? p.achievements : []).map((a) => clean(a, 160)).filter((a): a is string => !!a).slice(0, 5);
    await query(
      `update instructors set
          nickname = $2, team = $3, belt = $4, lineage = $5, nationality = $6, achievements = $7, summary = $8,
          profile_source = $9, profile_status = 'ready', bjjheroes_url = coalesce($10, bjjheroes_url),
          wikipedia_url = coalesce($11, wikipedia_url), fetched_at = now(), updated_at = now()
        where id = $1 and profile_source <> 'manual'`,
      [
        id,
        known ? clean(p.nickname, 80) : null,
        known ? clean(p.team, 120) : null,
        known ? beltPt(p.belt) : null,
        known ? clean(p.lineage, 160) : null,
        known ? clean(p.nationality, 60) : null,
        known ? achievements : [],
        known ? clean(p.summary_pt, 600) : null,
        doc ? doc.source : known ? 'ai' : 'none',
        doc?.source === 'bjjheroes' ? doc.url : null,
        doc?.source === 'wikipedia' ? doc.url : null,
      ],
    );
    log(`professor "${row.name}": perfil ${doc ? `via ${doc.source}` : known ? 'via IA (não verificado)' : 'sem dados públicos'}`);
  } catch (err) {
    await query(`update instructors set profile_status = 'failed', updated_at = now() where id = $1`, [id]);
    log(`professor "${row.name}": falha ao montar perfil — ${(err as Error).message}`);
  }
}

/** Chamado no laço ocioso do worker: perfis pendentes (ex.: professor adicionado à mão) e falhas antigas. */
export async function enrichPending(limit = 3, log?: (m: string) => void) {
  const rows = await query<{ id: string }>(
    `select id from instructors
      where profile_status = 'pending' or (profile_status = 'failed' and updated_at < now() - interval '6 hours')
      order by created_at limit $1`,
    [limit],
  );
  for (const r of rows) await enrichInstructor(r.id, log);
  return rows.length;
}

// ---------------------------------------------------------------------------------------------
// 4) Gravação das sugestões do vídeo

/** Reaproveita um professor existente com o mesmo nome (tolerante a variações) ou cria um pendente. */
async function upsertInstructor(name: string): Promise<{ id: string; isNew: boolean }> {
  const existing = await query<{ id: string; name: string }>('select id, name from instructors');
  const same = existing.find((e) => sameName(e.name, name));
  if (same) return { id: same.id, isNew: false };
  const slug = nameSlug(name);
  const row = await queryOne<{ id: string; inserted: boolean }>(
    `insert into instructors (slug, name) values ($1, $2)
     on conflict (slug) do update set updated_at = instructors.updated_at
     returning id, (xmax = 0) as inserted`,
    [slug, name],
  );
  return { id: row!.id, isNew: row!.inserted };
}

/**
 * Identifica os professores do vídeo e grava como sugestão. Decisões do admin (confirmado/rejeitado)
 * são preservadas; sugestões antigas que não se repetem são removidas.
 */
export async function identifyInstructors(videoId: string, segments: Segment[], log: (m: string) => void, signal?: AbortSignal) {
  if (!llmEnabled()) return;
  const meta = await queryOne<VideoMeta>('select title, description, author from videos where id = $1', [videoId]);
  const candidates = await extractInstructors(meta ?? { title: null, description: null, author: null }, segments, signal);

  const fresh: string[] = [];
  const keep: string[] = [];
  for (const c of candidates) {
    const { id, isNew } = await upsertInstructor(c.name);
    keep.push(id);
    if (isNew) fresh.push(id);
    await query(
      `insert into video_instructors (video_id, instructor_id, source, confidence, evidence)
       values ($1, $2, $3, $4, $5)
       on conflict (video_id, instructor_id) do update
         set source = excluded.source, confidence = excluded.confidence, evidence = excluded.evidence
         where video_instructors.status = 'suggested'`,
      [videoId, id, c.source, c.confidence, c.evidence],
    );
  }
  await withTransaction(async (c) => {
    await c.query(
      `delete from video_instructors where video_id = $1 and status = 'suggested' and not (instructor_id = any($2::uuid[]))`,
      [videoId, keep],
    );
  });
  log(candidates.length ? `professor(es) sugerido(s): ${candidates.map((c) => c.name).join(', ')}` : 'professor não identificado no post');
  for (const id of fresh) await enrichInstructor(id, log);
}
