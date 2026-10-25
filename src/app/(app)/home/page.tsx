import { Suspense } from "react"
import { redirect } from "next/navigation"
import { requireUser } from "@/server/auth"
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
  redirect(workspaces.length > 0 ? `/w/${workspaces[0].slug}` : "/onboarding")
}
