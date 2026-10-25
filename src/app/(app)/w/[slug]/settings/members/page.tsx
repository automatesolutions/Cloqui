import type { Metadata } from "next"
import { initials } from "@/components/app/initials"
import { requireUser } from "@/server/auth"
import { assignableRoles, canManageMember, getWorkspaceAccess, roleCan } from "@/server/authz"
import { listMembers, listOpenInvites } from "@/server/workspaces"
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from "../actions"
import { roleLabels } from "@/lib/roles"
import { ConfirmAction, InviteForm, RoleSelect } from "./member-controls"

export const metadata: Metadata = { title: "Members" }

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

export default async function MembersPage({ params }: PageProps<"/w/[slug]/settings/members">) {
  const { slug } = await params
  const user = await requireUser()
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null

  const canInvite = roleCan(access.role, "members.invite")
  const [members, invites] = await Promise.all([
    listMembers(user, slug),
    canInvite ? listOpenInvites(user, slug) : Promise.resolve([]),
  ])
  const roles = assignableRoles(access.role) as ("admin" | "member" | "guest")[]

  return (
    <div className="grid gap-10">
      {canInvite && (
        <section
          aria-labelledby="invite-h"
          className="rounded-lg border border-border bg-surface p-5 shadow-sm md:p-6"
        >
          <h2 id="invite-h" className="mb-1 text-title-3 font-medium">
            Invite people
          </h2>
          <p className="mb-5 text-callout text-fg-secondary">
            Only people you invite can join {access.workspace.name}.
          </p>
          <InviteForm action={inviteAction.bind(null, slug)} roles={roles} />
        </section>
      )}

      {canInvite && invites.length > 0 && (
        <section aria-labelledby="pending-h">
          <h2 id="pending-h" className="mb-3 text-title-3 font-medium">
            Waiting to join
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-callout font-medium">{inv.email}</p>
                  <p className="text-footnote text-fg-secondary tnum">
                    {roleLabels[inv.role]} · Link expires {dateFmt.format(inv.expiresAt)}
                  </p>
                </div>
                <ConfirmAction
                  trigger="Cancel invite"
                  title={`Cancel the invite for ${inv.email}?`}
                  body="Their link will stop working right away. You can invite them again later."
                  confirmLabel="Cancel invite"
                  cancelLabel="Keep invite"
                  successMessage="Invite canceled."
                  onConfirm={revokeInviteAction.bind(null, slug, inv.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-3 text-title-3 font-medium">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {members.map((m) => {
            const isMe = m.userId === user.id
            const manageable = !isMe && canManageMember(access.role, m.role, "member")
            const first = m.displayName.split(" ")[0]
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary">
                  {initials(m.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-callout font-medium">
                    {m.displayName}
                    {isMe && <span className="text-fg-secondary"> (you)</span>}
                  </p>
                  <p className="truncate text-footnote text-fg-secondary">{m.email}</p>
                </div>
                {manageable && m.role !== "owner" ? (
                  <>
                    <RoleSelect
                      name={first}
                      role={m.role}
                      roles={roles}
                      onChange={changeRoleAction.bind(null, slug, m.userId)}
                    />
                    <ConfirmAction
                      trigger="Remove"
                      title={`Remove ${first}?`}
                      body={`${first} will lose access to ${access.workspace.name} right away, including everything shared with its members.`}
                      confirmLabel="Remove access"
                      cancelLabel="Keep access"
                      successMessage={`${first} was removed.`}
                      onConfirm={removeMemberAction.bind(null, slug, m.userId)}
                    />
                  </>
                ) : (
                  <span className="text-footnote text-fg-secondary">{roleLabels[m.role]}</span>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
