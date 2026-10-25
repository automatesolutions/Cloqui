"use server"

import { z } from "zod"
import { requireUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { completeUpload, createVideoUpload, MAX_UPLOAD_BYTES } from "@/server/videos"
import { UserFacingError } from "@/server/workspaces"

type Result<T> = ({ ok: true } & T) | { ok: false; message: string }

const startSchema = z.object({
  title: z.string().trim().min(1, { error: "Add a title." }).max(120),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  durationMs: z.number().int().nonnegative().optional(),
  trimStartMs: z.number().int().nonnegative().optional(),
  trimEndMs: z.number().int().positive().optional(),
})

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof UserFacingError) return { ok: false, message: e.message }
  if (e instanceof AccessDeniedError)
    return { ok: false, message: "You don't have permission to do that." }
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the details and try again." }
  console.error("upload action failed", (e as Error)?.name)
  return { ok: false, message: "That didn't work. Try again in a moment." }
}

export async function startUploadAction(
  slug: string,
  input: z.input<typeof startSchema>
): Promise<Result<{ videoId: string; uploadUrl: string; contentType: string }>> {
  try {
    const user = await requireUser()
    const data = startSchema.parse(input)
    return { ok: true, ...(await createVideoUpload(user, slug, data)) }
  } catch (e) {
    return fail(e)
  }
}

export async function finishUploadAction(videoId: string): Promise<Result<object>> {
  try {
    const user = await requireUser()
    await completeUpload(user, z.uuid().parse(videoId))
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
