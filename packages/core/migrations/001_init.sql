-- BJJ Video Intelligence — schema inicial
-- Binários (MP4/MP3/JPG) NUNCA ficam no Postgres: apenas URLs/pathnames do Vercel Blob.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  created_at  timestamptz not null default now()
);

create table videos (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  platform               text not null check (platform in ('youtube','youtube_shorts','instagram','upload')),
  source_url             text,
  external_id            text,
  title                  text,
  description            text,
  author                 text,
  duration_seconds       numeric(10,2),

  thumbnail_blob_url     text,
  thumbnail_pathname     text,
  thumbnail_size_bytes   bigint,

  video_blob_url         text,
  blob_pathname          text,           -- pathname do MP4 no Blob
  file_size_bytes        bigint,
  mime_type              text,
  resolution             text,           -- ex.: 1280x720
  video_codec            text,
  audio_codec            text,

  audio_blob_url         text,
  audio_pathname         text,
  audio_size_bytes       bigint,

  requested_quality      integer not null default 720 check (requested_quality in (480,720,1080)),
  download_status        text not null default 'PENDING'
                         check (download_status in ('PENDING','EXTRACTING_METADATA','DOWNLOADING','CONVERTING',
                                                    'UPLOADING','TRANSCRIBING','ANALYZING','COMPLETED','FAILED','CANCELLED')),
  transcription_status   text not null default 'NOT_REQUESTED'
                         check (transcription_status in ('NOT_REQUESTED','PENDING','PROCESSING','COMPLETED','FAILED')),
  analysis_status        text not null default 'NOT_REQUESTED'
                         check (analysis_status in ('NOT_REQUESTED','PENDING','PROCESSING','COMPLETED','FAILED')),
  processing_progress    integer not null default 0 check (processing_progress between 0 and 100),
  download_authorized    boolean not null default false,
  auto_transcribe        boolean not null default true,
  auto_analyze           boolean not null default true,
  error_message          text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index videos_user_idx on videos(user_id, created_at desc);
create index videos_external_idx on videos(user_id, platform, external_id);
create trigger videos_updated_at before update on videos for each row execute function set_updated_at();

create table download_jobs (
  id                uuid primary key default gen_random_uuid(),
  video_id          uuid not null references videos(id) on delete cascade,
  kind              text not null default 'INGEST'
                    check (kind in ('INGEST','PROCESS_UPLOAD','RETRANSCRIBE','REANALYZE')),
  status            text not null default 'PENDING'
                    check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  stage             text,
  attempts          integer not null default 0,
  max_attempts      integer not null default 4,
  progress          integer not null default 0 check (progress between 0 and 100),
  bytes_downloaded  bigint,
  bytes_total       bigint,
  options           jsonb not null default '{}'::jsonb,
  cancel_requested  boolean not null default false,
  worker_id         text,
  lease_expires_at  timestamptz,
  next_attempt_at   timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- No máximo um job ativo por vídeo: evita downloads duplicados.
create unique index download_jobs_one_active on download_jobs(video_id) where status in ('PENDING','RUNNING');
create index download_jobs_claim_idx on download_jobs(status, next_attempt_at);
create trigger download_jobs_updated_at before update on download_jobs for each row execute function set_updated_at();

create table worker_heartbeats (
  worker_id     text primary key,
  hostname      text,
  version       text,
  current_job   uuid,
  capabilities  jsonb not null default '{}'::jsonb,
  last_seen_at  timestamptz not null default now()
);

create table transcripts (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null unique references videos(id) on delete cascade,
  language    text,
  model       text,
  full_text   text not null default '',
  created_at  timestamptz not null default now()
);

create table transcript_segments (
  id             bigserial primary key,
  transcript_id  uuid not null references transcripts(id) on delete cascade,
  video_id       uuid not null references videos(id) on delete cascade,
  idx            integer not null,
  start_seconds  numeric(10,2) not null,
  end_seconds    numeric(10,2) not null,
  text           text not null
);
create index transcript_segments_video_idx on transcript_segments(video_id, idx);

create table techniques (
  id        serial primary key,
  slug      text not null unique,
  name_pt   text not null,
  name_en   text not null,
  category  text not null,
  aliases   text[] not null default '{}'
);

-- Classificações: técnica X aparece no vídeo Y no intervalo [start, end]
create table video_techniques (
  id             bigserial primary key,
  video_id       uuid not null references videos(id) on delete cascade,
  technique_id   integer not null references techniques(id) on delete cascade,
  start_seconds  numeric(10,2),
  end_seconds    numeric(10,2),
  confidence     numeric(4,3) not null default 0.5,
  mentions       integer not null default 1,
  source         text not null default 'keyword' check (source in ('keyword','llm','manual')),
  evidence       text,
  created_at     timestamptz not null default now()
);
create index video_techniques_video_idx on video_techniques(video_id);
create index video_techniques_technique_idx on video_techniques(technique_id);

create table notes (
  id                 uuid primary key default gen_random_uuid(),
  video_id           uuid not null references videos(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  timestamp_seconds  numeric(10,2),
  body               text not null,
  created_at         timestamptz not null default now()
);
create index notes_video_idx on notes(video_id, timestamp_seconds);

create table collections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now()
);

create table collection_videos (
  collection_id  uuid not null references collections(id) on delete cascade,
  video_id       uuid not null references videos(id) on delete cascade,
  position       integer not null default 0,
  added_at       timestamptz not null default now(),
  primary key (collection_id, video_id)
);
