-- Phase 2: videos, invite-only sharing, access requests, comments, reactions, media jobs.
-- One rule decides who can see a video: public.video_role(). RLS and the app both use it.
-- Workspace admins do NOT see private videos by default. They see the audit trail only.

create type public.video_status as enum ('uploading', 'processing', 'ready', 'failed');
create type public.item_role as enum ('editor', 'viewer');

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  status public.video_status not null default 'uploading',
  mime_type text not null,
  size_bytes bigint not null default 0,
  duration_ms integer,
  width integer,
  height integer,
  -- Object keys in the private bucket. Useless without a server-signed URL.
  original_key text not null,
  playback_key text,
  thumbnail_key text,
  captions_key text,
  trim_start_ms integer check (trim_start_ms >= 0),
  trim_end_ms integer check (trim_end_ms > 0),
  -- Sharing controls
  workspace_visible boolean not null default false,
  access_expires_at timestamptz,
  view_only boolean not null default false,
  watermark boolean not null default false,
  passcode_hash text,
  passcode_version integer not null default 0,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (trim_end_ms is null or trim_start_ms is null or trim_end_ms > trim_start_ms)
);
create index videos_ws_created_idx on public.videos (workspace_id, created_at desc) where deleted_at is null;
create index videos_owner_idx on public.videos (owner_id) where deleted_at is null;

-- Who a video is shared with. Either an account (user_id) or an email that has no account yet.
create table public.video_grants (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email citext,
  role public.item_role not null default 'viewer',
  granted_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (email is not null))
);
create unique index video_grants_user_uq on public.video_grants (video_id, user_id) where user_id is not null;
create unique index video_grants_email_uq on public.video_grants (video_id, email) where email is not null;
create index video_grants_user_idx on public.video_grants (user_id);
create index video_grants_email_idx on public.video_grants (email);

create table public.video_access_requests (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz
);
create unique index video_access_requests_open_uq
  on public.video_access_requests (video_id, requester_id) where status = 'pending';

-- Per-person passcode unlocks. Changing the passcode bumps passcode_version and locks everyone again.
create table public.video_passcode_unlocks (
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  passcode_version integer not null,
  unlocked_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.video_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  at_ms integer check (at_ms >= 0),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index video_comments_video_idx on public.video_comments (video_id, created_at);

create table public.video_reactions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  at_ms integer check (at_ms >= 0),
  created_at timestamptz not null default now()
);
create index video_reactions_video_idx on public.video_reactions (video_id);

-- Work for the media worker. Claimed with FOR UPDATE SKIP LOCKED.
create table public.media_jobs (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos (id) on delete cascade,
  kind text not null check (kind in ('process')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_jobs_queue_idx on public.media_jobs (status, run_after) where status = 'queued';

-- ── The one access rule ─────────────────────────────────────────────────────
-- Returns 'owner', 'editor', 'viewer' or null for the signed-in person.
-- Expiry (access_expires_at) applies to everyone except the owner.
create function public.video_role(v uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  my_email text := lower(auth.jwt() ->> 'email');
  vid public.videos;
  granted public.item_role;
begin
  if uid is null then return null; end if;
  select * into vid from public.videos where id = v and deleted_at is null;
  if not found then return null; end if;
  if vid.owner_id = uid then return 'owner'; end if;
  if vid.access_expires_at is not null and vid.access_expires_at <= now() then return null; end if;

  select g.role into granted
  from public.video_grants g
  where g.video_id = v
    and (g.user_id = uid or (g.email is not null and lower(g.email::text) = my_email))
  order by g.role -- 'editor' sorts before 'viewer'
  limit 1;
  if found then return granted::text; end if;

  if vid.workspace_visible and public.is_workspace_member(vid.workspace_id) then
    return 'viewer';
  end if;
  return null;
end $$;

create function public.can_view_video(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.video_role(v) is not null
$$;

create function public.can_edit_video(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.video_role(v) in ('owner', 'editor')
$$;

create function public.is_video_owner(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.video_role(v) = 'owner'
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.videos enable row level security;
alter table public.video_grants enable row level security;
alter table public.video_access_requests enable row level security;
alter table public.video_passcode_unlocks enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_reactions enable row level security;
alter table public.media_jobs enable row level security;

-- videos: you see what video_role() allows. Members create videos in their workspace.
create policy videos_select on public.videos for select to authenticated
  using (public.can_view_video(id));
create policy videos_insert on public.videos for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy videos_update on public.videos for update to authenticated
  using (public.can_edit_video(id)) with check (public.can_edit_video(id));
-- Hard deletes are not allowed from the app; the owner soft-deletes via update.

-- grants: the owner manages them. People with access see who else has access.
create policy grants_select on public.video_grants for select to authenticated
  using (public.can_view_video(video_id));
create policy grants_insert on public.video_grants for insert to authenticated
  with check (public.is_video_owner(video_id) and granted_by = (select auth.uid()));
create policy grants_update on public.video_grants for update to authenticated
  using (public.is_video_owner(video_id)) with check (public.is_video_owner(video_id));
create policy grants_delete on public.video_grants for delete to authenticated
  using (public.is_video_owner(video_id));

-- access requests: the requester sees their own; the owner sees and resolves all for the video.
create policy requests_select on public.video_access_requests for select to authenticated
  using (requester_id = (select auth.uid()) or public.is_video_owner(video_id));
create policy requests_update on public.video_access_requests for update to authenticated
  using (public.is_video_owner(video_id)) with check (public.is_video_owner(video_id));
-- Creating a request goes through request_video_access(), because the requester can't see the video.

create policy unlocks_select on public.video_passcode_unlocks for select to authenticated
  using (user_id = (select auth.uid()));

-- comments and reactions: anyone who can view; only your own for edit/delete.
create policy comments_select on public.video_comments for select to authenticated
  using (public.can_view_video(video_id));
create policy comments_insert on public.video_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_video(video_id));
create policy comments_update on public.video_comments for update to authenticated
  using (author_id = (select auth.uid()) and public.can_view_video(video_id))
  with check (author_id = (select auth.uid()));

create policy reactions_select on public.video_reactions for select to authenticated
  using (public.can_view_video(video_id));
create policy reactions_insert on public.video_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_video(video_id));
create policy reactions_delete on public.video_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- media_jobs: no policies. Only the worker (service connection) touches them.

-- Item audit: the video's owner can read events about that video, on top of workspace admins.
create policy audit_select_video_owner on public.audit_events for select to authenticated
  -- CASE guarantees the uuid cast only runs on video rows.
  using (case when target_type = 'video' then public.is_video_owner(target_id::uuid) else false end);

-- ── Functions ───────────────────────────────────────────────────────────────
-- Ask the owner for access. Works without seeing the video. Returns nothing either way,
-- so it can't be used to learn whether a video id exists.
create function public.request_video_access(v uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  vid public.videos;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into vid from public.videos where id = v and deleted_at is null;
  if not found or public.video_role(v) is not null then return; end if;
  insert into public.video_access_requests (video_id, requester_id) values (v, uid)
    on conflict do nothing;
end $$;

-- What a denied person may learn: the owner's first name, and nothing else.
create function public.video_owner_first_name(v uuid) returns text
language sql stable security definer set search_path = '' as $$
  select split_part(p.display_name, ' ', 1)
  from public.videos vd join public.profiles p on p.id = vd.owner_id
  where vd.id = v and vd.deleted_at is null and (select auth.uid()) is not null
$$;

-- Keep updated_at honest.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger videos_touch before update on public.videos
  for each row execute function public.touch_updated_at();

revoke all on function public.request_video_access(uuid) from public, anon;
revoke all on function public.video_owner_first_name(uuid) from public, anon;
grant execute on function public.request_video_access(uuid) to authenticated;
grant execute on function public.video_owner_first_name(uuid) to authenticated;
revoke all on table public.media_jobs from anon, authenticated;
revoke all on all tables in schema public from anon;
