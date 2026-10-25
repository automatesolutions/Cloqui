// Shared by server and client components. Keep plain data here (no "use client"), so server
// components get the real values instead of client references.
export const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
} as const

export const roleHelp = {
  admin: "Can invite people, change roles and see the audit log.",
  member: "Can see the workspace and everything shared with its members.",
  guest: "Only sees single items you share with them. No workspace access.",
} as const

export type AssignableRole = keyof typeof roleHelp
