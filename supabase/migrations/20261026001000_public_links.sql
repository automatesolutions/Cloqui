-- Opt-in public links for videos. Off unless the video's owner turns one on.
-- Workspace admins can block them for the whole workspace, which also deletes every existing link.
-- The rest of Cloqui (rooms, channels, tasks, files) stays invite-only.

alter table public.workspaces
  add column allow_public_links boolean not null default true;

-- In its own table, not a column on videos: people the video is shared with can read the
-- videos row, but only the owner may read the link.
create table public.video_public_links (
  video_id uuid primary key references public.videos (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Passcode unlocks for people watching through a public link. They have no account, so the
-- unlock is a random token held by their browser tab; only its hash is stored. System only.
create table public.video_public_unlocks (
  token_hash text primary key,
  video_id uuid not null references public.videos (id) on delete cascade,
  passcode_version integer not null,
  expires_at timestamptz not null
);
create index video_public_unlocks_video_idx on public.video_public_unlocks (video_id);

create function public.public_links_allowed(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select w.allow_public_links
    from public.videos x join public.workspaces w on w.id = x.workspace_id
    where x.id = v
  ), false)
$$;

-- The one rule for "does this public link work right now". Called by the server for people
-- who aren't signed in, so it isn't granted to anon or authenticated.
create function public.public_video_id(t text) returns uuid
language sql stable security definer set search_path = '' as $$
  select v.id
  from public.video_public_links l
  join public.videos v on v.id = l.video_id
  join public.workspaces w on w.id = v.workspace_id
  where l.token = t
    and v.deleted_at is null
    and v.status <> 'uploading'
    and w.allow_public_links
    and (v.access_expires_at is null or v.access_expires_at > now())
$$;

-- Lets everyone who can see a video know it also has a public link (for the AccessChip),
-- without showing them the link itself.
create function public.has_public_link(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_video(v)
    and public.public_links_allowed(v)
    and exists (select 1 from public.video_public_links l where l.video_id = v)
$$;

create function public.can_remove_public_link(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_video_owner(v)
    or exists (
      select 1 from public.videos x
      where x.id = v and public.is_workspace_admin(x.workspace_id)
    )
$$;

alter table public.video_public_links enable row level security;
alter table public.video_public_unlocks enable row level security;

create policy public_links_select on public.video_public_links for select to authenticated
  using (public.is_video_owner(video_id));
create policy public_links_insert on public.video_public_links for insert to authenticated
  with check (
    public.is_video_owner(video_id)
    and created_by = (select auth.uid())
    and public.public_links_allowed(video_id)
  );
-- No update: turning a link off and on again makes a new one, so the old one dies.
create policy public_links_delete on public.video_public_links for delete to authenticated
  using (public.can_remove_public_link(video_id));
-- video_public_unlocks: no policies. Only the server (system connection) touches it.

revoke all on function public.public_video_id(text) from public, anon, authenticated;
revoke all on function public.public_links_allowed(uuid) from public, anon;
revoke all on function public.has_public_link(uuid) from public, anon;
revoke all on function public.can_remove_public_link(uuid) from public, anon;
grant execute on function public.public_links_allowed(uuid) to authenticated;
grant execute on function public.has_public_link(uuid) to authenticated;
grant execute on function public.can_remove_public_link(uuid) to authenticated;
revoke all on table public.video_public_unlocks from anon, authenticated;
revoke all on all tables in schema public from anon;
