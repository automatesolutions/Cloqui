import { Download } from "lucide-react"
import { AccessDenied } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, roleCan } from "@/server/authz"
import { getSecuritySettings } from "@/server/workspace-admin"
import { setRetentionAction } from "../actions"
import { DeleteWorkspaceButton, RequireTwoFactorToggle, RetentionForm } from "./security-controls"

export default async function SecuritySettingsPage({
  params,
}: PageProps<"/w/[slug]/settings/security">) {
  const { slug } = await params
  const user = await requireUser()
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  if (!roleCan(access.role, "workspace.update")) {
    return <AccessDenied body="Only workspace admins can change security settings." />
  }
  const settings = await getSecuritySettings(user, slug)
  const section = "grid gap-4 rounded-lg border border-border bg-surface p-5 md:p-6"
  return (
    <div className="grid max-w-3xl gap-8 pb-16">
      <section aria-labelledby="sec-2fa" className={section}>
        <h2 id="sec-2fa" className="text-title-3 font-medium">
          Two-step sign-in
        </h2>
        <RequireTwoFactorToggle
          slug={slug}
          initial={settings.require2fa}
          missing={settings.membersWithoutTwoFactor.map((m) =>
            m.id === user.id ? { ...m, name: `${m.name} (you)` } : m
          )}
        />
      </section>

      <section aria-labelledby="sec-ret" className={section}>
        <h2 id="sec-ret" className="text-title-3 font-medium">
          How long things are kept
        </h2>
        <RetentionForm
          action={setRetentionAction.bind(null, slug)}
          videoDays={settings.retentionVideoDays}
          messageDays={settings.retentionMessageDays}
        />
      </section>

      <section aria-labelledby="sec-exp" className={section}>
        <h2 id="sec-exp" className="text-title-3 font-medium">
          Export
        </h2>
        <p className="text-callout text-fg-secondary">
          Download members, channels, messages, video details and tasks as JSON. It only includes
          what you can see: private channels and spaces you aren&apos;t in stay out.
        </p>
        <Button variant="secondary" asChild className="justify-self-start">
          <a href={`/api/w/${slug}/export`} download>
            <Download aria-hidden />
            Download export
          </a>
        </Button>
      </section>

      {access.role === "owner" ? (
        <section aria-labelledby="sec-del" className={`${section} border-danger/30`}>
          <h2 id="sec-del" className="text-title-3 font-medium">
            Delete workspace
          </h2>
          <p className="text-callout text-fg-secondary">
            Removes it for everyone in it, with every file.
          </p>
          <DeleteWorkspaceButton slug={slug} name={access.workspace.name} />
        </section>
      ) : null}
    </div>
  )
}
