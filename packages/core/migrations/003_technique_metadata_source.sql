-- Técnicas identificadas a partir do título/descrição/hashtags do post (sem timestamp).
alter table video_techniques drop constraint video_techniques_source_check;
alter table video_techniques add constraint video_techniques_source_check
  check (source in ('keyword', 'llm', 'metadata', 'manual'));
