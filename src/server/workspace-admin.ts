import "server-only"
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { deleteWorkspaceData } from "@/server/account"
import { audit } from "@/server/audit"
import { authorize } from "@/server/authz"
import { systemDb, withRls } from "@/server/db"
import {
  chatChannels,
  chatMessages,
  profiles,
  taskLists,
  taskSpaces,
  tasks,
  videos,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema"
import { deleteObjects } from "@/server/media/storage"
import { UserFacingError } from "@/server/workspaces"

export type SecuritySettings = {
  require2fa: boolean
  retentionVideoDays: number | null
  retentionMessageDays: number | null
  allowPublicLinks: boolean
  /** Members without two-step sign-in set up. They lose access the moment it's required. */
  membersWithoutTwoFactor: { id: string; name: string }[]
}

export async function getSecuritySettings(
  user: CurrentUser,
  slug: string
): Promise<SecuritySettings> {
  const { workspace } = await authorize(user, "workspace.update", slug)
  const [row] = await withRls(user.claims, (tx) =>
    tx
      .select({
        require2fa: workspaces.require2fa,
        retentionVideoDays: workspaces.retentionVideoDays,
        retentionMessageDays: workspaces.retentionMessageDays,
        allowPublicLinks: workspaces.allowPublicLinks,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
  )
  // auth.mfa_factors isn't readable under RLS. Only "has a verified factor", never the factor.
  const without = await systemDb.execute<{ id: string; name: string }>(sql`
    select m.user_id as id, p.display_name as name
    from public.workspace_members m join public.profiles p on p.id = m.user_id
    where m.workspace_id = ${workspace.id}
      and not exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')
    order by p.display_name`)
  return { ...row, membersWithoutTwoFactor: [...without] }
}

export async function setRequireTwoFactor(user: CurrentUser, slug: string, on: boolean) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  // Otherwise the admin would lock themselves out with the click.
  if (on && user.aal !== "aal2") {
    throw new UserFacingError(
      "Turn on two-step sign-in for yourself first, in Account and security."
    )
  }
  await withRls(user.claims, async (tx) => {
    await tx.update(workspaces).set({ require2fa: on }).where(eq(workspaces.id, workspace.id))
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: on ? "security.2fa_required" : "security.2fa_optional",
      targetType: "workspace",
      targetId: workspace.id,
    })
  })
}

export async function setRetention(
  user: CurrentUser,
  slug: string,
  patch: { retentionVideoDays: number | null; retentionMessageDays: number | null }
) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  await withRls(user.claims, async (tx) => {
    await tx.update(workspaces).set(patch).where(eq(workspaces.id, workspace.id))
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "security.retention_changed",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: patch,
    })
  })
}

/** Owner only. `typedName` must match the workspace name, so it can't happen by accident. */
export async function deleteWorkspace(user: CurrentUser, slug: string, typedName: string) {
  const { workspace } = await authorize(user, "workspace.delete", slug)
  if (typedName.trim() !== workspace.name.trim()) {
    throw new UserFacingError("Type the workspace name exactly to delete it.")
  }
  await deleteWorkspaceData(workspace.id)
}

/**
 * What an admin can download. Read under the admin's own RLS, so private channels and spaces
 * they aren't in, and videos nobody shared with them, stay out of it.
 */
export async function exportWorkspace(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  return withRls(user.claims, async (tx) => {
    const members = await tx
      .select({
        id: workspaceMembers.userId,
        name: profiles.displayName,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .leftJoin(profiles, eq(profiles.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspace.id))
    const channels = await tx
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        kind: chatChannels.kind,
        isPrivate: chatChannels.isPrivate,
      })
      .from(chatChannels)
      .where(eq(chatChannels.workspaceId, workspace.id))
    const messages = channels.length
      ? await tx
          .select({
            id: chatMessages.id,
            channelId: chatMessages.channelId,
            authorId: chatMessages.authorId,
            parentId: chatMessages.parentId,
            body: chatMessages.body,
            createdAt: chatMessages.createdAt,
            editedAt: chatMessages.editedAt,
          })
          .from(chatMessages)
          .where(
            and(
              inArray(
                chatMessages.channelId,
                channels.map((c) => c.id)
              ),
              isNull(chatMessages.deletedAt)
            )
          )
      : []
    const vids = await tx
      .select({
        id: videos.id,
        title: videos.title,
        ownerId: videos.ownerId,
        durationMs: videos.durationMs,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(and(eq(videos.workspaceId, workspace.id), isNull(videos.deletedAt)))
    const spaces = await tx
      .select({ id: taskSpaces.id, name: taskSpaces.name, isPrivate: taskSpaces.isPrivate })
      .from(taskSpaces)
      .where(eq(taskSpaces.workspaceId, workspace.id))
    const lists = spaces.length
      ? await tx
          .select({ id: taskLists.id, spaceId: taskLists.spaceId, name: taskLists.name })
          .from(taskLists)
          .where(
            inArray(
              taskLists.spaceId,
              spaces.map((s) => s.id)
            )
          )
      : []
    const taskRows = lists.length
      ? await tx
          .select({
            id: tasks.id,
            listId: tasks.listId,
            title: tasks.title,
            statusId: tasks.statusId,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
            createdBy: tasks.createdBy,
            createdAt: tasks.createdAt,
          })
          .from(tasks)
          .where(
            inArray(
              tasks.listId,
              lists.map((l) => l.id)
            )
          )
      : []
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "workspace.exported",
      targetType: "workspace",
      targetId: workspace.id,
    })
    return {
      exportedAt: new Date().toISOString(),
      note: "Includes only what you can see. Video files aren't included, only their details.",
      workspace: { name: workspace.name, slug: workspace.slug },
      members,
      channels,
      messages,
      videos: vids,
      spaces,
      lists,
      tasks: taskRows,
    }
  })
}

/** Deletes videos and messages older than each workspace's retention setting. Run daily. */
export async function runRetention() {
  const due = await systemDb
    .select({
      id: workspaces.id,
      videoDays: workspaces.retentionVideoDays,
      messageDays: workspaces.retentionMessageDays,
    })
    .from(workspaces)
    .where(
      sql`${workspaces.retentionVideoDays} is not null or ${workspaces.retentionMessageDays} is not null`
    )
  let videosDeleted = 0
  let messagesDeleted = 0
  for (const w of due) {
    if (w.videoDays) {
      const cutoff = new Date(Date.now() - w.videoDays * 86_400_000)
      const old = await systemDb
        .delete(videos)
        .where(and(eq(videos.workspaceId, w.id), lt(videos.createdAt, cutoff)))
        .returning({
          o: videos.originalKey,
          p: videos.playbackKey,
          t: videos.thumbnailKey,
          c: videos.captionsKey,
        })
      await deleteObjects(
        old.flatMap((v) => [v.o, v.p ?? "", v.t ?? "", v.c ?? ""]).filter(Boolean)
      )
      videosDeleted += old.length
    }
    if (w.messageDays) {
      const files = await systemDb.execute<{ key: string }>(sql`
        select a.object_key as key from public.chat_attachments a
        join public.chat_messages m on m.id = a.message_id
        join public.chat_channels c on c.id = m.channel_id
        where c.workspace_id = ${w.id} and m.created_at < now() - make_interval(days => ${w.messageDays})`)
      const gone = await systemDb.execute<{ id: string }>(sql`
        delete from public.chat_messages m using public.chat_channels c
        where c.id = m.channel_id and c.workspace_id = ${w.id} and m.created_at < now() - make_interval(days => ${w.messageDays})
        returning m.id`)
      await deleteObjects(files.map((f) => f.key))
      messagesDeleted += gone.length
    }
  }
  return { workspaces: due.length, videosDeleted, messagesDeleted }
}
