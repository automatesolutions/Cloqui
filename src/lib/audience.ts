/**
 * The words on every AccessChip. Plain counts and names.
 * `others` are the people the video is shared with, not counting the owner.
 * A public link outranks everything else: it's the widest audience, so it's what the chip says.
 */
export function audienceLabel(opts: {
  viewerIsOwner: boolean
  workspaceVisible: boolean
  workspaceName: string
  others: { name: string }[]
  publicLink?: boolean
}): { label: string; scope: "private" | "workspace" | "public"; people: boolean } {
  if (opts.publicLink) {
    return { label: "Anyone with the link", scope: "public", people: false }
  }
  if (opts.workspaceVisible) {
    return { label: `Everyone in ${opts.workspaceName}`, scope: "workspace", people: false }
  }
  const n = opts.others.length
  if (n === 0) {
    return {
      label: opts.viewerIsOwner ? "Only you" : "Only the owner",
      scope: "private",
      people: false,
    }
  }
  if (n === 1 && opts.viewerIsOwner) {
    return {
      label: `You and ${opts.others[0].name.split(" ")[0]}`,
      scope: "private",
      people: false,
    }
  }
  return { label: `${n + 1} people`, scope: "private", people: true }
}
