-- Phase 1: people, workspaces, members, invites, audit log.
-- Every table has RLS on from the start. Writes that need several rows to stay consistent
-- go through SECURITY DEFINER functions that check auth.uid() themselves.

create extension if not exists citext;

-- ── Types ───────────────────────────────────────────────────────────────────
create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');

-- ── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Copied from auth.users so co-members can see it under RLS (auth.users is not readable).
  email citext not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- New auth user → profile. Name comes from sign-up metadata, else the email's local part.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(new.email, '@', 1)), 80)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ── Workspaces ──────────────────────────────────────────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  -- When set, only people with this email domain can join (except invited guests).
  allowed_email_domain citext check (allowed_email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email citext not null,
  role public.workspace_role not null check (role <> 'owner'),
  -- sha256 of the token in the link. The token itself is never stored.
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);
create index workspace_invites_ws_idx on public.workspace_invites (workspace_id);
create unique index workspace_invites_one_open_per_email
  on public.workspace_invites (workspace_id, email)
  where accepted_at is null and revoked_at is null;

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_ws_time_idx on public.audit_events (workspace_id, created_at desc);
create index audit_events_target_idx on public.audit_events (target_type, target_id, created_at desc);

-- Server-only token buckets for rate limiting. No policies: only the service role can touch it.
create table public.rate_limits (
  key text primary key,
  tokens double precision not null,
  updated_at timestamptz not null default now()
);

-- ── Helper functions (used by policies) ─────────────────────────────────────
-- SECURITY DEFINER so policies on workspace_members don't recurse into themselves.
create function public.workspace_role_of(ws uuid) returns public.workspace_role
language sql stable security definer set search_path = '' as $$
  select role from public.workspace_members
  where workspace_id = ws and user_id = (select auth.uid())
$$;

-- Full members (owner/admin/member). Guests only see items shared with them, not the workspace.
create function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.workspace_role_of(ws) in ('owner', 'admin', 'member'), false)
$$;

create function public.is_workspace_admin(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.workspace_role_of(ws) in ('owner', 'admin'), false)
$$;

create function public.shares_workspace_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid())
      and b.user_id = other
      and a.role in ('owner', 'admin', 'member')
  )
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.audit_events enable row level security;
alter table public.rate_limits enable row level security;

-- profiles: yourself, and people you share a workspace with as a full member.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces: members read; admins update; creation goes through create_workspace().
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.workspace_role_of(id) = 'owner');

-- members: full members see the member list. Admins change roles and remove people,
-- but nobody can add, change or remove an owner through a plain query.
create policy members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id) or user_id = (select auth.uid()));
create policy members_update on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id) and role <> 'owner')
  with check (public.is_workspace_admin(workspace_id) and role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using (
    role <> 'owner'
    and (public.is_workspace_admin(workspace_id) or user_id = (select auth.uid()))
  );

-- invites: admins only. Accepting goes through accept_invite().
create policy invites_select on public.workspace_invites for select to authenticated
  using (public.is_workspace_admin(workspace_id));
create policy invites_insert on public.workspace_invites for insert to authenticated
  with check (public.is_workspace_admin(workspace_id) and invited_by = (select auth.uid()));
create policy invites_update on public.workspace_invites for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- audit: admins read; members append events about themselves; nobody edits or deletes.
create policy audit_select on public.audit_events for select to authenticated
  using (public.is_workspace_admin(workspace_id));
create policy audit_insert on public.audit_events for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and actor_id = (select auth.uid()));

-- ── Functions that need several writes ──────────────────────────────────────
create function public.create_workspace(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ws uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.workspaces (name, slug, created_by) values (trim(p_name), lower(p_slug), uid)
    returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into public.audit_events (workspace_id, actor_id, action, target_type, target_id)
    values (ws, uid, 'workspace.created', 'workspace', ws::text);
  return ws;
end $$;

-- Accept an invite by its token hash. Only works for the invited email, before expiry,
-- and respects the workspace's email-domain rule for non-guests.
create function public.accept_invite(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  my_email text := lower(auth.jwt() ->> 'email');
  inv public.workspace_invites;
  domain text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select * into inv from public.workspace_invites where token_hash = p_token_hash for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null
     or inv.expires_at < now() then
    raise exception 'invite not valid' using errcode = 'P0002';
  end if;
  if my_email is null or lower(inv.email::text) <> my_email then
    raise exception 'invite is for a different email' using errcode = '42501';
  end if;

  select lower(allowed_email_domain::text) into domain from public.workspaces where id = inv.workspace_id;
  if domain is not null and inv.role <> 'guest' and split_part(my_email, '@', 2) <> domain then
    raise exception 'email domain not allowed' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, uid, inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into public.audit_events (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (inv.workspace_id, uid, 'member.joined', 'user', uid::text,
            jsonb_build_object('role', inv.role, 'invite_id', inv.id));
  return inv.workspace_id;
end $$;

-- Token bucket. Returns true when the call is allowed. Service role only.
create function public.rate_limit_take(p_key text, p_capacity int, p_refill_per_sec double precision)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t double precision;
begin
  insert into public.rate_limits as r (key, tokens, updated_at)
  values (p_key, p_capacity - 1, now())
  on conflict (key) do update
    set tokens = least(p_capacity,
                       r.tokens + extract(epoch from (now() - r.updated_at)) * p_refill_per_sec) - 1,
        updated_at = now()
  returning tokens into t;
  if t < 0 then
    update public.rate_limits set tokens = 0 where key = p_key;
    return false;
  end if;
  return true;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function public.rate_limit_take(text, int, double precision) from public, anon, authenticated;
revoke all on function public.create_workspace(text, text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
revoke all on table public.rate_limits from anon, authenticated;
-- anon gets nothing in public.
revoke all on all tables in schema public from anon;
