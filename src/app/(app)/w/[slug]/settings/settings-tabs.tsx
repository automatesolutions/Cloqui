"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function SettingsTabs({ slug, showAdmin }: { slug: string; showAdmin: boolean }) {
  const pathname = usePathname()
  const tabs = [
    { href: `/w/${slug}/settings`, label: "Workspace" },
    { href: `/w/${slug}/settings/members`, label: "Members" },
    ...(showAdmin ? [{ href: `/w/${slug}/settings/audit`, label: "Audit log" }] : []),
  ]
  return (
    <nav aria-label="Settings" className="mb-8 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 items-center border-b-2 px-3 text-callout font-medium whitespace-nowrap transition-colors duration-150",
              active ? "border-brand text-fg" : "border-transparent text-fg-secondary hover:text-fg"
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
