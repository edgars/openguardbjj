-- Busca pública sem acentos ("raspagem" = "Raspagem", "triangulo" = "Triângulo").
create extension if not exists unaccent;

-- unaccent() não é IMMUTABLE; este wrapper permite usá-lo em índices futuros.
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create index if not exists videos_completed_idx on videos(created_at desc) where download_status = 'COMPLETED';
