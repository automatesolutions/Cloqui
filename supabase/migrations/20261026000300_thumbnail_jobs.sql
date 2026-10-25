-- Pick a thumbnail frame on the server (the worker cuts it), instead of drawing the video
-- onto a canvas in the browser, which would need CORS on the private bucket.
alter table public.videos add column thumbnail_at_ms integer check (thumbnail_at_ms >= 0);
alter table public.media_jobs drop constraint media_jobs_kind_check;
alter table public.media_jobs add constraint media_jobs_kind_check check (kind in ('process', 'thumbnail'));
