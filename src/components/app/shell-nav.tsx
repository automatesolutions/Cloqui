"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { isActive, navItems } from "./nav"

export function SidebarNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Workspace" className="grid gap-0.5">
      {navItems.map((item) => {
        const href = item.href(slug)
        const active = isActive(pathname, href, slug)
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-callout font-medium transition-colors duration-150",
              active
                ? "bg-brand-soft text-brand-ink"
                : "text-fg-secondary hover:bg-raised hover:text-fg"
            )}
          >
            <item.icon aria-hidden className="size-5" strokeWidth={1.75} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Bottom tab bar on phones: 4 tabs with Record in the middle. Always visible on top-level screens. */
export function MobileTabBar({ slug }: { slug: string }) {
  const pathname = usePathname()
  const tabs = navItems.filter((i) => i.tab)
  const left = tabs.slice(0, 2)
  const right = tabs.slice(2)
  const tab = (item: (typeof tabs)[number]) => {
    const href = item.href(slug)
    const active = isActive(pathname, href, slug)
    return (
      <Link
        key={item.label}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium",
          active ? "text-brand" : "text-fg-secondary"
        )}
      >
        <item.icon aria-hidden className="size-6" strokeWidth={active ? 2 : 1.75} />
        {item.label}
      </Link>
    )
  }
  return (
    <nav
      aria-label="Workspace"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {left.map(tab)}
      <div className="flex flex-1 items-center justify-center">
        <Link
          href={`/w/${slug}/record`}
          aria-label="Record a video"
          className="grid size-12 place-items-center rounded-full bg-brand text-on-brand shadow-md"
        >
          <CircleDot aria-hidden className="size-6" strokeWidth={1.75} />
        </Link>
      </div>
      {right.map(tab)}
    </nav>
  )
}
