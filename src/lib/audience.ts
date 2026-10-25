/**
 * The words on every AccessChip. Plain counts and names, never "public".
 * `others` are the people the video is shared with, not counting the owner.
 */
export function audienceLabel(opts: {
  viewerIsOwner: boolean
  workspaceVisible: boolean
  workspaceName: string
  others: { name: string }[]
}): { label: string; scope: "private" | "workspace"; people: boolean } {
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
