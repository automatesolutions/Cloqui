import "server-only"
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError, authorize } from "@/server/authz"
import { systemDb, withRls } from "@/server/db"
import {
  chatAttachments,
  chatChannels,
  chatMembers,
  chatMessages,
  chatReactions,
  liveRooms,
  notifications,
  profiles,
  videos,
  workspaceMembers,
  workspaces,
  type NotifyLevel,
} from "@/server/db/schema"
import { presignRead, presignUpload } from "@/server/media/storage"
import { takeToken } from "@/server/rate-limit"
import { getVideoRole, shareVideo } from "@/server/videos"
import { UserFacingError } from "@/server/workspaces"

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const PAGE = 60

const pgCode = (e: unknown) =>
  (e as { code?: string; cause?: { code?: string } })?.code ??
  (e as { cause?: { code?: string } })?.cause?.code

async function namesFor(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map<string, string>()
  const rows = await systemDb
    .select({ id: profiles.id, name: profiles.displayName })
    .from(profiles)
    .where(inArray(profiles.id, unique))
  return new Map(rows.map((r) => [r.id, r.name]))
}

async function canRead(user: CurrentUser, channelId: string) {
  const [r] = await withRls(user.claims, (tx) =>
    tx.execute<{ ok: boolean }>(sql`select public.can_read_channel(${channelId}::uuid) as ok`)
  )
  return r?.ok === true
}

async function requireRead(user: CurrentUser, channelId: string) {
  if (!(await canRead(user, channelId))) throw new AccessDeniedError()
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

export type SidebarChannel = {
  id: string
  kind: "channel" | "dm"
  name: string
  isPrivate: boolean
  unread: number
  mentions: number
  memberCount: number
}

export async function listSidebar(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const mine = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: chatChannels.id,
        kind: chatChannels.kind,
        name: chatChannels.name,
        isPrivate: chatChannels.isPrivate,
        dmKey: chatChannels.dmKey,
        lastReadAt: chatMembers.lastReadAt,
        unread: sql<number>`(select count(*)::int from public.chat_messages m where m.channel_id = ${chatChannels.id}
          and m.parent_id is null and m.deleted_at is null and m.author_id <> ${user.id} and m.created_at > ${chatMembers.lastReadAt})`,
        mentions: sql<number>`(select count(*)::int from public.chat_messages m where m.channel_id = ${chatChannels.id}
          and m.deleted_at is null and m.author_id <> ${user.id} and m.created_at > ${chatMembers.lastReadAt}
          and (${user.id} = any(m.mentions) or m.mention_channel))`,
        memberCount: sql<number>`(select count(*)::int from public.chat_members x where x.channel_id = ${chatChannels.id})`,
      })
      .from(chatMembers)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMembers.channelId))
      .where(
        and(
          eq(chatMembers.userId, user.id),
          eq(chatChannels.workspaceId, workspace.id),
          isNull(chatChannels.archivedAt)
        )
      )
  )
  // DM names are the other people's names.
  const dmPeople = mine.filter((c) => c.kind === "dm").flatMap((c) => (c.dmKey ?? "").split(","))
  const names = await namesFor(dmPeople)
  const items: SidebarChannel[] = mine.map((c) => ({
    id: c.id,
    kind: c.kind,
    name:
      c.kind === "dm"
        ? (c.dmKey ?? "")
            .split(",")
            .filter((id) => id !== user.id)
            .map((id) => names.get(id)?.split(" ")[0] ?? "Someone")
            .join(", ") || "Just you"
        : (c.name ?? ""),
    isPrivate: c.isPrivate,
    unread: c.unread,
    mentions: c.kind === "dm" ? c.unread : c.mentions,
    memberCount: c.memberCount,
  }))
  return {
    workspaceId: workspace.id,
    channels: items
      .filter((c) => c.kind === "channel")
      .sort((a, b) => a.name.localeCompare(b.name)),
    dms: items.filter((c) => c.kind === "dm").sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Open channels in the workspace the person hasn't joined yet. */
export async function listBrowsableChannels(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        topic: chatChannels.topic,
        memberCount: sql<number>`(select count(*)::int from public.chat_members x where x.channel_id = ${chatChannels.id})`,
      })
      .from(chatChannels)
      .where(
        and(
          eq(chatChannels.workspaceId, workspace.id),
          eq(chatChannels.kind, "channel"),
          eq(chatChannels.isPrivate, false),
          isNull(chatChannels.archivedAt),
          sql`not exists (select 1 from public.chat_members m where m.channel_id = ${chatChannels.id} and m.user_id = ${user.id})`
        )
      )
      .orderBy(asc(chatChannels.name))
  )
}

// ── Channels and DMs ────────────────────────────────────────────────────────

export async function createChannel(
  user: CurrentUser,
  slug: string,
  input: { name: string; topic: string; isPrivate: boolean; memberIds: string[] }
) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  try {
    // Id made here: a private channel isn't readable until its creator is a member,
    // so INSERT ... RETURNING would be refused by RLS.
    const ch = { id: crypto.randomUUID() }
    return await withRls(user.claims, async (tx) => {
      await tx.insert(chatChannels).values({
        id: ch.id,
        workspaceId: workspace.id,
        kind: "channel",
        name: input.name,
        topic: input.topic,
        isPrivate: input.isPrivate,
        createdBy: user.id,
      })
      await tx.insert(chatMembers).values({ channelId: ch.id, userId: user.id, role: "admin" })
      const others = [...new Set(input.memberIds)].filter((id) => id !== user.id)
      if (others.length)
        await tx.insert(chatMembers).values(others.map((userId) => ({ channelId: ch.id, userId })))
      return ch.id
    })
  } catch (e) {
    if (pgCode(e) === "23505")
      throw new UserFacingError("There's already a channel with that name.")
    if (pgCode(e) === "42501")
      throw new UserFacingError("Some of those people aren't in this workspace.")
    throw e
  }
}

export async function joinChannel(user: CurrentUser, channelId: string) {
  await requireRead(user, channelId)
  await withRls(user.claims, (tx) =>
    tx.insert(chatMembers).values({ channelId, userId: user.id }).onConflictDoNothing()
  )
}

export async function leaveChannel(user: CurrentUser, channelId: string) {
  await withRls(user.claims, (tx) =>
    tx
      .delete(chatMembers)
      .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, user.id)))
  )
}

export async function addChannelMembers(user: CurrentUser, channelId: string, userIds: string[]) {
  await requireRead(user, channelId)
  try {
    await withRls(user.claims, async (tx) => {
      for (const userId of [...new Set(userIds)]) {
        await tx.insert(chatMembers).values({ channelId, userId }).onConflictDoNothing()
      }
    })
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
}

export async function getOrCreateDm(user: CurrentUser, slug: string, otherIds: string[]) {
  const [ws] = await systemDb
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
  if (!ws) throw new AccessDeniedError()
  try {
    const [r] = await withRls(user.claims, (tx) =>
      tx.execute<{ id: string }>(
        sql`select public.get_or_create_dm(${ws.id}::uuid, ${`{${otherIds.join(",")}}`}::uuid[]) as id`
      )
    )
    return r.id
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    if (pgCode(e) === "22023")
      throw new UserFacingError("A direct message can include up to 8 other people.")
    throw e
  }
}

export type ChannelView = {
  channel: typeof chatChannels.$inferSelect
  title: string
  isMember: boolean
  notify: NotifyLevel
  canManage: boolean
  members: { id: string; name: string; email: string }[]
  workspaceName: string
}

export async function getChannelView(
  user: CurrentUser,
  channelId: string
): Promise<ChannelView | null> {
  if (!(await canRead(user, channelId))) return null
  return withRls(user.claims, async (tx) => {
    const [channel] = await tx.select().from(chatChannels).where(eq(chatChannels.id, channelId))
    const memberRows = await tx
      .select({ userId: chatMembers.userId, notify: chatMembers.notify })
      .from(chatMembers)
      .where(eq(chatMembers.channelId, channelId))
    const [manage] = await tx.execute<{ ok: boolean }>(
      sql`select public.can_manage_channel(${channelId}::uuid) as ok`
    )
    // Everyone who can read a channel may see who is in it, guests included.
    const people = memberRows.length
      ? await systemDb
          .select({ id: profiles.id, name: profiles.displayName, email: profiles.email })
          .from(profiles)
          .where(
            inArray(
              profiles.id,
              memberRows.map((m) => m.userId)
            )
          )
      : []
    const [ws] = await systemDb
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, channel.workspaceId))
    const me = memberRows.find((m) => m.userId === user.id)
    const title =
      channel.kind === "dm"
        ? people
            .filter((p) => p.id !== user.id)
            .map((p) => p.name)
            .join(", ") || "Just you"
        : `#${channel.name}`
    return {
      channel,
      title,
      isMember: !!me,
      notify: me?.notify ?? "all",
      canManage: manage?.ok === true,
      members: people.sort((a, b) => a.name.localeCompare(b.name)),
      workspaceName: ws.name,
    }
  })
}

export async function setNotifyLevel(user: CurrentUser, channelId: string, notify: NotifyLevel) {
  await withRls(user.claims, (tx) =>
    tx
      .update(chatMembers)
      .set({ notify })
      .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, user.id)))
  )
}

export async function markRead(user: CurrentUser, channelId: string) {
  await withRls(user.claims, (tx) =>
    tx
      .update(chatMembers)
      .set({ lastReadAt: sql`now()` })
      .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, user.id)))
  )
}

// ── Messages ────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: Date
  editedAt: Date | null
  deleted: boolean
  parentId: string | null
  replyCount: number
  lastReplyAt: Date | null
  pinned: boolean
  mentions: string[]
  reactions: { emoji: string; count: number; mine: boolean }[]
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number }[]
  video: null | {
    id: string
    title: string
    canWatch: boolean
    thumbnailUrl: string | null
    durationMs: number | null
  }
}

async function hydrate(
  user: CurrentUser,
  rows: (typeof chatMessages.$inferSelect)[]
): Promise<ChatMessage[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [reactions, attachments, names] = await Promise.all([
    withRls(user.claims, (tx) =>
      tx
        .select({
          messageId: chatReactions.messageId,
          emoji: chatReactions.emoji,
          count: sql<number>`count(*)::int`,
          mine: sql<boolean>`bool_or(${chatReactions.userId} = ${user.id})`,
        })
        .from(chatReactions)
        .where(inArray(chatReactions.messageId, ids))
        .groupBy(chatReactions.messageId, chatReactions.emoji)
    ),
    withRls(user.claims, (tx) =>
      tx
        .select({
          id: chatAttachments.id,
          messageId: chatAttachments.messageId,
          name: chatAttachments.name,
          mimeType: chatAttachments.mimeType,
          sizeBytes: chatAttachments.sizeBytes,
        })
        .from(chatAttachments)
        .where(inArray(chatAttachments.messageId, ids))
    ),
    namesFor(rows.map((r) => r.authorId)),
  ])
  // Video cards: show the title and thumbnail only to people who can watch it.
  const videoIds = [...new Set(rows.map((r) => r.videoId).filter((x): x is string => !!x))]
  const cards = new Map<string, ChatMessage["video"]>()
  for (const vid of videoIds) {
    const role = await getVideoRole(user, vid)
    if (!role) {
      cards.set(vid, { id: vid, title: "", canWatch: false, thumbnailUrl: null, durationMs: null })
      continue
    }
    const [v] = await withRls(user.claims, (tx) =>
      tx
        .select({ title: videos.title, thumb: videos.thumbnailKey, durationMs: videos.durationMs })
        .from(videos)
        .where(eq(videos.id, vid))
    )
    cards.set(vid, {
      id: vid,
      title: v?.title ?? "",
      canWatch: true,
      thumbnailUrl: v?.thumb ? await presignRead(v.thumb) : null,
      durationMs: v?.durationMs ?? null,
    })
  }
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: names.get(r.authorId) ?? "Someone",
    body: r.deletedAt ? "" : r.body,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    deleted: !!r.deletedAt,
    parentId: r.parentId,
    replyCount: r.replyCount,
    lastReplyAt: r.lastReplyAt,
    pinned: !!r.pinnedAt,
    mentions: r.mentions,
    reactions: reactions
      .filter((x) => x.messageId === r.id)
      .map(({ emoji, count, mine }) => ({ emoji, count, mine })),
    attachments: r.deletedAt
      ? []
      : attachments
          .filter((a) => a.messageId === r.id)
          .map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    video: r.deletedAt || !r.videoId ? null : (cards.get(r.videoId) ?? null),
  }))
}

export async function listMessages(user: CurrentUser, channelId: string, before?: Date) {
  await requireRead(user, channelId)
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          isNull(chatMessages.parentId),
          before ? lt(chatMessages.createdAt, before) : undefined
        )
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(PAGE)
  )
  return (await hydrate(user, rows)).reverse()
}

export async function listThread(user: CurrentUser, parentId: string) {
  const rows = await withRls(user.claims, async (tx) => {
    const [root] = await tx.select().from(chatMessages).where(eq(chatMessages.id, parentId))
    if (!root) return []
    const replies = await tx
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.parentId, parentId))
      .orderBy(asc(chatMessages.createdAt))
    return [root, ...replies]
  })
  if (rows.length === 0) throw new AccessDeniedError()
  return hydrate(user, rows)
}

export async function listPinned(user: CurrentUser, channelId: string) {
  await requireRead(user, channelId)
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          sql`${chatMessages.pinnedAt} is not null`,
          isNull(chatMessages.deletedAt)
        )
      )
      .orderBy(desc(chatMessages.pinnedAt))
  )
  return hydrate(user, rows)
}

const MENTION_CHANNEL = /(^|\s)@(channel|here)\b/i

export async function postMessage(
  user: CurrentUser,
  channelId: string,
  input: {
    body: string
    parentId?: string | null
    mentionIds?: string[]
    attachmentIds?: string[]
    videoId?: string | null
    shareVideoWithChannel?: boolean
  }
) {
  const view = await getChannelView(user, channelId)
  if (!view) throw new AccessDeniedError()
  if (view.channel.archivedAt) throw new UserFacingError("This channel is archived.")
  if (!(await takeToken("chatMessage", user.id)))
    throw new UserFacingError("You're sending messages very fast. Wait a moment.")

  // Posting in an open channel joins it.
  if (!view.isMember) await joinChannel(user, channelId)

  // Only keep mentions of people who can read this channel.
  const memberIds = new Set(view.members.map((m) => m.id))
  const openChannel = view.channel.kind === "channel" && !view.channel.isPrivate
  let mentions = [...new Set(input.mentionIds ?? [])].filter((id) => id !== user.id)
  if (!openChannel) mentions = mentions.filter((id) => memberIds.has(id))
  else if (mentions.length) {
    const allowed = await systemDb
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, view.channel.workspaceId),
          inArray(workspaceMembers.userId, mentions),
          ne(workspaceMembers.role, "guest")
        )
      )
    const ok = new Set(allowed.map((a) => a.id))
    mentions = mentions.filter((id) => ok.has(id) || memberIds.has(id))
  }
  const mentionChannel = view.channel.kind === "channel" && MENTION_CHANNEL.test(input.body)

  if (input.videoId) {
    const role = await getVideoRole(user, input.videoId)
    if (!role) throw new AccessDeniedError()
    if (input.shareVideoWithChannel) {
      if (role !== "owner")
        throw new UserFacingError("Only the video's owner can share it with the channel.")
      const emails = view.members.filter((m) => m.id !== user.id).map((m) => m.email)
      if (emails.length) await shareVideo(user, input.videoId, emails, "viewer")
    }
  }

  const id = await withRls(user.claims, async (tx) => {
    if (input.parentId) {
      const [parent] = await tx
        .select({ channelId: chatMessages.channelId, parentId: chatMessages.parentId })
        .from(chatMessages)
        .where(eq(chatMessages.id, input.parentId))
      if (!parent || parent.channelId !== channelId || parent.parentId)
        throw new AccessDeniedError()
    }
    const [m] = await tx
      .insert(chatMessages)
      .values({
        channelId,
        authorId: user.id,
        parentId: input.parentId ?? null,
        body: input.body,
        mentions,
        mentionChannel,
        videoId: input.videoId ?? null,
      })
      .returning({ id: chatMessages.id })
    if (input.attachmentIds?.length) {
      await tx
        .update(chatAttachments)
        .set({ messageId: m.id })
        .where(
          and(
            inArray(chatAttachments.id, input.attachmentIds),
            eq(chatAttachments.channelId, channelId),
            eq(chatAttachments.uploaderId, user.id),
            isNull(chatAttachments.messageId)
          )
        )
    }
    await tx
      .update(chatMembers)
      .set({ lastReadAt: sql`now()` })
      .where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.userId, user.id)))
    return m.id
  })

  await notifyForMessage(user, view, {
    id,
    parentId: input.parentId ?? null,
    body: input.body,
    mentions,
    mentionChannel,
  })
  return id
}

async function notifyForMessage(
  user: CurrentUser,
  view: ChannelView,
  m: {
    id: string
    parentId: string | null
    body: string
    mentions: string[]
    mentionChannel: boolean
  }
) {
  const settings = await systemDb
    .select({ userId: chatMembers.userId, notify: chatMembers.notify })
    .from(chatMembers)
    .where(eq(chatMembers.channelId, view.channel.id))
  const level = new Map(settings.map((s) => [s.userId, s.notify]))
  const recipients = new Map<string, string>() // userId -> kind
  for (const id of m.mentions) if (level.get(id) !== "none") recipients.set(id, "mention")
  if (m.mentionChannel)
    for (const s of settings)
      if (s.notify !== "none") recipients.set(s.userId, recipients.get(s.userId) ?? "mention")
  if (view.channel.kind === "dm")
    for (const s of settings)
      if (s.notify !== "none") recipients.set(s.userId, recipients.get(s.userId) ?? "dm")
  if (m.parentId) {
    // Thread replies notify the people already in the thread.
    const inThread = await systemDb
      .select({ authorId: chatMessages.authorId })
      .from(chatMessages)
      .where(sql`${chatMessages.id} = ${m.parentId} or ${chatMessages.parentId} = ${m.parentId}`)
    for (const t of inThread)
      if (level.get(t.authorId) === "all")
        recipients.set(t.authorId, recipients.get(t.authorId) ?? "reply")
  }
  recipients.delete(user.id)
  if (recipients.size === 0) return
  const preview = m.body.replace(/\s+/g, " ").trim().slice(0, 140)
  await systemDb.insert(notifications).values(
    [...recipients].map(([userId, kind]) => ({
      userId,
      workspaceId: view.channel.workspaceId,
      kind,
      actorId: user.id,
      targetType: "chat_message",
      targetId: m.parentId ?? m.id,
      channelId: view.channel.id,
      preview,
    }))
  )
}

export async function editMessage(user: CurrentUser, messageId: string, body: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .update(chatMessages)
      .set({ body, editedAt: sql`now()` })
      .where(
        and(
          eq(chatMessages.id, messageId),
          eq(chatMessages.authorId, user.id),
          isNull(chatMessages.deletedAt)
        )
      )
      .returning({ id: chatMessages.id })
  )
  if (rows.length === 0) throw new AccessDeniedError()
}

export async function deleteMessage(user: CurrentUser, messageId: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .update(chatMessages)
      .set({ deletedAt: sql`now()`, body: "", videoId: null, pinnedAt: null })
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.authorId, user.id)))
      .returning({ id: chatMessages.id })
  )
  if (rows.length === 0) throw new AccessDeniedError()
}

export async function toggleChatReaction(user: CurrentUser, messageId: string, emoji: string) {
  await withRls(user.claims, async (tx) => {
    const removed = await tx
      .delete(chatReactions)
      .where(
        and(
          eq(chatReactions.messageId, messageId),
          eq(chatReactions.userId, user.id),
          eq(chatReactions.emoji, emoji)
        )
      )
      .returning({ m: chatReactions.messageId })
    if (removed.length === 0) {
      try {
        await tx.insert(chatReactions).values({ messageId, userId: user.id, emoji })
      } catch (e) {
        if (pgCode(e) === "42501") throw new AccessDeniedError()
        throw e
      }
    }
  })
}

export async function pinMessage(user: CurrentUser, messageId: string, pin: boolean) {
  try {
    await withRls(user.claims, (tx) =>
      tx.execute(sql`select public.pin_message(${messageId}::uuid, ${pin})`)
    )
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function searchMessages(user: CurrentUser, slug: string, q: string) {
  const [ws] = await systemDb
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
  if (!ws) throw new AccessDeniedError()
  const query = q.trim().slice(0, 100)
  if (!query) return []
  // RLS limits results to channels this person can read.
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: chatMessages.id,
        channelId: chatMessages.channelId,
        parentId: chatMessages.parentId,
        body: chatMessages.body,
        authorId: chatMessages.authorId,
        createdAt: chatMessages.createdAt,
        channelName: chatChannels.name,
        channelKind: chatChannels.kind,
      })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .where(
        and(
          eq(chatChannels.workspaceId, ws.id),
          isNull(chatMessages.deletedAt),
          sql`chat_messages.search @@ websearch_to_tsquery('simple', ${query})`
        )
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(50)
  )
  const names = await namesFor(rows.map((r) => r.authorId))
  return rows.map((r) => ({ ...r, authorName: names.get(r.authorId) ?? "Someone" }))
}

// ── Attachments ─────────────────────────────────────────────────────────────

export async function createAttachmentUpload(
  user: CurrentUser,
  channelId: string,
  file: { name: string; mimeType: string; sizeBytes: number }
) {
  await requireRead(user, channelId)
  if (file.sizeBytes <= 0 || file.sizeBytes > MAX_ATTACHMENT_BYTES)
    throw new UserFacingError("Files can be up to 100 MB.")
  if (!(await takeToken("upload", user.id)))
    throw new UserFacingError("You've uploaded a lot today. Try again in an hour.")
  const [ch] = await withRls(user.claims, (tx) =>
    tx
      .select({ ws: chatChannels.workspaceId })
      .from(chatChannels)
      .where(eq(chatChannels.id, channelId))
  )
  const id = crypto.randomUUID()
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "file"
  const key = `ws/${ch.ws}/chat/${channelId}/${id}`
  const type = file.mimeType.slice(0, 100) || "application/octet-stream"
  await withRls(user.claims, (tx) =>
    tx.insert(chatAttachments).values({
      id,
      channelId,
      uploaderId: user.id,
      objectKey: key,
      name: safeName,
      mimeType: type,
      sizeBytes: file.sizeBytes,
    })
  )
  return { attachmentId: id, uploadUrl: await presignUpload(key, type), contentType: type }
}

export async function attachmentUrl(user: CurrentUser, attachmentId: string) {
  const [a] = await withRls(user.claims, (tx) =>
    tx
      .select({ key: chatAttachments.objectKey, name: chatAttachments.name })
      .from(chatAttachments)
      .where(eq(chatAttachments.id, attachmentId))
  )
  if (!a) throw new AccessDeniedError()
  return presignRead(a.key, { ttl: 120, filename: a.name })
}

// ── Huddles ─────────────────────────────────────────────────────────────────

/** Join the channel's open huddle, or start one. Channel readers can join without an invite. */
export async function startHuddle(user: CurrentUser, channelId: string) {
  const view = await getChannelView(user, channelId)
  if (!view) throw new AccessDeniedError()
  const [existing] = await systemDb
    .select({ id: liveRooms.id })
    .from(liveRooms)
    .where(
      and(
        eq(liveRooms.channelId, channelId),
        eq(liveRooms.status, "open"),
        gt(liveRooms.lastActiveAt, sql`now() - interval '2 minutes'`)
      )
    )
    .orderBy(desc(liveRooms.lastActiveAt))
    .limit(1)
  if (existing) return existing.id
  const [room] = await withRls(user.claims, (tx) =>
    tx
      .insert(liveRooms)
      .values({
        workspaceId: view.channel.workspaceId,
        hostId: user.id,
        title: `Huddle in ${view.title}`,
        waitingRoom: false,
        channelId,
        lastActiveAt: sql`now()`,
      })
      .returning({ id: liveRooms.id })
  )
  return room.id
}

// ── Notifications ───────────────────────────────────────────────────────────

export async function listNotifications(user: CurrentUser, limit = 50) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
  )
  const [names, wsRows] = await Promise.all([
    namesFor(rows.map((r) => r.actorId ?? "")),
    rows.length
      ? systemDb
          .select({ id: workspaces.id, slug: workspaces.slug })
          .from(workspaces)
          .where(inArray(workspaces.id, [...new Set(rows.map((r) => r.workspaceId))]))
      : Promise.resolve([]),
  ])
  const slugs = new Map(wsRows.map((w) => [w.id, w.slug]))
  return rows.map((r) => ({
    ...r,
    actorName: (r.actorId && names.get(r.actorId)) || "Someone",
    workspaceSlug: slugs.get(r.workspaceId) ?? "",
  }))
}

export async function unreadNotificationCount(user: CurrentUser) {
  const [r] = await withRls(user.claims, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
  )
  return r?.n ?? 0
}

export async function markNotificationsRead(user: CurrentUser, ids?: string[]) {
  await withRls(user.claims, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
          ids?.length ? inArray(notifications.id, ids) : undefined
        )
      )
  )
}
