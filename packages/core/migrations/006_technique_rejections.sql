-- Técnicas que o admin removeu de um vídeo: a reanálise automática (worker) não as recoloca.
-- Adicionar a técnica de novo à mão apaga a rejeição.
create table video_technique_rejections (
  video_id     uuid not null references videos(id) on delete cascade,
  technique_id integer not null references techniques(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (video_id, technique_id)
);
