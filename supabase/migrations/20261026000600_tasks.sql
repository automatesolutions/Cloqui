-- Phase 5: tasks. Workspace > Space > List > Task > Subtask.
-- One read rule: public.can_read_space(). Lists and tasks inherit their space's access.

create type public.task_status_kind as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('urgent', 'high', 'normal', 'low', 'none');

create table public.task_spaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_private boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index task_spaces_ws_idx on public.task_spaces (workspace_id);

create table public.task_space_members (
  space_id uuid not null references public.task_spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  primary key (space_id, user_id)
);

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.task_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  channel_id uuid references public.chat_channels (id) on delete set null,
  position double precision not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index task_lists_space_idx on public.task_lists (space_id);

create table public.task_statuses (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.task_lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind public.task_status_kind not null,
  position double precision not null,
  unique (list_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.task_lists (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  status_id uuid not null references public.task_statuses (id),
  title text not null check (char_length(title) between 1 and 300),
  -- Rich text as Tiptap JSON. Never stored as HTML.
  description jsonb,
  priority public.task_priority not null default 'none',
  start_date date,
  due_date date,
  estimate_minutes integer check (estimate_minutes > 0 and estimate_minutes <= 100000),
  position double precision not null default 0,
  video_id uuid references public.videos (id) on delete set null,
  source_message_id uuid references public.chat_messages (id) on delete set null,
  channel_id uuid references public.chat_channels (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz,
  check (start_date is null or due_date is null or start_date <= due_date)
);
create index tasks_list_idx on public.tasks (list_id, position) where archived_at is null;
create index tasks_parent_idx on public.tasks (parent_id);
create index tasks_due_idx on public.tasks (due_date) where completed_at is null and archived_at is null;

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_labels (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.task_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  tone text not null default 'neutral' check (tone in ('neutral', 'brand', 'attention', 'danger')),
  unique (space_id, name)
);

create table public.task_label_links (
  task_id uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.task_labels (id) on delete cascade,
  primary key (task_id, label_id)
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  done boolean not null default false,
  position double precision not null default 0
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_activity (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index task_activity_task_idx on public.task_activity (task_id, created_at desc);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  object_key text not null,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  uploaded boolean not null default false,
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id);

create table public.task_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.task_lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  view text not null check (view in ('list', 'board', 'calendar', 'timeline')),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Rules ───────────────────────────────────────────────────────────────────
create function public.is_space_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_space_members where space_id = s and user_id = (select auth.uid()))
$$;

create function public.can_read_space(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    where sp.id = s and sp.archived_at is null and (
      public.is_space_member(s)
      or (not sp.is_private and public.is_workspace_member(sp.workspace_id))
    )
  )
$$;

create function public.can_manage_space(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    where sp.id = s and (
      exists (select 1 from public.task_space_members m where m.space_id = s and m.user_id = (select auth.uid()) and m.role = 'admin')
      or public.is_workspace_admin(sp.workspace_id)
    )
  )
$$;

create function public.list_space(l uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select space_id from public.task_lists where id = l
$$;

create function public.task_space(t uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.space_id from public.tasks tk join public.task_lists l on l.id = tk.list_id where tk.id = t
$$;

create function public.can_read_task(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_space(public.task_space(t))
$$;

-- People who may be assigned or added to a space: workspace members (guests only if in the space).
create function public.user_can_join_space(s uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    join public.workspace_members wm on wm.workspace_id = sp.workspace_id and wm.user_id = u
    where sp.id = s
  )
$$;

create function public.user_can_read_space(s uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_spaces sp
    where sp.id = s and (
      exists (select 1 from public.task_space_members m where m.space_id = s and m.user_id = u)
      or (not sp.is_private and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = sp.workspace_id and wm.user_id = u and wm.role in ('owner', 'admin', 'member')
      ))
    )
  )
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.task_spaces enable row level security;
alter table public.task_space_members enable row level security;
alter table public.task_lists enable row level security;
alter table public.task_statuses enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_label_links enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_saved_views enable row level security;

create policy spaces_select on public.task_spaces for select to authenticated using (public.can_read_space(id));
create policy spaces_insert on public.task_spaces for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy spaces_update on public.task_spaces for update to authenticated
  using (public.can_manage_space(id)) with check (public.can_manage_space(id));

create policy space_members_select on public.task_space_members for select to authenticated
  using (user_id = (select auth.uid()) or public.can_read_space(space_id));
create policy space_members_insert on public.task_space_members for insert to authenticated
  with check (
    public.user_can_join_space(space_id, user_id)
    and (public.can_manage_space(space_id) or (public.is_space_member(space_id) and role = 'member'))
  );
create policy space_members_delete on public.task_space_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_space(space_id));

-- Lists, statuses, labels: readers read; space members (or anyone who can read an open space) write.
create policy lists_select on public.task_lists for select to authenticated using (public.can_read_space(space_id));
create policy lists_insert on public.task_lists for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_read_space(space_id));
create policy lists_update on public.task_lists for update to authenticated
  using (public.can_read_space(space_id)) with check (public.can_read_space(space_id));

create policy statuses_select on public.task_statuses for select to authenticated using (public.can_read_space(public.list_space(list_id)));
create policy statuses_write on public.task_statuses for insert to authenticated with check (public.can_read_space(public.list_space(list_id)));
create policy statuses_update on public.task_statuses for update to authenticated
  using (public.can_read_space(public.list_space(list_id))) with check (public.can_read_space(public.list_space(list_id)));
create policy statuses_delete on public.task_statuses for delete to authenticated using (public.can_manage_space(public.list_space(list_id)));

create policy labels_select on public.task_labels for select to authenticated using (public.can_read_space(space_id));
create policy labels_insert on public.task_labels for insert to authenticated with check (public.can_read_space(space_id));
create policy labels_delete on public.task_labels for delete to authenticated using (public.can_manage_space(space_id));

-- Tasks and everything hanging off them: anyone who can read the space can work on tasks.
create policy tasks_select on public.tasks for select to authenticated using (public.can_read_space(public.list_space(list_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_read_space(public.list_space(list_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_read_space(public.list_space(list_id))) with check (public.can_read_space(public.list_space(list_id)));

create policy assignees_select on public.task_assignees for select to authenticated using (public.can_read_task(task_id));
-- You can only assign people who can see the task.
create policy assignees_insert on public.task_assignees for insert to authenticated
  with check (public.can_read_task(task_id) and public.user_can_read_space(public.task_space(task_id), user_id));
create policy assignees_delete on public.task_assignees for delete to authenticated using (public.can_read_task(task_id));

create policy label_links_select on public.task_label_links for select to authenticated using (public.can_read_task(task_id));
create policy label_links_insert on public.task_label_links for insert to authenticated
  with check (
    public.can_read_task(task_id)
    and exists (select 1 from public.task_labels lb where lb.id = label_id and lb.space_id = public.task_space(task_id))
  );
create policy label_links_delete on public.task_label_links for delete to authenticated using (public.can_read_task(task_id));

create policy checklist_select on public.task_checklist_items for select to authenticated using (public.can_read_task(task_id));
create policy checklist_insert on public.task_checklist_items for insert to authenticated with check (public.can_read_task(task_id));
create policy checklist_update on public.task_checklist_items for update to authenticated
  using (public.can_read_task(task_id)) with check (public.can_read_task(task_id));
create policy checklist_delete on public.task_checklist_items for delete to authenticated using (public.can_read_task(task_id));

create policy task_comments_select on public.task_comments for select to authenticated using (public.can_read_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_read_task(task_id));
create policy task_comments_update on public.task_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy task_activity_select on public.task_activity for select to authenticated using (public.can_read_task(task_id));
create policy task_activity_insert on public.task_activity for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.can_read_task(task_id));

create policy task_attachments_select on public.task_attachments for select to authenticated using (public.can_read_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (uploader_id = (select auth.uid()) and public.can_read_task(task_id));
create policy task_attachments_update on public.task_attachments for update to authenticated
  using (uploader_id = (select auth.uid())) with check (uploader_id = (select auth.uid()));
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (uploader_id = (select auth.uid()));

create policy saved_views_own on public.task_saved_views for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_space(public.list_space(list_id)));

-- New lists start with four statuses.
create function public.seed_list_statuses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_statuses (list_id, name, kind, position) values
    (new.id, 'To do', 'todo', 1),
    (new.id, 'In progress', 'in_progress', 2),
    (new.id, 'In review', 'in_progress', 3),
    (new.id, 'Done', 'done', 4);
  return new;
end $$;
create trigger task_lists_seed_statuses after insert on public.task_lists
  for each row execute function public.seed_list_statuses();

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Integrity the app can't break: the status belongs to the task's list, subtasks stay in their
-- parent's list one level deep, and completed_at follows the status.
create function public.validate_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k public.task_status_kind;
begin
  select kind into k from public.task_statuses where id = new.status_id and list_id = new.list_id;
  if k is null then raise exception 'status does not belong to this list' using errcode = '23514'; end if;
  if new.parent_id is not null and not exists (
    select 1 from public.tasks p where p.id = new.parent_id and p.list_id = new.list_id and p.parent_id is null
  ) then
    raise exception 'subtask must be in its parent''s list' using errcode = '23514';
  end if;
  if k = 'done' and new.completed_at is null then new.completed_at := now(); end if;
  if k <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_validate before insert or update on public.tasks
  for each row execute function public.validate_task();

alter publication supabase_realtime add table public.tasks;
revoke all on all tables in schema public from anon;
