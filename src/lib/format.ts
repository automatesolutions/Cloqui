export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", then "Oct 3". */
export function relativeDate(d: Date, now = new Date()) {
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600)
    return `${Math.floor(diff / 60)} ${Math.floor(diff / 60) === 1 ? "minute" : "minutes"} ago`
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} ${Math.floor(diff / 3600) === 1 ? "hour" : "hours"} ago`
  if (diff < 172800) return "yesterday"
  return dayFmt.format(d)
}
