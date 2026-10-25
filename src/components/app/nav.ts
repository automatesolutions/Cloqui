import { Home, ListChecks, MessageSquare, Radio, Settings, Video } from "lucide-react"

export type NavItem = {
  label: string
  href: (slug: string) => string
  icon: typeof Home
  /** Shown in the mobile tab bar. */
  tab?: boolean
}

export const navItems: NavItem[] = [
  { label: "Home", href: (s) => `/w/${s}`, icon: Home, tab: true },
  { label: "Library", href: (s) => `/w/${s}/library`, icon: Video, tab: true },
  { label: "Live", href: (s) => `/w/${s}/live`, icon: Radio },
  { label: "Chat", href: (s) => `/w/${s}/chat`, icon: MessageSquare, tab: true },
  { label: "Tasks", href: (s) => `/w/${s}/tasks`, icon: ListChecks, tab: true },
  { label: "Settings", href: (s) => `/w/${s}/settings`, icon: Settings },
]

export function isActive(pathname: string, href: string, slug: string) {
  return href === `/w/${slug}`
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}
