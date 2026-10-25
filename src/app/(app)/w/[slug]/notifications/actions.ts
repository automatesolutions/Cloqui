"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/server/auth"
import { markNotificationsRead } from "@/server/chat"

export async function markAllReadAction(slug: string) {
  await markNotificationsRead(await requireUser())
  revalidatePath(`/w/${slug}`, "layout")
}
