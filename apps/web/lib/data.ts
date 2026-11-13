import 'server-only';
import { WORKER_ONLINE_WINDOW_SECONDS, type JobKind, type JobOptions } from '@bjj/core/status';
import { getStorage } from '@bjj/core/storage';
import { HttpError } from './errors';
import type { AppUser } from './auth';
import { query, queryOne, withTransaction } from './db';

export interface VideoRecord {
  id: string;
  platform: string;
  source_url: string | null;
  external_id: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  duration_seconds: number | null;
  thumbnail_pathname: string | null;
  thumbnail_size_bytes: number | null;
  blob_pathname: string | null;
  video_blob_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  resolution: string | null;
  audio_pathname: string | null;
  audio_size_bytes: number | null;
  requested_quality: number;
  download_status: string;
  transcription_status: string;
  analysis_status: string;
  processing_progress: number;
  download_authorized: boolean;
  auto_transcribe: boolean;
  auto_analyze: boolean;
  error_message: string | null;
  created_at: string;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  status: string;
  stage: string | null;
  attempts: number;
  max_attempts: number;
  progress: number;
  bytes_downloaded: number | null;
  bytes_total: number | null;
  options: JobOptions;
  cancel_requested: boolean;
  worker_id: string | null;
  next_attempt_at: string;
  error_message: string | null;
  created_at: string;
}

/**
 * Biblioteca única, curada pelo admin. O admin vê tudo (inclusive em processamento/falha);
 * usuários comuns veem só vídeos concluídos.
 */
const VISIBLE = `($2::boolean or v.download_status = 'COMPLETED')`;

export async function listVideos(user: AppUser) {
  return query<VideoRecord & { techniques: string[] | null; is_favorite: boolean }>(
    `select v.*,
            (select array_agg(distinct t.name_pt) from video_techniques vt join techniques t on t.id = vt.technique_id where vt.video_id = v.id) as techniques,
            exists (select 1 from favorites f where f.video_id = v.id and f.user_id = $1) as is_favorite
       from videos v where ${VISIBLE} order by v.created_at desc limit 500`,
    [user.id, user.role === 'admin'],
  );
}

export async function getVideo(user: AppUser, id: string): Promise<VideoRecord> {
  const v = await queryOne<VideoRecord>(`select v.* from videos v where v.id = $1 and ${VISIBLE}`, [id, user.role === 'admin']);
  if (!v) throw new HttpError(404, 'Vídeo não encontrado.');
  return v;
}

export async function isFavorite(userId: string, videoId: string) {
  return !!(await queryOne('select 1 from favorites where user_id = $1 and video_id = $2', [userId, videoId]));
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  video_count: number;
  cover_pathname: string | null;
  updated_at: string;
}

export async function listPlaylists(user: AppUser) {
  return query<PlaylistSummary>(
    `select p.id, p.name, p.description, p.updated_at,
            (select count(*)::int from playlist_videos pv join videos v on v.id = pv.video_id
              where pv.playlist_id = p.id and ${VISIBLE}) as video_count,
            (select v.thumbnail_pathname from playlist_videos pv join videos v on v.id = pv.video_id
              where pv.playlist_id = p.id and v.thumbnail_pathname is not null and ${VISIBLE}
              order by pv.position, pv.added_at limit 1) as cover_pathname
       from playlists p where p.user_id = $1 order by p.updated_at desc`,
    [user.id, user.role === 'admin'],
  );
}

/** Playlists do usuário com a marcação de quais já contêm o vídeo (menu "Adicionar à playlist"). */
export async function playlistsForVideo(userId: string, videoId: string) {
  return query<{ id: string; name: string; has_video: boolean }>(
    `select p.id, p.name, exists (select 1 from playlist_videos pv where pv.playlist_id = p.id and pv.video_id = $2) as has_video
       from playlists p where p.user_id = $1 order by p.name`,
    [userId, videoId],
  );
}

export async function getPlaylist(user: AppUser, id: string) {
  const playlist = await queryOne<{ id: string; name: string; description: string | null; updated_at: string }>(
    'select id, name, description, updated_at from playlists where id = $1 and user_id = $2',
    [id, user.id],
  );
  if (!playlist) throw new HttpError(404, 'Playlist não encontrada.');
  // Vídeos ainda não concluídos (ou apagados pelo admin) somem da playlist para usuários comuns.
  const videos = await query<VideoRecord & { position: number }>(
    `select v.*, pv.position from playlist_videos pv join videos v on v.id = pv.video_id
      where pv.playlist_id = $1 and ${VISIBLE} order by pv.position, pv.added_at`,
    [id, user.role === 'admin'],
  );
  return { playlist, videos };
}

export async function latestJob(videoId: string) {
  return queryOne<JobRecord>('select * from download_jobs where video_id = $1 order by created_at desc limit 1', [videoId]);
}

export async function activeJob(videoId: string) {
  return queryOne<JobRecord>(`select * from download_jobs where video_id = $1 and status in ('PENDING','RUNNING') limit 1`, [videoId]);
}

export async function workerStatus() {
  const rows = await query<{ worker_id: string; hostname: string | null; last_seen_at: string; current_job: string | null }>(
    `select worker_id, hostname, last_seen_at, current_job from worker_heartbeats
      where last_seen_at > now() - make_interval(secs => $1) order by last_seen_at desc`,
    [WORKER_ONLINE_WINDOW_SECONDS],
  );
  return { online: rows.length > 0, workers: rows };
}

/** Cria um job. O índice único parcial garante no máximo um job ativo por vídeo. */
export async function enqueueJob(videoId: string, kind: JobKind, options: JobOptions = {}) {
  try {
    const row = await queryOne<{ id: string }>(
      'insert into download_jobs (video_id, kind, options) values ($1, $2, $3) returning id',
      [videoId, kind, options],
    );
    return row!.id;
  } catch (err: any) {
    if (err?.code === '23505') throw new HttpError(409, 'Já existe um processamento ativo para este vídeo.');
    throw err;
  }
}

export async function createVideoWithJob(
  userId: string,
  v: {
    platform: string;
    sourceUrl: string | null;
    externalId: string | null;
    title?: string | null;
    quality: number;
    transcribe: boolean;
    analyze: boolean;
    authorized: boolean;
  },
  kind: JobKind,
  options: JobOptions,
) {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into videos (user_id, platform, source_url, external_id, title, requested_quality, download_authorized,
                           auto_transcribe, auto_analyze, transcription_status, analysis_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        userId, v.platform, v.sourceUrl, v.externalId, v.title ?? null, v.quality, v.authorized, v.transcribe, v.analyze,
        v.transcribe ? 'PENDING' : 'NOT_REQUESTED', v.analyze ? 'PENDING' : 'NOT_REQUESTED',
      ],
    );
    const videoId = rows[0]!.id;
    const job = await c.query<{ id: string }>('insert into download_jobs (video_id, kind, options) values ($1,$2,$3) returning id', [
      videoId, kind, options,
    ]);
    return { videoId, jobId: job.rows[0]!.id };
  });
}

export async function getStatus(user: AppUser, id: string) {
  const video = await getVideo(user, id);
  const [job, worker] = await Promise.all([latestJob(id), workerStatus()]);
  return {
    video: {
      id: video.id,
      title: video.title,
      platform: video.platform,
      download_status: video.download_status,
      processing_progress: video.processing_progress,
      transcription_status: video.transcription_status,
      analysis_status: video.analysis_status,
      error_message: video.error_message,
      file_size_bytes: video.file_size_bytes,
      duration_seconds: video.duration_seconds,
      has_video: !!video.blob_pathname,
    },
    job: job && {
      id: job.id,
      kind: job.kind,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      bytes_downloaded: job.bytes_downloaded,
      bytes_total: job.bytes_total,
      cancel_requested: job.cancel_requested,
      next_attempt_at: job.next_attempt_at,
      error_message: job.error_message,
    },
    worker: { online: worker.online },
  };
}

export async function getTranscript(videoId: string) {
  const t = await queryOne<{ id: string; language: string | null; model: string | null }>(
    'select id, language, model from transcripts where video_id = $1',
    [videoId],
  );
  const segments = t
    ? await query<{ idx: number; start_seconds: number; end_seconds: number; text: string }>(
        'select idx, start_seconds, end_seconds, text from transcript_segments where video_id = $1 order by idx',
        [videoId],
      )
    : [];
  return { meta: t, segments };
}

export async function getTechniques(videoId: string) {
  return query<{
    id: number;
    slug: string;
    name_pt: string;
    name_en: string;
    category: string;
    start_seconds: number | null;
    end_seconds: number | null;
    confidence: number;
    mentions: number;
    source: string;
    evidence: string | null;
  }>(
    `select vt.id, t.slug, t.name_pt, t.name_en, t.category, vt.start_seconds, vt.end_seconds, vt.confidence, vt.mentions, vt.source, vt.evidence
       from video_techniques vt join techniques t on t.id = vt.technique_id
      where vt.video_id = $1 order by vt.start_seconds nulls last, vt.confidence desc`,
    [videoId],
  );
}

export interface CatalogTechnique { slug: string; name_pt: string; name_en: string; category: string; videos: number }

/** Catálogo de técnicas/posições para o editor do admin, com quantos vídeos já usam cada uma. */
export async function techniqueCatalog() {
  return query<CatalogTechnique>(
    `select t.slug, t.name_pt, t.name_en, t.category, count(distinct vt.video_id)::int as videos
       from techniques t left join video_techniques vt on vt.technique_id = t.id
      group by t.id order by t.category, t.name_pt`,
  );
}

/** Notas são privadas: cada usuário vê apenas as suas. */
export async function getNotes(videoId: string, userId: string) {
  return query<{ id: string; timestamp_seconds: number | null; body: string; created_at: string }>(
    'select id, timestamp_seconds, body, created_at from notes where video_id = $1 and user_id = $2 order by timestamp_seconds nulls last, created_at',
    [videoId, userId],
  );
}

/** URLs pré-assinadas de curta duração (blob privado) — geradas no servidor a cada render. */
export async function playbackUrls(v: Pick<VideoRecord, 'blob_pathname' | 'thumbnail_pathname'>) {
  const storage = getStorage();
  const [video, thumbnail] = await Promise.all([
    v.blob_pathname ? storage.getPlaybackUrl(v.blob_pathname).catch(() => null) : null,
    v.thumbnail_pathname ? storage.getPlaybackUrl(v.thumbnail_pathname).catch(() => null) : null,
  ]);
  return { video, thumbnail };
}

export async function storageStats() {
  const totals = await queryOne<{
    videos: number;
    with_file: number;
    video_bytes: number;
    audio_files: number;
    audio_bytes: number;
    thumb_bytes: number;
  }>(
    `select count(*)::int as videos,
            count(blob_pathname)::int as with_file,
            coalesce(sum(file_size_bytes) filter (where blob_pathname is not null), 0)::bigint as video_bytes,
            count(audio_pathname)::int as audio_files,
            coalesce(sum(audio_size_bytes) filter (where audio_pathname is not null), 0)::bigint as audio_bytes,
            coalesce(sum(thumbnail_size_bytes) filter (where thumbnail_pathname is not null), 0)::bigint as thumb_bytes
       from videos`,
  );
  const added30d = await queryOne<{ bytes: number }>(
    `select coalesce(sum(coalesce(file_size_bytes,0) + coalesce(audio_size_bytes,0) + coalesce(thumbnail_size_bytes,0)), 0)::bigint as bytes
       from videos where blob_pathname is not null and created_at > now() - interval '30 days'`,
  );
  return { ...totals!, added30dBytes: added30d?.bytes ?? 0 };
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image_url: string | null;
  role: 'admin' | 'user';
  disabled: boolean;
  created_at: string;
  last_seen_at: string | null;
  favorites: number;
  playlists: number;
}

export async function listUsers() {
  return query<UserRow>(
    `select u.id, u.email, u.name, u.image_url, u.role, u.disabled, u.created_at, u.last_seen_at,
            (select count(*)::int from favorites f where f.user_id = u.id) as favorites,
            (select count(*)::int from playlists p where p.user_id = u.id) as playlists
       from users u where u.clerk_id is not null order by u.role, u.created_at`,
  );
}
