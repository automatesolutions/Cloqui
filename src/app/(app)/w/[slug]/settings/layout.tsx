import { PageHeader } from "@/components/app/page-header"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, roleCan } from "@/server/authz"
import { SettingsTabs } from "./settings-tabs"

export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/settings">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/settings`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  return (
    <>
      <PageHeader title="Settings" description={access.workspace.name} />
      <SettingsTabs slug={slug} showAdmin={roleCan(access.role, "audit.view")} />
      {children}
    </>
  )
}
