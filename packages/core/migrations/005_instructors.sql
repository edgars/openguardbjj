-- Professores que ensinam nos vídeos + perfil enriquecido (BJJ Heroes → Wikipedia → IA).
create table instructors (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  nickname        text,
  team            text,
  belt            text,
  lineage         text,
  nationality     text,
  achievements    text[] not null default '{}',
  summary         text,
  -- De onde veio o perfil. 'ai' = gerado por IA sem fonte de referência (não verificado).
  profile_source  text not null default 'none' check (profile_source in ('bjjheroes', 'wikipedia', 'ai', 'manual', 'none')),
  profile_status  text not null default 'pending' check (profile_status in ('pending', 'ready', 'failed')),
  bjjheroes_url   text,
  wikipedia_url   text,
  fetched_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index instructors_pending_idx on instructors(created_at) where profile_status = 'pending';

-- Sugestões da IA ficam 'suggested' até o admin confirmar; só 'confirmed' é público.
create table video_instructors (
  video_id       uuid not null references videos(id) on delete cascade,
  instructor_id  uuid not null references instructors(id) on delete cascade,
  source         text not null default 'ai' check (source in ('metadata', 'transcript', 'author', 'ai', 'manual')),
  confidence     numeric(4,3) not null default 0.5,
  evidence       text,
  status         text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  created_at     timestamptz not null default now(),
  primary key (video_id, instructor_id)
);
create index video_instructors_confirmed_idx on video_instructors(instructor_id) where status = 'confirmed';
