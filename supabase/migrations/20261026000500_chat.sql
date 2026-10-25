-- Phase 4: team chat (channels, DMs, threads, mentions, reactions, attachments, pins),
-- notifications, realtime authorization, and huddles (live rooms linked to a channel).
-- One read rule: public.can_read_channel(). RLS, realtime and search all go through it.

create type public.chat_kind as enum ('channel', 'dm');
create type public.notify_level as enum ('all', 'mentions', 'none');

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.chat_kind not null default 'channel',
  name text check (kind = 'dm' or name ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  topic text not null default '' check (char_length(topic) <= 250),
  is_private boolean not null default false,
  -- Sorted member ids, so the same people always get the same DM.
  dm_key text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (kind = 'channel' or (is_private and dm_key is not null))
);
create unique index chat_channels_name_uq on public.chat_channels (workspace_id, name) where kind = 'channel';
create unique index chat_channels_dm_uq on public.chat_channels (workspace_id, dm_key) where kind = 'dm';

create table public.chat_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  notify public.notify_level not null default 'all',
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.chat_messages (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 8000),
  mentions uuid[] not null default '{}',
  mention_channel boolean not null default false,
  video_id uuid references public.videos (id) on delete set null,
  reply_count integer not null default 0,
  last_reply_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  search tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored
);
create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc) where parent_id is null;
create index chat_messages_thread_idx on public.chat_messages (parent_id, created_at) where parent_id is not null;
create index chat_messages_search_idx on public.chat_messages using gin (search);

create table public.chat_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages (id) on delete cascade,
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  object_key text not null,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at timestamptz not null default now()
);
create index chat_attachments_message_idx on public.chat_attachments (message_id);

-- One inbox for mentions, DMs, replies (and tasks in Phase 5).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null,
  actor_id uuid references auth.users (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  channel_id uuid references public.chat_channels (id) on delete cascade,
  preview text not null default '' check (char_length(preview) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Huddles: a live room that belongs to a channel. Channel members can join without an invite.
alter table public.live_rooms add column channel_id uuid references public.chat_channels (id) on delete cascade;

-- ── Rules ───────────────────────────────────────────────────────────────────
create function public.is_channel_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members where channel_id = c and user_id = (select auth.uid()))
$$;

-- Read: members always. Open channels: every full workspace member (guests only if added).
create function public.can_read_channel(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels ch
    where ch.id = c and (
      public.is_channel_member(c)
      or (ch.kind = 'channel' and not ch.is_private and public.is_workspace_member(ch.workspace_id))
    )
  )
$$;

create function public.can_manage_channel(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels ch
    where ch.id = c and ch.kind = 'channel' and (
      exists (select 1 from public.chat_members m where m.channel_id = c and m.user_id = (select auth.uid()) and m.role = 'admin')
      or public.is_workspace_admin(ch.workspace_id)
    )
  )
$$;

-- Huddles join live_room_role(): channel members (or open-channel readers) are participants.
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
  if room.host_id = uid then return 'host'; end if;

  select i.role into granted from public.live_room_invites i
  where i.room_id = r and (i.user_id = uid or (i.email is not null and lower(i.email::text) = my_email))
  order by i.role limit 1;
  if found then return granted::text; end if;

  if room.channel_id is not null and public.can_read_channel(room.channel_id) then return 'participant'; end if;
  if room.workspace_visible and public.is_workspace_member(room.workspace_id) then return 'participant'; end if;
  return null;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.chat_channels enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.notifications enable row level security;

create policy channels_select on public.chat_channels for select to authenticated
  using (public.can_read_channel(id));
-- Channels are created directly; DMs only through get_or_create_dm().
create policy channels_insert on public.chat_channels for insert to authenticated
  with check (created_by = (select auth.uid()) and kind = 'channel' and public.is_workspace_member(workspace_id));
create policy channels_update on public.chat_channels for update to authenticated
  using (public.can_manage_channel(id)) with check (public.can_manage_channel(id));

-- Members: readers of a channel see its member list. You can always see your own rows.
create policy members_select_chat on public.chat_members for select to authenticated
  using (user_id = (select auth.uid()) or public.can_read_channel(channel_id));
-- Join an open channel yourself, or be added to a (non-DM) channel by its admins or members.
-- Whoever is added must already belong to the channel's workspace. DM membership is fixed at
-- creation (get_or_create_dm).
create function public.user_in_channel_workspace(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels ch
    join public.workspace_members wm on wm.workspace_id = ch.workspace_id and wm.user_id = u
    where ch.id = c and ch.kind = 'channel'
  )
$$;
create policy members_insert_chat on public.chat_members for insert to authenticated
  with check (
    public.user_in_channel_workspace(channel_id, user_id)
    and (
      (user_id = (select auth.uid()) and role = 'member' and public.can_read_channel(channel_id))
      or public.can_manage_channel(channel_id)
      or (public.is_channel_member(channel_id) and role = 'member')
    )
  );
-- Your own settings (notify, last_read_at); admins can change roles.
create policy members_update_chat on public.chat_members for update to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_channel(channel_id))
  with check (user_id = (select auth.uid()) or public.can_manage_channel(channel_id));
create policy members_delete_chat on public.chat_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_channel(channel_id));

create policy messages_select on public.chat_messages for select to authenticated
  using (public.can_read_channel(channel_id));
create policy messages_insert on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_read_channel(channel_id)
    and not exists (select 1 from public.chat_channels c where c.id = channel_id and c.archived_at is not null)
  );
-- Edit or delete only your own. Pinning goes through pin_message().
create policy messages_update_own on public.chat_messages for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy chat_reactions_select on public.chat_reactions for select to authenticated
  using (exists (select 1 from public.chat_messages m where m.id = message_id and public.can_read_channel(m.channel_id)));
create policy chat_reactions_insert on public.chat_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.chat_messages m where m.id = message_id and public.can_read_channel(m.channel_id))
  );
create policy chat_reactions_delete on public.chat_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy attachments_select on public.chat_attachments for select to authenticated
  using (public.can_read_channel(channel_id));
create policy attachments_insert on public.chat_attachments for insert to authenticated
  with check (uploader_id = (select auth.uid()) and public.can_read_channel(channel_id));
create policy attachments_update_own on public.chat_attachments for update to authenticated
  using (uploader_id = (select auth.uid())) with check (uploader_id = (select auth.uid()));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Inserts come from the server after an authorized action (system connection).

-- ── Functions ───────────────────────────────────────────────────────────────
-- Any reader can pin or unpin (like Slack). Doesn't let anyone edit someone else's text.
create function public.pin_message(m uuid, pin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare ch uuid;
begin
  select channel_id into ch from public.chat_messages where id = m and deleted_at is null;
  if ch is null or not public.can_read_channel(ch) then raise exception 'no access' using errcode = '42501'; end if;
  update public.chat_messages
    set pinned_at = case when pin then now() else null end,
        pinned_by = case when pin then (select auth.uid()) else null end
    where id = m;
end $$;

-- Keep thread counters right without trusting the client.
create function public.chat_thread_counter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null then
    update public.chat_messages
      set reply_count = reply_count + 1, last_reply_at = new.created_at
      where id = new.parent_id;
  end if;
  return new;
end $$;
create trigger chat_messages_thread_count after insert on public.chat_messages
  for each row execute function public.chat_thread_counter();

-- The same set of people always gets the same DM. Everyone must be in the workspace.
create function public.get_or_create_dm(ws uuid, others uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  people uuid[];
  key text;
  ch uuid;
  n_known integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = uid) then
    raise exception 'no access' using errcode = '42501';
  end if;
  select array_agg(distinct p order by p) into people from unnest(array_append(others, uid)) p;
  if array_length(people, 1) < 2 or array_length(people, 1) > 9 then
    raise exception 'a DM needs 2 to 9 people' using errcode = '22023';
  end if;
  select count(*) into n_known from public.workspace_members where workspace_id = ws and user_id = any(people);
  if n_known <> array_length(people, 1) then raise exception 'no access' using errcode = '42501'; end if;
  key := array_to_string(people, ',');
  select id into ch from public.chat_channels where workspace_id = ws and kind = 'dm' and dm_key = key;
  if ch is null then
    insert into public.chat_channels (workspace_id, kind, is_private, dm_key, created_by)
      values (ws, 'dm', true, key, uid) returning id into ch;
    insert into public.chat_members (channel_id, user_id) select ch, p from unnest(people) p;
  end if;
  return ch;
end $$;
revoke all on function public.get_or_create_dm(uuid, uuid[]) from public, anon;
grant execute on function public.get_or_create_dm(uuid, uuid[]) to authenticated;

revoke all on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.pin_message(uuid, boolean) to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Postgres change events respect RLS for each subscriber.
alter publication supabase_realtime add table public.chat_messages, public.chat_reactions, public.notifications;

-- Typing and presence use private realtime channels named "chat:<channel id>".
-- Only people who can read the channel may listen or send.
create function public.realtime_chat_topic_allowed(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^chat:[0-9a-f-]{36}$' then public.can_read_channel(substring(topic from 6)::uuid)
    else false
  end
$$;
create policy "chat topic readers" on realtime.messages for select to authenticated
  using (public.realtime_chat_topic_allowed(realtime.topic()));
create policy "chat topic senders" on realtime.messages for insert to authenticated
  with check (public.realtime_chat_topic_allowed(realtime.topic()));

revoke all on all tables in schema public from anon;
