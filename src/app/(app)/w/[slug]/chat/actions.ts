"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import {
  attachmentUrl,
  createAttachmentUpload,
  createChannel,
  deleteMessage,
  editMessage,
  getOrCreateDm,
  joinChannel,
  leaveChannel,
  listMessages,
  listThread,
  markRead,
  pinMessage,
  postMessage,
  setNotifyLevel,
  startHuddle,
  toggleChatReaction,
} from "@/server/chat"
import { UserFacingError } from "@/server/workspaces"

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string }
const id = z.uuid()

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof UserFacingError) return { ok: false, message: e.message }
  if (e instanceof AccessDeniedError)
    return { ok: false, message: "You don't have access to that." }
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the details and try again." }
  console.error("chat action failed", (e as Error)?.name)
  return { ok: false, message: "That didn't work. Try again in a moment." }
}

const channelName = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^#/, "").replace(/\s+/g, "-"))
  .pipe(
    z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, {
      error: "Use lowercase letters, numbers, dashes or underscores.",
    })
  )

export async function createChannelAction(
  slug: string,
  input: { name: string; topic: string; isPrivate: boolean; memberIds: string[] }
): Promise<Result> {
  let channelId: string
  try {
    const user = await requireUser()
    channelId = await createChannel(user, slug, {
      name: channelName.parse(input.name),
      topic: z.string().trim().max(250).parse(input.topic),
      isPrivate: !!input.isPrivate,
      memberIds: z.array(id).max(200).parse(input.memberIds),
    })
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/chat`, "layout")
  redirect(`/w/${slug}/chat/${channelId}`)
}

export async function openDmAction(slug: string, userIds: string[]): Promise<Result> {
  let channelId: string
  try {
    channelId = await getOrCreateDm(
      await requireUser(),
      slug,
      z.array(id).min(1).max(8).parse(userIds)
    )
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/chat`, "layout")
  redirect(`/w/${slug}/chat/${channelId}`)
}

export async function joinChannelAction(slug: string, channelId: string): Promise<Result> {
  try {
    await joinChannel(await requireUser(), id.parse(channelId))
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/chat`, "layout")
  redirect(`/w/${slug}/chat/${channelId}`)
}

export async function leaveChannelAction(slug: string, channelId: string): Promise<Result> {
  try {
    await leaveChannel(await requireUser(), id.parse(channelId))
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/chat`, "layout")
  redirect(`/w/${slug}/chat`)
}

export async function loadMessagesAction(channelId: string) {
  return listMessages(await requireUser(), id.parse(channelId))
}

export async function loadThreadAction(parentId: string) {
  return listThread(await requireUser(), id.parse(parentId))
}

export async function sendMessageAction(
  channelId: string,
  input: {
    body: string
    parentId?: string | null
    mentionIds?: string[]
    attachmentIds?: string[]
    videoId?: string | null
    shareVideoWithChannel?: boolean
  }
): Promise<Result<{ id: string }>> {
  try {
    const body = z
      .string()
      .trim()
      .max(8000, { error: "That message is too long." })
      .parse(input.body)
    if (!body && !input.attachmentIds?.length && !input.videoId)
      return { ok: false, message: "Write a message first." }
    const messageId = await postMessage(await requireUser(), id.parse(channelId), {
      body,
      parentId: input.parentId ? id.parse(input.parentId) : null,
      mentionIds: z
        .array(id)
        .max(50)
        .parse(input.mentionIds ?? []),
      attachmentIds: z
        .array(id)
        .max(10)
        .parse(input.attachmentIds ?? []),
      videoId: input.videoId ? id.parse(input.videoId) : null,
      shareVideoWithChannel: !!input.shareVideoWithChannel,
    })
    return { ok: true, id: messageId }
  } catch (e) {
    return fail(e)
  }
}

export async function editMessageAction(messageId: string, body: string): Promise<Result> {
  try {
    await editMessage(
      await requireUser(),
      id.parse(messageId),
      z.string().trim().min(1).max(8000).parse(body)
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteMessageAction(messageId: string): Promise<Result> {
  try {
    await deleteMessage(await requireUser(), id.parse(messageId))
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function reactAction(messageId: string, emoji: string): Promise<Result> {
  try {
    await toggleChatReaction(
      await requireUser(),
      id.parse(messageId),
      z.string().min(1).max(16).parse(emoji)
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function pinAction(messageId: string, pin: boolean): Promise<Result> {
  try {
    await pinMessage(await requireUser(), id.parse(messageId), pin)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function markReadAction(channelId: string) {
  await markRead(await requireUser(), id.parse(channelId))
}

export async function notifyAction(channelId: string, level: string): Promise<Result> {
  try {
    await setNotifyLevel(
      await requireUser(),
      id.parse(channelId),
      z.enum(["all", "mentions", "none"]).parse(level)
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function attachmentUploadAction(
  channelId: string,
  file: { name: string; mimeType: string; sizeBytes: number }
): Promise<Result<{ attachmentId: string; uploadUrl: string; contentType: string }>> {
  try {
    return {
      ok: true,
      ...(await createAttachmentUpload(await requireUser(), id.parse(channelId), file)),
    }
  } catch (e) {
    return fail(e)
  }
}

export async function attachmentUrlAction(attachmentId: string): Promise<Result<{ url: string }>> {
  try {
    return { ok: true, url: await attachmentUrl(await requireUser(), id.parse(attachmentId)) }
  } catch (e) {
    return fail(e)
  }
}

export async function huddleAction(channelId: string): Promise<Result> {
  let roomId: string
  try {
    roomId = await startHuddle(await requireUser(), id.parse(channelId))
  } catch (e) {
    return fail(e)
  }
  redirect(`/live/${roomId}`)
}
