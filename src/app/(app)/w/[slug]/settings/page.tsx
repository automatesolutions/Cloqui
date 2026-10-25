import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, roleCan } from "@/server/authz"
import { updateWorkspaceAction } from "./actions"
import { WorkspaceForm } from "./workspace-form"

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params
  const user = await requireUser()
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  return (
    <WorkspaceForm
      action={updateWorkspaceAction.bind(null, slug)}
      name={access.workspace.name}
      domain={access.workspace.allowedEmailDomain}
      canEdit={roleCan(access.role, "workspace.update")}
    />
  )
}
