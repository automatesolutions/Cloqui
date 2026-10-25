import type { Metadata } from "next"
import { PageHeader } from "@/components/app/page-header"
import { Recorder } from "@/components/record/recorder"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"

export const metadata: Metadata = { title: "Record" }

export default async function RecordPage({ params }: PageProps<"/w/[slug]/record">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/record`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  return (
    <>
      <PageHeader
        title="Record"
        description="Your video stays private until you choose who can see it."
      />
      <Recorder slug={slug} workspaceName={access.workspace.name} />
    </>
  )
}
