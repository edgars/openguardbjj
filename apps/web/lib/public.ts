import 'server-only';
import { CATEGORY_LABEL_PT, type TechniqueCategory } from '@bjj/core/techniques';
import { query, queryOne } from './db';
import { playbackUrls, type VideoRecord } from './data';

/**
 * Catálogo público (sem login): só vídeos concluídos. Nada aqui depende de usuário;
 * favoritos, playlists e notas continuam exclusivos de quem está logado.
 */
export const POSITION_CATEGORIES: TechniqueCategory[] = ['guard', 'position'];
export const ACTION_CATEGORIES: TechniqueCategory[] = ['sweep', 'guard_pass', 'submission', 'back_take', 'takedown', 'escape'];
export const ALL_CATEGORIES = [...POSITION_CATEGORIES, ...ACTION_CATEGORIES];
export const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', youtube_shorts: 'Shorts', instagram: 'Instagram', upload: 'Upload' };

export const isCategory = (c: unknown): c is TechniqueCategory => typeof c === 'string' && (ALL_CATEGORIES as string[]).includes(c);
export const categoryLabel = (c: string) => CATEGORY_LABEL_PT[c as TechniqueCategory] ?? c;

export interface PublicFilters {
  q?: string;
  category?: TechniqueCategory;
  technique?: string;
  platform?: string;
}

export interface PublicVideoCard {
  id: string;
  title: string | null;
  author: string | null;
  platform: string;
  duration: number | null;
  thumbnail: string | null;
  techniques: Array<{ slug: string; name: string; category: string }>;
}

/** Palavras da busca, sem acento e em minúsculas (todas precisam aparecer). */
function terms(q?: string): string[] {
  return (q ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 8);
}

export async function searchPublic(f: PublicFilters, limit = 60): Promise<PublicVideoCard[]> {
  const rows = await query<{
    id: string; title: string | null; author: string | null; platform: string; duration_seconds: number | null;
    thumbnail_pathname: string | null; techniques: PublicVideoCard['techniques'];
  }>(
    `with base as (
       select v.*,
              f_unaccent(lower(concat_ws(' ', v.title, v.author, v.description, tr.full_text,
                (select string_agg(t.name_pt || ' ' || t.name_en, ' ') from video_techniques vt join techniques t on t.id = vt.technique_id where vt.video_id = v.id)
              ))) as hay
         from videos v left join transcripts tr on tr.video_id = v.id
        where v.download_status = 'COMPLETED'
     )
     select b.id, b.title, b.author, b.platform, b.duration_seconds, b.thumbnail_pathname,
            coalesce((select json_agg(x order by x.category, x.name) from (
               select distinct t.slug, t.name_pt as name, t.category from video_techniques vt join techniques t on t.id = vt.technique_id
                where vt.video_id = b.id) x), '[]'::json) as techniques
       from base b
      where not exists (select 1 from unnest($1::text[]) w where position(w in b.hay) = 0)
        and ($2::text is null or exists (select 1 from video_techniques vt join techniques t on t.id = vt.technique_id where vt.video_id = b.id and t.category = $2))
        and ($3::text is null or exists (select 1 from video_techniques vt join techniques t on t.id = vt.technique_id where vt.video_id = b.id and t.slug = $3))
        and ($4::text is null or b.platform = $4)
      order by b.created_at desc
      limit $5`,
    [terms(f.q), f.category ?? null, f.technique ?? null, f.platform ?? null, limit],
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      platform: r.platform,
      duration: r.duration_seconds,
      thumbnail: r.thumbnail_pathname ? (await playbackUrls({ blob_pathname: null, thumbnail_pathname: r.thumbnail_pathname })).thumbnail : null,
      techniques: r.techniques,
    })),
  );
}

export interface TaxonomyTechnique { slug: string; name_pt: string; name_en: string; category: TechniqueCategory; videos: number }
export interface TaxonomyCategory { category: TechniqueCategory; label: string; videos: number; techniques: TaxonomyTechnique[] }

/** Taxonomia completa com nº de vídeos (concluídos) por técnica e por categoria. */
export async function taxonomy(): Promise<{ total: number; categories: TaxonomyCategory[] }> {
  const [techs, cats, total] = await Promise.all([
    query<TaxonomyTechnique>(
      `select t.slug, t.name_pt, t.name_en, t.category,
              count(distinct v.id)::int as videos
         from techniques t
         left join video_techniques vt on vt.technique_id = t.id
         left join videos v on v.id = vt.video_id and v.download_status = 'COMPLETED'
        group by t.id order by t.name_pt`,
    ),
    query<{ category: TechniqueCategory; videos: number }>(
      `select t.category, count(distinct v.id)::int as videos
         from video_techniques vt join techniques t on t.id = vt.technique_id
         join videos v on v.id = vt.video_id and v.download_status = 'COMPLETED'
        group by t.category`,
    ),
    queryOne<{ n: number }>(`select count(*)::int as n from videos where download_status = 'COMPLETED'`),
  ]);
  const byCat = new Map(cats.map((c) => [c.category, c.videos]));
  return {
    total: total?.n ?? 0,
    categories: ALL_CATEGORIES.map((category) => ({
      category,
      label: categoryLabel(category),
      videos: byCat.get(category) ?? 0,
      techniques: techs.filter((t) => t.category === category).sort((a, b) => b.videos - a.videos || a.name_pt.localeCompare(b.name_pt)),
    })),
  };
}

export async function getPublicVideo(id: string) {
  return queryOne<VideoRecord>(`select * from videos where id = $1 and download_status = 'COMPLETED'`, [id]);
}

export async function techniqueBySlug(slug: string) {
  return queryOne<{ slug: string; name_pt: string; name_en: string; category: TechniqueCategory }>(
    'select slug, name_pt, name_en, category from techniques where slug = $1',
    [slug],
  );
}
