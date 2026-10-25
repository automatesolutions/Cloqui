"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, BellOff, Hash, Headphones, Lock, LogOut, Pin, Users } from "lucide-react"
import { toast } from "sonner"
import { initials } from "@/components/app/initials"
import { ActionButton } from "@/components/forms/action-button"
import { AccessChip } from "@/components/privacy/access-chip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { ChatMessage } from "@/server/chat"
import { huddleAction, leaveChannelAction, notifyAction } from "../actions"

export function ChannelHeader({
  slug,
  channelId,
  kind,
  isPrivate,
  title,
  topic,
  audience,
  members,
  pinned,
  notify,
  isMember,
}: {
  slug: string
  channelId: string
  kind: "channel" | "dm"
  isPrivate: boolean
  title: string
  topic: string
  audience: { label: string; scope: "private" | "workspace"; people: boolean }
  members: { id: string; name: string; email: string }[]
  pinned: ChatMessage[]
  notify: "all" | "mentions" | "none"
  isMember: boolean
}) {
  const [level, setLevel] = useState(notify)
  const [pending, start] = useTransition()
  const Icon = kind === "dm" ? null : isPrivate ? Lock : Hash
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Button size="icon" variant="ghost" asChild className="lg:hidden">
        <Link href={`/w/${slug}/chat`} aria-label="All conversations">
          <ArrowLeft />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-1.5 truncate font-sans text-headline">
          {Icon && (
            <Icon aria-hidden className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.75} />
          )}
          <span className="truncate">{kind === "channel" ? title.replace(/^#/, "") : title}</span>
        </h1>
        {topic && <p className="truncate text-footnote text-fg-secondary">{topic}</p>}
      </div>
      <AccessChip
        label={audience.label}
        scope={audience.scope}
        people={audience.people}
        className="max-sm:hidden"
      />

      <ActionButton
        size="sm"
        variant="secondary"
        aria-label="Start or join a huddle"
        action={huddleAction.bind(null, channelId)}
      >
        <Headphones aria-hidden />
        <span className="max-sm:hidden">Huddle</span>
      </ActionButton>

      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Pinned messages, ${pinned.length}`}>
            <Pin />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>Pinned</SheetTitle>
            <SheetDescription>Anyone in the conversation can pin a message.</SheetDescription>
          </SheetHeader>
          <ul className="grid gap-3 p-5">
            {pinned.length === 0 && (
              <li className="text-callout text-fg-secondary">Nothing pinned yet.</li>
            )}
            {pinned.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-surface p-3">
                <p className="text-footnote font-semibold">{m.authorName}</p>
                <p className="mt-1 line-clamp-4 text-callout whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`People, ${members.length}`}>
            <Users aria-hidden />
            <span className="tnum">{members.length}</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>People</SheetTitle>
            <SheetDescription>
              <AccessChip label={audience.label} scope={audience.scope} people={audience.people} />
            </SheetDescription>
          </SheetHeader>
          <ul className="divide-y divide-border p-2">
            {members.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout">{p.name}</span>
                  <span className="block truncate text-footnote text-fg-secondary">{p.email}</span>
                </span>
              </li>
            ))}
          </ul>
          {kind === "channel" && !isPrivate && (
            <p className="px-5 pb-5 text-footnote text-fg-secondary">
              Everyone in the workspace can read this channel and join it.
            </p>
          )}
        </SheetContent>
      </Sheet>

      {isMember && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Notification settings">
              {level === "none" ? <BellOff /> : <Bell />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-footnote text-fg-muted">
              Notify me about
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={level}
              onValueChange={(v) =>
                start(async () => {
                  const prev = level
                  setLevel(v as typeof level)
                  const r = await notifyAction(channelId, v)
                  if (!r.ok) {
                    setLevel(prev)
                    toast.error(r.message)
                  }
                })
              }
            >
              <DropdownMenuRadioItem value="all" disabled={pending}>
                Mentions and replies
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="mentions" disabled={pending}>
                Only mentions
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none" disabled={pending}>
                Nothing
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {kind === "channel" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    start(async () => {
                      const r = await leaveChannelAction(slug, channelId)
                      if (r && !r.ok) toast.error(r.message)
                    })
                  }
                >
                  <LogOut aria-hidden className="size-4" />
                  Leave channel
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  )
}
