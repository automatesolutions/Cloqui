// Typed mirror of supabase/migrations. The SQL files (with RLS) are the source of truth.
import {
  bigint,
  boolean,
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
