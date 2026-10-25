// Typed mirror of supabase/migrations. The SQL files (with RLS) are the source of truth.
import {
  bigint,
  boolean,
  date,
  integer,
  customType,
  doublePrecision,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

const citext = customType<{ data: string }>({ dataType: () => "citext" })
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" })

const authSchema = pgSchema("auth")
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
})

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member", "guest"])
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number]

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: citext("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: citext("slug").notNull().unique(),
  allowedEmailDomain: citext("allowed_email_domain"),
  createdBy: uuid("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: workspaceRole("role").notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]
)

export const workspaceInvites = pgTable("workspace_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  email: citext("email").notNull(),
  role: workspaceRole("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedBy: uuid("accepted_by"),
  revokedAt: ts("revoked_at"),
})

export const auditEvents = pgTable("audit_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: uuid("workspace_id").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  tokens: doublePrecision("tokens").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
})

// ── Phase 2: videos ─────────────────────────────────────────────────────────
export const videoStatus = pgEnum("video_status", ["uploading", "processing", "ready", "failed"])
export const itemRole = pgEnum("item_role", ["editor", "viewer"])
export type ItemRole = (typeof itemRole.enumValues)[number]
export type VideoRole = "owner" | ItemRole

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: videoStatus("status").notNull().default("uploading"),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  durationMs: integer("duration_ms"),
  width: integer("width"),
  height: integer("height"),
  originalKey: text("original_key").notNull(),
  playbackKey: text("playback_key"),
  thumbnailKey: text("thumbnail_key"),
  thumbnailAtMs: integer("thumbnail_at_ms"),
  captionsKey: text("captions_key"),
  trimStartMs: integer("trim_start_ms"),
  trimEndMs: integer("trim_end_ms"),
  workspaceVisible: boolean("workspace_visible").notNull().default(false),
  accessExpiresAt: ts("access_expires_at"),
  viewOnly: boolean("view_only").notNull().default(false),
  watermark: boolean("watermark").notNull().default(false),
  passcodeHash: text("passcode_hash"),
  passcodeVersion: integer("passcode_version").notNull().default(0),
  processingError: text("processing_error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  deletedAt: ts("deleted_at"),
})

export const videoGrants = pgTable("video_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull(),
  userId: uuid("user_id"),
  email: citext("email"),
  role: itemRole("role").notNull().default("viewer"),
  grantedBy: uuid("granted_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const videoAccessRequests = pgTable("video_access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull(),
  requesterId: uuid("requester_id").notNull(),
  status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: ts("resolved_at"),
})

export const videoPasscodeUnlocks = pgTable(
  "video_passcode_unlocks",
  {
    videoId: uuid("video_id").notNull(),
    userId: uuid("user_id").notNull(),
    passcodeVersion: integer("passcode_version").notNull(),
    unlockedAt: ts("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] })]
)

export const videoComments = pgTable("video_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull(),
  authorId: uuid("author_id").notNull(),
  parentId: uuid("parent_id"),
  body: text("body").notNull(),
  atMs: integer("at_ms"),
  createdAt: ts("created_at").notNull().defaultNow(),
  editedAt: ts("edited_at"),
  deletedAt: ts("deleted_at"),
})

export const reactionEmojis = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const
export type ReactionEmoji = (typeof reactionEmojis)[number]

export const videoReactions = pgTable("video_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull(),
  userId: uuid("user_id").notNull(),
  emoji: text("emoji").$type<ReactionEmoji>().notNull(),
  atMs: integer("at_ms"),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const mediaJobs = pgTable("media_jobs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  videoId: uuid("video_id").notNull(),
  kind: text("kind").$type<"process" | "thumbnail">().notNull(),
  status: text("status")
    .$type<"queued" | "running" | "done" | "failed">()
    .notNull()
    .default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  runAfter: ts("run_after").notNull().defaultNow(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
})

// ── Phase 3: live rooms ─────────────────────────────────────────────────────
export const liveRoomStatus = pgEnum("live_room_status", ["open", "ended"])
export const liveRole = pgEnum("live_role", ["cohost", "participant"])
export type LiveRole = "host" | (typeof liveRole.enumValues)[number]
export type AdmissionStatus = "waiting" | "admitted" | "denied" | "removed"

export const liveRooms = pgTable("live_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  hostId: uuid("host_id").notNull(),
  title: text("title").notNull(),
  status: liveRoomStatus("status").notNull().default("open"),
  waitingRoom: boolean("waiting_room").notNull().default(true),
  locked: boolean("locked").notNull().default(false),
  workspaceVisible: boolean("workspace_visible").notNull().default(false),
  channelId: uuid("channel_id"),
  lastActiveAt: ts("last_active_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  endedAt: ts("ended_at"),
})

export const liveRoomInvites = pgTable("live_room_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  userId: uuid("user_id"),
  email: citext("email"),
  role: liveRole("role").notNull().default("participant"),
  invitedBy: uuid("invited_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const liveRoomAdmissions = pgTable(
  "live_room_admissions",
  {
    roomId: uuid("room_id").notNull(),
    userId: uuid("user_id").notNull(),
    status: text("status").$type<AdmissionStatus>().notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    decidedBy: uuid("decided_by"),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })]
)

// ── Phase 4: chat and notifications ─────────────────────────────────────────
export const chatKind = pgEnum("chat_kind", ["channel", "dm"])
export const notifyLevel = pgEnum("notify_level", ["all", "mentions", "none"])
export type NotifyLevel = (typeof notifyLevel.enumValues)[number]

export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  kind: chatKind("kind").notNull().default("channel"),
  name: text("name"),
  topic: text("topic").notNull().default(""),
  isPrivate: boolean("is_private").notNull().default(false),
  dmKey: text("dm_key"),
  createdBy: uuid("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
})

export const chatMembers = pgTable(
  "chat_members",
  {
    channelId: uuid("channel_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<"admin" | "member">().notNull().default("member"),
    notify: notifyLevel("notify").notNull().default("all"),
    lastReadAt: ts("last_read_at").notNull().defaultNow(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })]
)

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull(),
  authorId: uuid("author_id").notNull(),
  parentId: uuid("parent_id"),
  body: text("body").notNull().default(""),
  mentions: uuid("mentions").array().notNull().default([]),
  mentionChannel: boolean("mention_channel").notNull().default(false),
  videoId: uuid("video_id"),
  replyCount: integer("reply_count").notNull().default(0),
  lastReplyAt: ts("last_reply_at"),
  pinnedAt: ts("pinned_at"),
  pinnedBy: uuid("pinned_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  editedAt: ts("edited_at"),
  deletedAt: ts("deleted_at"),
})

export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: uuid("message_id").notNull(),
    userId: uuid("user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]
)

export const chatAttachments = pgTable("chat_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id"),
  channelId: uuid("channel_id").notNull(),
  uploaderId: uuid("uploader_id").notNull(),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  kind: text("kind").notNull(),
  actorId: uuid("actor_id"),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  channelId: uuid("channel_id"),
  preview: text("preview").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
  readAt: ts("read_at"),
})

// ── Phase 5: tasks ──────────────────────────────────────────────────────────
export const taskStatusKind = pgEnum("task_status_kind", ["todo", "in_progress", "done"])
export const taskPriority = pgEnum("task_priority", ["urgent", "high", "normal", "low", "none"])
export type TaskStatusKind = (typeof taskStatusKind.enumValues)[number]
export type TaskPriority = (typeof taskPriority.enumValues)[number]

export const taskSpaces = pgTable("task_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
})

export const taskSpaceMembers = pgTable(
  "task_space_members",
  {
    spaceId: uuid("space_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<"admin" | "member">().notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })]
)

export const taskLists = pgTable("task_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull(),
  name: text("name").notNull(),
  channelId: uuid("channel_id"),
  position: doublePrecision("position").notNull().default(0),
  createdBy: uuid("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
})

export const taskStatuses = pgTable("task_statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull(),
  name: text("name").notNull(),
  kind: taskStatusKind("kind").notNull(),
  position: doublePrecision("position").notNull(),
})

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull(),
  parentId: uuid("parent_id"),
  statusId: uuid("status_id").notNull(),
  title: text("title").notNull(),
  description: jsonb("description").$type<Record<string, unknown> | null>(),
  priority: taskPriority("priority").notNull().default("none"),
  startDate: date("start_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  estimateMinutes: integer("estimate_minutes"),
  position: doublePrecision("position").notNull().default(0),
  videoId: uuid("video_id"),
  sourceMessageId: uuid("source_message_id"),
  channelId: uuid("channel_id"),
  createdBy: uuid("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  completedAt: ts("completed_at"),
  archivedAt: ts("archived_at"),
  dueSoonNotifiedAt: ts("due_soon_notified_at"),
  overdueNotifiedAt: ts("overdue_notified_at"),
})

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    assignedBy: uuid("assigned_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })]
)

export const taskLabels = pgTable("task_labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull(),
  name: text("name").notNull(),
  tone: text("tone")
    .$type<"neutral" | "brand" | "attention" | "danger">()
    .notNull()
    .default("neutral"),
})

export const taskLabelLinks = pgTable(
  "task_label_links",
  { taskId: uuid("task_id").notNull(), labelId: uuid("label_id").notNull() },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })]
)

export const taskChecklistItems = pgTable("task_checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  body: text("body").notNull(),
  done: boolean("done").notNull().default(false),
  position: doublePrecision("position").notNull().default(0),
})

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  authorId: uuid("author_id").notNull(),
  body: text("body").notNull(),
  mentions: uuid("mentions").array().notNull().default([]),
  createdAt: ts("created_at").notNull().defaultNow(),
  editedAt: ts("edited_at"),
  deletedAt: ts("deleted_at"),
})

export const taskActivity = pgTable("task_activity", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  taskId: uuid("task_id").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const taskAttachments = pgTable("task_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  uploaderId: uuid("uploader_id").notNull(),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  uploaded: boolean("uploaded").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export const taskSavedViews = pgTable("task_saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  listId: uuid("list_id").notNull(),
  name: text("name").notNull(),
  view: text("view").$type<"list" | "board" | "calendar" | "timeline">().notNull(),
  filters: jsonb("filters").$type<TaskFilters>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
})

export type TaskFilters = {
  assignee?: "me" | string
  priority?: TaskPriority[]
  labelId?: string
  status?: TaskStatusKind
  q?: string
}
