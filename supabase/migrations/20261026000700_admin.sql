-- Phase 6: workspace security settings, retention, and task automations.

alter table public.workspaces
  add column require_2fa boolean not null default false,
  -- null = keep forever. Enforced by the retention job (POST /api/cron/retention).
  add column retention_video_days integer check (retention_video_days between 7 and 3650),
  add column retention_message_days integer check (retention_message_days between 7 and 3650);

-- "When a task moves to <status>, do <action>." Simple on purpose.
create table public.task_automations (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.task_lists (id) on delete cascade,
  status_id uuid not null references public.task_statuses (id) on delete cascade,
  action text not null check (action in ('notify_assignees', 'notify_user', 'post_channel')),
  target_user_id uuid references auth.users (id) on delete cascade,
  target_channel_id uuid references public.chat_channels (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check (
    (action = 'notify_assignees' and target_user_id is null and target_channel_id is null)
    or (action = 'notify_user' and target_user_id is not null and target_channel_id is null)
    or (action = 'post_channel' and target_channel_id is not null and target_user_id is null)
  )
);
create index task_automations_list_idx on public.task_automations (list_id, status_id);

alter table public.task_automations enable row level security;

create policy automations_select on public.task_automations for select to authenticated
  using (public.can_read_space(public.list_space(list_id)));
-- The status must belong to the list; a notified person must be able to see the list;
-- a channel must be readable by whoever sets it up.
create policy automations_insert on public.task_automations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_read_space(public.list_space(list_id))
    and exists (select 1 from public.task_statuses s where s.id = status_id and s.list_id = task_automations.list_id)
    and (target_user_id is null or public.user_can_read_space(public.list_space(list_id), target_user_id))
    and (target_channel_id is null or public.can_read_channel(target_channel_id))
  );
create policy automations_delete on public.task_automations for delete to authenticated
  using (public.can_read_space(public.list_space(list_id)));

revoke all on all tables in schema public from anon;
