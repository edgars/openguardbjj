import 'server-only';
import { query, queryOne } from './db';

export interface InstructorProfile {
  id: string;
  slug: string;
  name: string;
  nickname: string | null;
  team: string | null;
  belt: string | null;
  lineage: string | null;
  nationality: string | null;
  achievements: string[];
  summary: string | null;
  profile_source: 'bjjheroes' | 'wikipedia' | 'ai' | 'manual' | 'none';
  profile_status: 'pending' | 'ready' | 'failed';
  bjjheroes_url: string | null;
  wikipedia_url: string | null;
}

export interface VideoInstructor extends InstructorProfile {
  status: 'suggested' | 'confirmed' | 'rejected';
  source: string;
  confidence: number;
  evidence: string | null;
}

const COLS = `i.id, i.slug, i.name, i.nickname, i.team, i.belt, i.lineage, i.nationality, i.achievements, i.summary,
              i.profile_source, i.profile_status, i.bjjheroes_url, i.wikipedia_url`;

/** Professores do vídeo. Público/usuários: só confirmados. Admin: também sugestões e rejeitados. */
export async function videoInstructors(videoId: string, includeAll = false) {
  return query<VideoInstructor>(
    `select ${COLS}, vi.status, vi.source, vi.confidence, vi.evidence
       from video_instructors vi join instructors i on i.id = vi.instructor_id
      where vi.video_id = $1 and ($2 or vi.status = 'confirmed')
      order by (vi.status = 'confirmed') desc, vi.confidence desc`,
    [videoId, includeAll],
  );
}

/** Professores confirmados em ao menos um vídeo concluído, com contagem (filtro do /explorar). */
export async function publicInstructors() {
  return query<{ slug: string; name: string; team: string | null; videos: number }>(
    `select i.slug, i.name, i.team, count(distinct v.id)::int as videos
       from instructors i
       join video_instructors vi on vi.instructor_id = i.id and vi.status = 'confirmed'
       join videos v on v.id = vi.video_id and v.download_status = 'COMPLETED'
      group by i.id order by videos desc, i.name`,
  );
}

export async function instructorBySlug(slug: string) {
  return queryOne<InstructorProfile>(`select ${COLS} from instructors i where i.slug = $1`, [slug]);
}

/** Link do BJJ Heroes: página do lutador quando conhecida; senão, a busca do site (aberta pelo navegador do visitante). */
export const bjjHeroesLink = (p: Pick<InstructorProfile, 'name' | 'bjjheroes_url'>) =>
  p.bjjheroes_url ?? `https://www.bjjheroes.com/?s=${encodeURIComponent(p.name)}`;
