-- Workspaces that require two-step sign-in: without an aal2 session you get nothing from them,
-- whichever way you were given access (membership, a direct share, a channel or space invite).
-- Every top-level access function checks workspace_2fa_ok(). create or replace keeps each
-- function's identity, so the policies that already use them pick this up.

create function public.workspace_2fa_ok(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not coalesce((select w.require_2fa from public.workspaces w where w.id = ws), false)
$$;

create or replace function public.workspace_role_of(ws uuid) returns public.workspace_role
language sql stable security definer set search_path = '' as $$
  select role from public.workspace_members
  where workspace_id = ws and user_id = (select auth.uid()) and public.workspace_2fa_ok(ws)
$$;

create or replace function public.shares_workspace_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid())
      and b.user_id = other
      and a.role in ('owner', 'admin', 'member')
      and public.workspace_2fa_ok(a.workspace_id)
  )
$$;

create or replace function public.video_role(v uuid) returns text
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
  if not public.workspace_2fa_ok(vid.workspace_id) then return null; end if;
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

create or replace function public.live_room_role(r uuid) returns text
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
  if not public.workspace_2fa_ok(room.workspace_id) then return null; end if;
  if room.host_id = uid then return 'host'; end if;

  select i.role into granted from public.live_room_invites i
  where i.room_id = r and (i.user_id = uid or (i.email is not null and lower(i.email::text) = my_email))
  order by i.role limit 1;
  if found then return granted::text; end if;

  if room.channel_id is not null and public.can_read_channel(room.channel_id) then return 'participant'; end if;
  if room.workspace_visible and public.is_workspace_member(room.workspace_id) then return 'participant'; end if;
  return null;
end $$;

create or replace function public.can_read_channel(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels ch
    where ch.id = c and public.workspace_2fa_ok(ch.workspace_id) and (
      public.is_channel_member(c)
      or (ch.kind = 'channel' and not ch.is_private and public.is_workspace_member(ch.workspace_id))
    )
  )
$$;

create or replace function public.can_manage_channel(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels ch
    where ch.id = c and ch.kind = 'channel' and public.workspace_2fa_ok(ch.workspace_id) and (
      exists (select 1 from public.chat_members m where m.channel_id = c and m.user_id = (select auth.uid()) and m.role = 'admin')
      or public.is_workspace_admin(ch.workspace_id)
    )
  )
$$;

create or replace function public.can_read_space(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    where sp.id = s and sp.archived_at is null and public.workspace_2fa_ok(sp.workspace_id) and (
      public.is_space_member(s)
      or (not sp.is_private and public.is_workspace_member(sp.workspace_id))
    )
  )
$$;

create or replace function public.can_manage_space(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    where sp.id = s and public.workspace_2fa_ok(sp.workspace_id) and (
      exists (select 1 from public.task_space_members m where m.space_id = s and m.user_id = (select auth.uid()) and m.role = 'admin')
      or public.is_workspace_admin(sp.workspace_id)
    )
  )
$$;
