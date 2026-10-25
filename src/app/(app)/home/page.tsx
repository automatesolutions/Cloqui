import { Suspense } from "react"
import { redirect } from "next/navigation"
import { requireUser } from "@/server/auth"
import { listSharedWithMe } from "@/server/videos"
import { listMyWorkspaces } from "@/server/workspaces"

export default function HomeRedirect() {
  return (
    <Suspense
      fallback={
        <p className="sr-only" role="status">
          Opening your workspace
        </p>
      }
    >
      <Go />
    </Suspense>
  )
}

async function Go(): Promise<never> {
  const user = await requireUser("/home")
  const workspaces = (await listMyWorkspaces(user)).filter((w) => w.role !== "guest")
  if (workspaces.length > 0) redirect(`/w/${workspaces[0].slug}`)
  // Guests with something shared go to their shared list; everyone else sets up a workspace.
  const shared = await listSharedWithMe(user)
  redirect(shared.length > 0 ? "/shared" : "/onboarding")
}
