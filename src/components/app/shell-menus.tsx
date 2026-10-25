"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Plus, ShieldCheck, ShieldOff, Sun } from "lucide-react"
import { signOutAction, signOutEverywhereAction } from "@/app/(auth)/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initials } from "./initials"

type Ws = { name: string; slug: string }

export function WorkspaceSwitcher({ current, workspaces }: { current: Ws; workspaces: Ws[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left transition-colors duration-150 hover:bg-raised">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-sm bg-brand text-caption font-semibold text-on-brand"
        >
          {initials(current.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-callout font-semibold">{current.name}</span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <span className="sr-only">, switch workspace</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-footnote text-fg-muted">
          Your workspaces
        </DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.slug} asChild>
            <Link href={`/w/${w.slug}`}>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.slug === current.slug && (
                <Check aria-label="Current" className="size-4 text-brand" />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            Create a workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="grid size-11 place-items-center rounded-full transition-colors duration-150 hover:bg-raised">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
        >
          {initials(name)}
        </span>
        <span className="sr-only">Your account</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate text-callout font-semibold">{name}</span>
          <span className="truncate text-footnote font-normal text-fg-secondary">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <ShieldCheck aria-hidden className="size-4" strokeWidth={1.75} />
            Account and security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-footnote text-fg-muted">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden className="size-4" strokeWidth={1.75} />
            Match my device
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden className="size-4" strokeWidth={1.75} />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden className="size-4" strokeWidth={1.75} />
            Light
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
        <form action={signOutEverywhereAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <ShieldOff aria-hidden className="size-4" strokeWidth={1.75} />
              Sign out everywhere
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
