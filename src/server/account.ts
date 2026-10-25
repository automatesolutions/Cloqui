import "server-only"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CurrentUser } from "@/server/auth"
import { systemDb } from "@/server/db"
import {
  chatChannels,
  chatMessages,
  profiles,
  taskComments,
  tasks,
  videoComments,
  videos,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema"
import { deleteObjects } from "@/server/media/storage"
import { UserFacingError } from "@/server/workspaces"

export type SessionRow = {
  id: string
  createdAt: Date
  lastSeenAt: Date | null
  userAgent: string | null
  ip: string | null
  aal: string | null
}

/** Your own sign-in sessions (newest activity first). */
export async function listMySessions(user: CurrentUser): Promise<SessionRow[]> {
  return systemDb.execute<SessionRow>(sql`
    select id, created_at as "createdAt", coalesce(refreshed_at, updated_at) as "lastSeenAt",
           user_agent as "userAgent", host(ip) as "ip", aal::text as "aal"
    from auth.sessions where user_id = ${user.id}
    order by coalesce(refreshed_at, updated_at, created_at) desc
    limit 50`)
}

/**
 * Ends all of someone's sessions by revoking their refresh tokens.
 * Access tokens already issued stay valid until they expire (at most 1 hour).
 */
export async function revokeAllSessions(userId: string) {
  await systemDb.execute(sql`delete from auth.sessions where user_id = ${userId}`)
}

/** Everything you created, as JSON. Only your own content: nothing other people wrote. */
export async function exportMyData(user: CurrentUser) {
  const [profile] = await systemDb.select().from(profiles).where(eq(profiles.id, user.id))
  const memberships = await systemDb
    .select({
      workspace: workspaces.name,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
  const myVideos = await systemDb
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      createdAt: videos.createdAt,
      durationMs: videos.durationMs,
    })
    .from(videos)
    .where(and(eq(videos.ownerId, user.id), isNull(videos.deletedAt)))
  const messages = await systemDb
    .select({
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      channel: chatChannels.name,
      kind: chatChannels.kind,
    })
    .from(chatMessages)
    .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .where(and(eq(chatMessages.authorId, user.id), isNull(chatMessages.deletedAt)))
  const videoCommentRows = await systemDb
    .select({
      body: videoComments.body,
      atMs: videoComments.atMs,
      createdAt: videoComments.createdAt,
    })
    .from(videoComments)
    .where(and(eq(videoComments.authorId, user.id), isNull(videoComments.deletedAt)))
  const myTasks = await systemDb
    .select({
      title: tasks.title,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(eq(tasks.createdBy, user.id))
  const taskCommentRows = await systemDb
    .select({ body: taskComments.body, createdAt: taskComments.createdAt })
    .from(taskComments)
    .where(and(eq(taskComments.authorId, user.id), isNull(taskComments.deletedAt)))
  return {
    exportedAt: new Date().toISOString(),
    note: "Your own content in Cloqui. Video files are not included; download them from each video page.",
    profile: { name: profile?.displayName, email: profile?.email, createdAt: profile?.createdAt },
    workspaces: memberships,
    videos: myVideos,
    videoComments: videoCommentRows,
    messages: messages.map((m) => ({
      ...m,
      channel: m.kind === "dm" ? "direct message" : `#${m.channel}`,
    })),
    tasksCreated: myTasks,
    taskComments: taskCommentRows,
  }
}

/** Delete your account. Blocked while you're the only owner of a workspace that has other people. */
export async function deleteMyAccount(user: CurrentUser, confirmEmail: string) {
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new UserFacingError("Type your email exactly to confirm.")
  }
  const owned = await systemDb
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.role, "owner")))
  for (const w of owned) {
    const [others] = await systemDb.execute<{ n: number }>(
      sql`select count(*)::int as n from public.workspace_members where workspace_id = ${w.id} and user_id <> ${user.id}`
    )
    if (others.n > 0) {
      throw new UserFacingError(
        `You own "${w.name}". Delete it first, in its Security settings. Handing a workspace to someone else is coming later.`
      )
    }
  }
  // Workspaces where you're alone go with you, files included.
  for (const w of owned) await deleteWorkspaceData(w.id)
  const mine = await systemDb
    .select({
      o: videos.originalKey,
      p: videos.playbackKey,
      t: videos.thumbnailKey,
      c: videos.captionsKey,
    })
    .from(videos)
    .where(eq(videos.ownerId, user.id))
  await deleteObjects(mine.flatMap((v) => [v.o, v.p ?? "", v.t ?? "", v.c ?? ""]))
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id)
  if (error) throw new UserFacingError("We couldn't delete your account. Try again in a moment.")
}

/** Remove a workspace and every file stored for it. */
export async function deleteWorkspaceData(workspaceId: string) {
  const keys = await systemDb.execute<{ key: string }>(sql`
    select unnest(array[original_key, playback_key, thumbnail_key, captions_key]) as key from public.videos where workspace_id = ${workspaceId}
    union all
    select a.object_key from public.chat_attachments a join public.chat_channels c on c.id = a.channel_id where c.workspace_id = ${workspaceId}
    union all
    select a.object_key from public.task_attachments a join public.tasks t on t.id = a.task_id
      join public.task_lists l on l.id = t.list_id join public.task_spaces s on s.id = l.space_id where s.workspace_id = ${workspaceId}`)
  const all = keys.map((k) => k.key).filter(Boolean)
  for (let i = 0; i < all.length; i += 900) await deleteObjects(all.slice(i, i + 900))
  await systemDb.delete(workspaces).where(inArray(workspaces.id, [workspaceId]))
}
