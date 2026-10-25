-- Phase 3: invite-only live rooms with a waiting room and host controls (media runs on LiveKit).
-- One rule decides who may join: public.live_room_role(). A join token is only minted after it
-- says yes AND the waiting room lets the person in.

create type public.live_room_status as enum ('open', 'ended');
create type public.live_role as enum ('cohost', 'participant');

create table public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status public.live_room_status not null default 'open',
  waiting_room boolean not null default true,
  locked boolean not null default false,
  workspace_visible boolean not null default false,
  -- Set while someone is connected. Lets Home show "Live now".
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index live_rooms_ws_idx on public.live_rooms (workspace_id, created_at desc);

create table public.live_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.live_rooms (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email citext,
  role public.live_role not null default 'participant',
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (email is not null))
);
create unique index live_invites_user_uq on public.live_room_invites (room_id, user_id) where user_id is not null;
create unique index live_invites_email_uq on public.live_room_invites (room_id, email) where email is not null;

-- Waiting room state per person. 'removed' means the host removed them: they can't come back.
create table public.live_room_admissions (
  room_id uuid not null references public.live_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('waiting', 'admitted', 'denied', 'removed')),
  updated_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  primary key (room_id, user_id)
);

-- ── The one rule ────────────────────────────────────────────────────────────
create function public.live_room_role(r uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  my_email text := lower(auth.jwt() ->> 'email');
  room public.live_rooms;
  granted public.live_role;
begin
  if uid is null then return null; end if;
  select * into room from public.live_rooms where id = r;
  if not found or room.status = 'ended' then return null; end if;
  if room.host_id = uid then return 'host'; end if;

  select i.role into granted from public.live_room_invites i
  where i.room_id = r and (i.user_id = uid or (i.email is not null and lower(i.email::text) = my_email))
  order by i.role limit 1; -- 'cohost' sorts first
  if found then return granted::text; end if;

  if room.workspace_visible and public.is_workspace_member(room.workspace_id) then return 'participant'; end if;
  return null;
end $$;

create function public.can_see_live_room(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.live_room_role(r) is not null $$;

create function public.can_manage_live_room(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.live_room_role(r) in ('host', 'cohost') $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.live_rooms enable row level security;
alter table public.live_room_invites enable row level security;
alter table public.live_room_admissions enable row level security;

create policy live_rooms_select on public.live_rooms for select to authenticated
  using (public.can_see_live_room(id) or host_id = (select auth.uid()));
create policy live_rooms_insert on public.live_rooms for insert to authenticated
  with check (host_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy live_rooms_update on public.live_rooms for update to authenticated
  using (public.can_manage_live_room(id) or host_id = (select auth.uid()))
  with check (public.can_manage_live_room(id) or host_id = (select auth.uid()));

create policy live_invites_select on public.live_room_invites for select to authenticated
  using (public.can_see_live_room(room_id));
create policy live_invites_insert on public.live_room_invites for insert to authenticated
  with check (public.can_manage_live_room(room_id) and invited_by = (select auth.uid()));
create policy live_invites_update on public.live_room_invites for update to authenticated
  using (public.can_manage_live_room(room_id)) with check (public.can_manage_live_room(room_id));
create policy live_invites_delete on public.live_room_invites for delete to authenticated
  using (public.can_manage_live_room(room_id));

-- Admissions: you see your own row; hosts see and decide all. Joining the queue goes through
-- request_live_admission(), because a not-yet-admitted person must not write other rows.
create policy live_adm_select on public.live_room_admissions for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_live_room(room_id));
create policy live_adm_update on public.live_room_admissions for update to authenticated
  using (public.can_manage_live_room(room_id)) with check (public.can_manage_live_room(room_id));

-- Put yourself in the waiting room (or report your current state). Never upgrades a
-- 'removed' or 'denied' person back to waiting.
create function public.request_live_admission(r uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  role text := public.live_room_role(r);
  st text;
begin
  if uid is null or role is null then return null; end if;
  if role in ('host', 'cohost') then return 'admitted'; end if;
  insert into public.live_room_admissions (room_id, user_id, status)
    values (r, uid, case when (select waiting_room from public.live_rooms where id = r) then 'waiting' else 'admitted' end)
    on conflict (room_id, user_id) do nothing;
  select status into st from public.live_room_admissions where room_id = r and user_id = uid;
  return st;
end $$;

revoke all on function public.request_live_admission(uuid) from public, anon;
grant execute on function public.request_live_admission(uuid) to authenticated;
revoke all on all tables in schema public from anon;
