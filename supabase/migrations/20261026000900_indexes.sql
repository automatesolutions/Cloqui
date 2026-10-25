-- Phase 6 performance: indexes for foreign keys on read paths, and for the ones a bulk delete
-- (retention, deleting a workspace) cascades through. Without them each deleted row scans the table.

-- Read paths
create index task_checklist_items_task_idx on public.task_checklist_items (task_id);
create index task_saved_views_list_idx on public.task_saved_views (list_id, user_id);
create index task_label_links_label_idx on public.task_label_links (label_id);
create index tasks_status_idx on public.tasks (status_id);
create index video_comments_parent_idx on public.video_comments (parent_id) where parent_id is not null;
create index live_rooms_channel_idx on public.live_rooms (channel_id) where channel_id is not null;
create index media_jobs_video_idx on public.media_jobs (video_id);
create index chat_messages_author_idx on public.chat_messages (author_id);

-- Cascades from retention and workspace deletes
create index tasks_source_message_idx on public.tasks (source_message_id) where source_message_id is not null;
create index tasks_video_idx on public.tasks (video_id) where video_id is not null;
create index chat_messages_video_idx on public.chat_messages (video_id) where video_id is not null;
create index chat_attachments_channel_idx on public.chat_attachments (channel_id);
create index notifications_workspace_idx on public.notifications (workspace_id);
