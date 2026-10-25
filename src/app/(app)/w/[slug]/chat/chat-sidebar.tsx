"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation"
import { Compass, Hash, Lock, Plus, Search } from "lucide-react"
import { FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { SidebarChannel } from "@/server/chat"
import { createChannelAction, openDmAction } from "./actions"

type Person = { id: string; name: string; email: string }

export function ChatSidebar({
  slug,
  channels,
  dms,
  people,
}: {
  slug: string
  channels: SidebarChannel[]
  dms: SidebarChannel[]
  people: Person[]
}) {
  const segment = useSelectedLayoutSegment()
  const params = useParams<{ channelId?: string }>()
  const router = useRouter()
  // With a thread open on mid-size screens, the list steps aside so the conversation has room.
  const threadOpen = !!useSearchParams().get("thread")
  const [q, setQ] = useState("")
  // On phones the sidebar is the chat home; inside a channel it hides.
  const inChannel = !!segment && segment !== "browse" && segment !== "search"
  return (
    <aside
      aria-label="Channels and messages"
      className={cn(
        "flex min-h-0 w-full flex-col border-r border-border bg-surface lg:w-72",
        inChannel || segment ? "max-lg:hidden" : "",
        threadOpen && "lg:max-2xl:hidden"
      )}
    >
      <form
        role="search"
        className="border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) router.push(`/w/${slug}/chat/search?q=${encodeURIComponent(q.trim())}`)
        }}
      >
        <Label htmlFor="chat-search" className="sr-only">
          Search messages
        </Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            strokeWidth={1.75}
          />
          <Input
            id="chat-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
            className="pl-9"
          />
        </div>
      </form>
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto p-2">
        <Group title="Channels" action={<NewChannel slug={slug} people={people} />}>
          {channels.map((c) => (
            <Item key={c.id} slug={slug} c={c} active={params.channelId === c.id} />
          ))}
          <li>
            <Link
              href={`/w/${slug}/chat/browse`}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-callout text-fg-secondary hover:bg-raised hover:text-fg",
                segment === "browse" && "bg-raised text-fg"
              )}
            >
              <Compass aria-hidden className="size-4" strokeWidth={1.75} />
              Browse channels
            </Link>
          </li>
        </Group>
        <Group title="Direct messages" action={<NewDm slug={slug} people={people} />}>
          {dms.length === 0 && (
            <li className="px-3 py-2 text-footnote text-fg-muted">No direct messages yet.</li>
          )}
          {dms.map((c) => (
            <Item key={c.id} slug={slug} c={c} active={params.channelId === c.id} />
          ))}
        </Group>
      </nav>
    </aside>
  )
}

function Group({
  title,
  action,
  children,
}: {
  title: string
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between px-3 py-1">
        <h2 className="font-sans text-footnote font-semibold text-fg-secondary">{title}</h2>
        {action}
      </div>
      <ul className="grid gap-0.5">{children}</ul>
    </section>
  )
}

function Item({ slug, c, active }: { slug: string; c: SidebarChannel; active: boolean }) {
  const Icon = c.kind === "dm" ? null : c.isPrivate ? Lock : Hash
  const unread = c.unread > 0
  return (
    <li>
      <Link
        href={`/w/${slug}/chat/${c.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-callout transition-colors duration-150",
          active
            ? "bg-brand-soft text-brand-ink"
            : unread
              ? "font-semibold text-fg hover:bg-raised"
              : "text-fg-secondary hover:bg-raised hover:text-fg"
        )}
      >
        {Icon ? (
          <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        ) : (
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-[0.625rem] font-semibold"
          >
            {c.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {c.name}
          {c.isPrivate && c.kind === "channel" && <span className="sr-only"> (private)</span>}
        </span>
        {c.mentions > 0 ? (
          <span className="rounded-full bg-brand px-1.5 text-caption font-semibold text-on-brand tnum">
            {c.mentions}
            <span className="sr-only"> {c.kind === "dm" ? "unread" : "mentions"}</span>
          </span>
        ) : unread ? (
          <span className="sr-only">, unread messages</span>
        ) : null}
      </Link>
    </li>
  )
}

function PeoplePicker({
  people,
  selected,
  onChange,
}: {
  people: Person[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [filter, setFilter] = useState("")
  const shown = people.filter((p) =>
    `${p.name} ${p.email}`.toLowerCase().includes(filter.toLowerCase())
  )
  return (
    <div className="grid gap-2">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find people"
        aria-label="Find people"
      />
      <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
        {shown.length === 0 && (
          <li className="px-3 py-2 text-footnote text-fg-muted">Nobody matches.</li>
        )}
        {shown.map((p) => (
          <li key={p.id}>
            <Label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 hover:bg-raised">
              <Checkbox
                checked={selected.includes(p.id)}
                onCheckedChange={(v) =>
                  onChange(v ? [...selected, p.id] : selected.filter((x) => x !== p.id))
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-callout">{p.name}</span>
                <span className="block truncate text-footnote font-normal text-fg-secondary">
                  {p.email}
                </span>
              </span>
            </Label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NewChannel({ slug, people }: { slug: string; people: Person[] }) {
  const [name, setName] = useState("")
  const [topic, setTopic] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="New channel">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>Channels are for a topic, project or team.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await createChannelAction(slug, {
                name,
                topic,
                isPrivate,
                memberIds: members,
              })
              if (r && !r.ok) setError(r.message)
            })
          }}
        >
          <FormMessage message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="ch-name" className="text-footnote font-medium">
              Name
            </Label>
            <Input
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="design-review"
              maxLength={80}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ch-topic" className="text-footnote font-medium">
              Topic (optional)
            </Label>
            <Input
              id="ch-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What's this channel for?"
              maxLength={250}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="ch-private" className="text-callout font-medium">
                Private
              </Label>
              <p id="ch-private-help" className="mt-1 text-footnote text-fg-secondary">
                {isPrivate
                  ? "Only the people you add can find it or read it."
                  : "Everyone in the workspace can find and join it."}
              </p>
            </div>
            <Switch
              id="ch-private"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
              aria-describedby="ch-private-help"
            />
          </div>
          {isPrivate && (
            <div className="grid gap-1.5">
              <span className="text-footnote font-medium">Add people</span>
              <PeoplePicker people={people} selected={members} onChange={setMembers} />
            </div>
          )}
          <Button type="submit" loading={pending} disabled={!name.trim()}>
            Create channel
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewDm({ slug, people }: { slug: string; people: Person[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="New direct message">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>Only the people you pick can read it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormMessage message={error} />
          <PeoplePicker people={people} selected={selected} onChange={setSelected} />
          <Button
            loading={pending}
            disabled={selected.length === 0}
            onClick={() =>
              start(async () => {
                const r = await openDmAction(slug, selected)
                if (r && !r.ok) setError(r.message)
              })
            }
          >
            {selected.length > 1 ? `Message ${selected.length} people` : "Open conversation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
