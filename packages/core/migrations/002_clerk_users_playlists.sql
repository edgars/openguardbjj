-- Multiusuário com Clerk: super admin (dono da biblioteca) + usuários que organizam
-- favoritos e playlists sobre a biblioteca compartilhada.

alter table users
  add column clerk_id    text unique,
  add column role        text not null default 'user' check (role in ('admin', 'user')),
  add column image_url   text,
  add column disabled    boolean not null default false,
  add column last_seen_at timestamptz;

-- O dono da fase "senha única" é vinculado ao Clerk no 1º login com o mesmo e-mail
-- verificado; só vira admin se esse e-mail for o SUPER_ADMIN_EMAIL (decidido no app).

-- Playlists = as antigas "collections" (sem uso até agora).
alter table collections rename to playlists;
alter table collection_videos rename to playlist_videos;
alter table playlist_videos rename column collection_id to playlist_id;
alter table playlists add column updated_at timestamptz not null default now();
create index playlists_user_idx on playlists(user_id, created_at desc);
create index playlist_videos_order_idx on playlist_videos(playlist_id, position);

create table favorites (
  user_id    uuid not null references users(id) on delete cascade,
  video_id   uuid not null references videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index favorites_video_idx on favorites(video_id);

-- Notas passam a ser privadas por usuário.
create index notes_user_video_idx on notes(user_id, video_id, timestamp_seconds);
