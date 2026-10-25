"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Download,
  FileText,
  Lock,
  MessageSquareReply,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  SmilePlus,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { initials } from "@/components/app/initials"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDuration } from "@/lib/format"
import { supabaseBrowser } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/server/chat"
import {
  attachmentUploadAction,
  attachmentUrlAction,
  deleteMessageAction,
  editMessageAction,
  loadMessagesAction,
  loadThreadAction,
  markReadAction,
  pinAction,
  reactAction,
  sendMessageAction,
} from "../actions"

type Member = { id: string; name: string; email: string }
type MyVideo = { id: string; title: string; isOwner: boolean }
const QUICK = ["👍", "❤️", "😂", "🎉", "👀", "✅"]

// ── Realtime ────────────────────────────────────────────────────────────────

/** Calls `onChange` (debounced) when messages or reactions in this channel change. */
function useChannelChanges(channelId: string, onChange: () => void) {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  }, [onChange])
  useEffect(() => {
    const supabase = supabaseBrowser()
    let t: ReturnType<typeof setTimeout> | undefined
    const bump = () => {
      clearTimeout(t)
      t = setTimeout(() => cb.current(), 150)
    }
    const ch = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        bump
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, bump)
      .subscribe()
    return () => {
      clearTimeout(t)
      void supabase.removeChannel(ch)
    }
  }, [channelId])
}

/** Typing indicator and who's online, on the private (authorized) topic chat:<id>. */
function usePresence(channelId: string, me: { id: string; name: string }) {
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({})
  const [online, setOnline] = useState(1)
  const chRef = useRef<ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const supabase = supabaseBrowser()
    let cancelled = false
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      const ch = supabase.channel(`chat:${channelId}`, {
        config: { private: true, presence: { key: me.id } },
      })
      ch.on("broadcast", { event: "typing" }, ({ payload }: { payload: unknown }) => {
        const p = payload as { id: string; name: string }
        if (p.id !== me.id)
          setTyping((cur) => ({ ...cur, [p.id]: { name: p.name, at: Date.now() } }))
      })
      ch.on("presence", { event: "sync" }, () =>
        setOnline(Math.max(1, Object.keys(ch.presenceState()).length))
      )
      ch.subscribe((status: string) => {
        if (status === "SUBSCRIBED") void ch.track({ name: me.name })
      })
      chRef.current = ch
    })
    const sweep = setInterval(() => {
      setTyping((cur) =>
        Object.fromEntries(Object.entries(cur).filter(([, v]) => Date.now() - v.at < 4000))
      )
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(sweep)
      if (chRef.current) void supabase.removeChannel(chRef.current)
      chRef.current = null
    }
  }, [channelId, me.id, me.name])

  const sendTyping = useCallback(() => {
    if (Date.now() - lastSent.current < 2000) return
    lastSent.current = Date.now()
    void chRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { id: me.id, name: me.name },
    })
  }, [me.id, me.name])

  const names = Object.values(typing).map((t) => t.name.split(" ")[0])
  return {
    typingText:
      names.length === 0
        ? ""
        : names.length === 1
          ? `${names[0]} is typing…`
          : `${names.slice(0, 2).join(" and ")} are typing…`,
    online,
    sendTyping,
  }
}

// ── Conversation ────────────────────────────────────────────────────────────

export function Conversation({
  slug,
  channelId,
  me,
  initial,
  members,
  canPost,
  myVideos,
  header,
}: {
  slug: string
  channelId: string
  me: { id: string; name: string }
  initial: ChatMessage[]
  members: Member[]
  canPost: boolean
  myVideos: MyVideo[]
  header: React.ReactNode
}) {
  const [messages, setMessages] = useState(initial)
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const threadId = search.get("thread")
  const listRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [threadVersion, setThreadVersion] = useState(0)

  const reload = useCallback(async () => {
    try {
      setMessages(await loadMessagesAction(channelId))
      setThreadVersion((v) => v + 1)
      if (document.visibilityState === "visible") void markReadAction(channelId)
    } catch {
      // Lost access (removed from a private channel): the next navigation shows the right screen.
      router.refresh()
    }
  }, [channelId, router])
  useChannelChanges(channelId, reload)
  const { typingText, online, sendTyping } = usePresence(channelId, me)

  useEffect(() => {
    void markReadAction(channelId)
  }, [channelId])

  // Stick to the bottom when new messages arrive, unless the person scrolled up to read.
  useEffect(() => {
    const el = listRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const openThread = (id: string) => router.push(`${pathname}?thread=${id}`, { scroll: false })
  const closeThread = () => router.push(pathname, { scroll: false })

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section
        aria-label="Conversation"
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", threadId && "max-lg:hidden")}
      >
        {header}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          onScroll={(e) => {
            const el = e.currentTarget
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
        >
          {messages.length === 0 ? (
            <p className="py-12 text-center text-callout text-fg-secondary">
              No messages yet. Say hello.
            </p>
          ) : (
            <MessageList messages={messages} me={me} members={members} onThread={openThread} />
          )}
        </div>
        <p aria-live="polite" className="h-5 px-4 text-footnote text-fg-muted">
          {typingText}
        </p>
        {canPost ? (
          <Composer
            channelId={channelId}
            members={members}
            myVideos={myVideos}
            onTyping={sendTyping}
            onSent={() => {
              atBottom.current = true
              void reload()
            }}
          />
        ) : (
          <p className="border-t border-border px-4 py-3 text-callout text-fg-secondary">
            This channel is archived.
          </p>
        )}
        <span className="sr-only" aria-live="polite">
          {online > 1 ? `${online} people here now` : ""}
        </span>
      </section>
      {threadId && (
        <ThreadPanel
          key={threadId}
          channelId={channelId}
          parentId={threadId}
          me={me}
          members={members}
          myVideos={myVideos}
          version={threadVersion}
          onClose={closeThread}
          onTyping={sendTyping}
          slug={slug}
        />
      )}
    </div>
  )
}

// ── Messages ────────────────────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
})
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })

function dayLabel(d: Date) {
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === y.toDateString()) return "Yesterday"
  return dayFmt.format(d)
}

function MessageList({
  messages,
  me,
  members,
  onThread,
  inThread = false,
}: {
  messages: ChatMessage[]
  me: { id: string; name: string }
  members: Member[]
  onThread?: (id: string) => void
  inThread?: boolean
}) {
  return (
    <ol className="grid gap-0.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const created = new Date(m.createdAt)
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== created.toDateString()
        const grouped =
          !!prev &&
          !newDay &&
          prev.authorId === m.authorId &&
          created.getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
        return (
          <li key={m.id}>
            {newDay && !inThread && (
              <div
                role="separator"
                className="my-4 flex items-center gap-3 text-footnote font-medium text-fg-muted"
              >
                <span className="h-px flex-1 bg-border" />
                {dayLabel(created)}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <MessageItem m={m} me={me} members={members} grouped={grouped} onThread={onThread} />
          </li>
        )
      })}
    </ol>
  )
}

function Body({ m, members }: { m: ChatMessage; members: Member[] }) {
  // Highlight @mentions of the people this message actually mentions.
  const names = members.filter((p) => m.mentions.includes(p.id)).map((p) => p.name)
  const tokens = names.length || /@(channel|here)\b/i.test(m.body)
  if (!tokens) return <>{m.body}</>
  const pattern = new RegExp(
    `(@(?:${[...names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "channel", "here"].join("|")}))`,
    "gi"
  )
  return (
    <>
      {m.body.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded-sm bg-brand-soft px-0.5 font-medium text-brand-ink">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

function MessageItem({
  m,
  me,
  members,
  grouped,
  onThread,
}: {
  m: ChatMessage
  me: { id: string; name: string }
  members: Member[]
  grouped: boolean
  onThread?: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [, start] = useTransition()
  const mine = m.authorId === me.id
  const created = new Date(m.createdAt)

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.message ?? "That didn't work.")
    })

  return (
    <article
      aria-label={`${m.authorName}, ${timeFmt.format(created)}`}
      className={cn(
        "group relative flex gap-3 rounded-md px-2 py-1 focus-within:bg-raised/60 hover:bg-raised/60",
        !grouped && "mt-3"
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
          >
            {initials(m.authorName)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-callout font-semibold">{m.authorName}</span>
            <time dateTime={created.toISOString()} className="text-caption text-fg-muted tnum">
              {timeFmt.format(created)}
            </time>
            {m.pinned && (
              <span className="inline-flex items-center gap-1 text-caption text-fg-secondary">
                <Pin aria-hidden className="size-3" /> Pinned
              </span>
            )}
          </p>
        )}
        {m.deleted ? (
          <p className="text-callout text-fg-muted italic">This message was deleted.</p>
        ) : editing ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              act(async () => {
                const r = await editMessageAction(m.id, draft)
                if (r.ok) setEditing(false)
                return r
              })
            }}
          >
            <Label htmlFor={`edit-${m.id}`} className="sr-only">
              Edit message
            </Label>
            <Textarea
              id={`edit-${m.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-16"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit">
                Save
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(m.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          m.body && (
            <p className="text-callout break-words whitespace-pre-wrap">
              <Body m={m} members={members} />
              {m.editedAt && <span className="ml-1 text-caption text-fg-muted">(edited)</span>}
            </p>
          )
        )}

        {m.video && <VideoCard v={m.video} />}
        {m.attachments.length > 0 && (
          <ul className="mt-2 grid gap-1.5">
            {m.attachments.map((a) => (
              <li
                key={a.id}
                className="flex max-w-md items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
              >
                <FileText
                  aria-hidden
                  className="size-5 shrink-0 text-fg-secondary"
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout">{a.name}</span>
                  <span className="block text-caption text-fg-muted tnum">
                    {formatBytes(a.sizeBytes)}
                  </span>
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Download ${a.name}`}
                  onClick={() =>
                    start(async () => {
                      const r = await attachmentUrlAction(a.id)
                      if (r.ok) window.location.assign(r.url)
                      else toast.error(r.message)
                    })
                  }
                >
                  <Download />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {m.reactions.length > 0 && (
          <div role="group" aria-label="Reactions" className="mt-1.5 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}`}
                onClick={() => act(() => reactAction(m.id, r.emoji))}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-footnote pointer-coarse:h-11",
                  r.mine
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-border bg-surface hover:bg-raised"
                )}
              >
                <span aria-hidden>{r.emoji}</span>
                <span className="tnum">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {onThread && m.replyCount > 0 && !m.deleted && (
          <button
            type="button"
            onClick={() => onThread(m.id)}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-footnote font-medium text-brand-ink hover:underline"
          >
            <MessageSquareReply aria-hidden className="size-4" strokeWidth={1.75} />
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {!m.deleted && !editing && (
        <div className="absolute -top-3 right-2 flex gap-0.5 rounded-md border border-border bg-raised p-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Add a reaction">
                <SmilePlus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="flex w-auto gap-1 p-1">
              {QUICK.map((e) => (
                <DropdownMenuItem
                  key={e}
                  aria-label={`React ${e}`}
                  className="justify-center text-body"
                  onSelect={() => act(() => reactAction(m.id, e))}
                >
                  {e}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {onThread && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Reply in thread"
              onClick={() => onThread(m.id)}
            >
              <MessageSquareReply />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => act(() => pinAction(m.id, !m.pinned))}>
                {m.pinned ? (
                  <PinOff aria-hidden className="size-4" />
                ) : (
                  <Pin aria-hidden className="size-4" />
                )}
                {m.pinned ? "Unpin" : "Pin to channel"}
              </DropdownMenuItem>
              {mine && (
                <>
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It&apos;s removed for everyone. Replies in its thread stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep it</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={() => act(() => deleteMessageAction(m.id))}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}

function VideoCard({ v }: { v: NonNullable<ChatMessage["video"]> }) {
  if (!v.canWatch) {
    return (
      <Link
        href={`/v/${v.id}`}
        className="mt-2 flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-raised"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-raised text-fg-secondary">
          <Lock aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-callout font-medium">
            You don&apos;t have access to this video
          </span>
          <span className="block text-footnote text-fg-secondary">
            Open it to ask the owner for access.
          </span>
        </span>
      </Link>
    )
  }
  return (
    <Link
      href={`/v/${v.id}`}
      className="mt-2 flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-2.5 hover:bg-raised"
    >
      <span className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-sm bg-raised text-fg-muted">
        {v.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <Video aria-hidden className="size-5" strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-callout font-medium">{v.title}</span>
        <span className="flex items-center gap-1.5 text-footnote text-fg-secondary">
          <Lock aria-hidden className="size-3.5" strokeWidth={1.75} />
          Private video{v.durationMs ? ` · ${formatDuration(v.durationMs)}` : ""}
        </span>
      </span>
    </Link>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

// ── Composer ────────────────────────────────────────────────────────────────

function Composer({
  channelId,
  parentId,
  members,
  myVideos,
  onTyping,
  onSent,
  placeholder = "Write a message",
}: {
  channelId: string
  parentId?: string
  members: Member[]
  myVideos: MyVideo[]
  onTyping: () => void
  onSent: () => void
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const [mentioned, setMentioned] = useState<Member[]>([])
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [files, setFiles] = useState<
    { id?: string; name: string; progress: number; error?: string }[]
  >([])
  const [video, setVideo] = useState<{ id: string; title: string; share: boolean } | null>(null)
  const [pickVideo, setPickVideo] = useState(false)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = parentId ? `reply-${parentId}` : `compose-${channelId}`

  const matches = useMemo(
    () =>
      query === null
        ? []
        : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    [query, members]
  )

  function onChange(v: string) {
    setText(v)
    onTyping()
    const caret = ref.current?.selectionStart ?? v.length
    const before = v.slice(0, caret)
    const m = before.match(/(^|\s)@([\p{L}\p{N}_-]*)$/u)
    setQuery(m ? m[2] : null)
    setHighlight(0)
  }

  function pick(p: Member) {
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}_-]*)$/u, `@${p.name} `)
    const next = before + text.slice(caret)
    setText(next)
    setMentioned((cur) => (cur.some((c) => c.id === p.id) ? cur : [...cur, p]))
    setQuery(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(before.length, before.length)
    })
  }

  async function upload(file: File) {
    const row = { name: file.name, progress: 0 }
    setFiles((f) => [...f, row])
    const r = await attachmentUploadAction(channelId, {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    })
    if (!r.ok) {
      setFiles((f) => f.map((x) => (x === row ? { ...x, error: r.message } : x)))
      return
    }
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", r.uploadUrl)
      xhr.setRequestHeader("Content-Type", r.contentType)
      xhr.upload.onprogress = (e) =>
        e.lengthComputable &&
        setFiles((f) =>
          f.map((x) => (x.name === file.name && !x.id ? { ...x, progress: e.loaded / e.total } : x))
        )
      xhr.onload = () => {
        setFiles((f) =>
          f.map((x) =>
            x.name === file.name && !x.id
              ? xhr.status < 300
                ? { ...x, id: r.attachmentId, progress: 1 }
                : { ...x, error: "Upload failed" }
              : x
          )
        )
        resolve()
      }
      xhr.onerror = () => {
        setFiles((f) =>
          f.map((x) => (x.name === file.name && !x.id ? { ...x, error: "Upload failed" } : x))
        )
        resolve()
      }
      xhr.send(file)
    })
  }

  function send() {
    const body = text.trim()
    const attachmentIds = files.filter((f) => f.id).map((f) => f.id!)
    if (!body && attachmentIds.length === 0 && !video) return
    if (files.some((f) => !f.id && !f.error))
      return toast.error("Wait for the files to finish uploading.")
    const mentionIds = mentioned.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id)
    start(async () => {
      const r = await sendMessageAction(channelId, {
        body,
        parentId: parentId ?? null,
        mentionIds,
        attachmentIds,
        videoId: video?.id ?? null,
        shareVideoWithChannel: video?.share ?? false,
      })
      if (!r.ok) return void toast.error(r.message)
      setText("")
      setMentioned([])
      setFiles([])
      setVideo(null)
      onSent()
    })
  }

  return (
    <div className="relative border-t border-border px-4 pt-3 pb-3">
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="People to mention"
          className="absolute bottom-full left-4 z-10 mb-1 w-72 rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-callout",
                i === highlight && "bg-raised"
              )}
            >
              <span
                aria-hidden
                className="grid size-6 place-items-center rounded-full bg-raised text-caption font-semibold"
              >
                {initials(p.name)}
              </span>
              {p.name}
            </li>
          ))}
        </ul>
      )}
      {(files.length > 0 || video) && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-footnote"
            >
              <FileText aria-hidden className="size-4" />
              <span className="max-w-40 truncate">{f.name}</span>
              <span className={cn("tnum", f.error ? "text-danger" : "text-fg-muted")}>
                {f.error ?? (f.id ? "Ready" : `${Math.round(f.progress * 100)}%`)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className="grid size-6 place-items-center rounded-sm hover:bg-raised"
                onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
          {video && (
            <li className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-footnote">
              <Video aria-hidden className="size-4" />
              <span className="max-w-48 truncate">{video.title}</span>
              {video.share && <span className="text-fg-muted">Shared with channel</span>}
              <button
                type="button"
                aria-label="Remove video"
                className="grid size-6 place-items-center rounded-sm hover:bg-raised"
                onClick={() => setVideo(null)}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-fg-secondary focus-within:outline-2 focus-within:outline-brand hover:bg-raised hover:text-fg">
          <Paperclip aria-hidden className="size-5" strokeWidth={1.75} />
          <span className="sr-only">Attach files</span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? []).slice(0, 10)) void upload(f)
              e.target.value = ""
            }}
          />
        </label>
        {myVideos.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share a video"
            onClick={() => setPickVideo(true)}
          >
            <Video />
          </Button>
        )}
        <Label htmlFor={id} className="sr-only">
          {placeholder}
        </Label>
        <Textarea
          id={id}
          ref={ref}
          value={text}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (matches.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setHighlight((h) => (h + 1) % matches.length)
                return
              }
              if (e.key === "ArrowUp") {
                e.preventDefault()
                setHighlight((h) => (h - 1 + matches.length) % matches.length)
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                pick(matches[highlight])
                return
              }
              if (e.key === "Escape") {
                setQuery(null)
                return
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          className="max-h-40 min-h-11 flex-1 resize-none py-2.5"
        />
        <Button size="icon" aria-label="Send" onClick={send} loading={pending}>
          <SendHorizontal />
        </Button>
      </div>
      <p className="mt-1 text-caption text-fg-muted max-sm:hidden">
        Enter to send · Shift + Enter for a new line · @ to mention
      </p>
      <VideoPicker
        open={pickVideo}
        onOpenChange={setPickVideo}
        videos={myVideos}
        onPick={(v) => setVideo(v)}
      />
    </div>
  )
}

function VideoPicker({
  open,
  onOpenChange,
  videos,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  videos: MyVideo[]
  onPick: (v: { id: string; title: string; share: boolean }) => void
}) {
  const [selected, setSelected] = useState<MyVideo | null>(null)
  const [share, setShare] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share a video</DialogTitle>
          <DialogDescription>
            Only people who can watch it see what&apos;s in it. Everyone else sees a locked card.
          </DialogDescription>
        </DialogHeader>
        <ul
          role="radiogroup"
          aria-label="Your videos"
          className="grid max-h-64 gap-1 overflow-y-auto"
        >
          {videos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected?.id === v.id}
                onClick={() => {
                  setSelected(v)
                  if (!v.isOwner) setShare(false)
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-callout",
                  selected?.id === v.id ? "bg-brand-soft text-brand-ink" : "hover:bg-raised"
                )}
              >
                <Video aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{v.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected?.isOwner && (
          <Label className="flex min-h-11 items-center gap-2 text-callout">
            <Checkbox checked={share} onCheckedChange={(v) => setShare(v === true)} />
            Let everyone in this conversation watch it
          </Label>
        )}
        <Button
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            onPick({ id: selected.id, title: selected.title, share })
            onOpenChange(false)
          }}
        >
          Add to message
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// ── Thread panel ────────────────────────────────────────────────────────────

function ThreadPanel({
  channelId,
  parentId,
  me,
  members,
  myVideos,
  version,
  onClose,
  onTyping,
}: {
  channelId: string
  parentId: string
  me: { id: string; name: string }
  members: Member[]
  myVideos: MyVideo[]
  version: number
  onClose: () => void
  onTyping: () => void
  slug: string
}) {
  const [items, setItems] = useState<ChatMessage[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    loadThreadAction(parentId)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [parentId, version, tick])

  return (
    <aside
      aria-label="Thread"
      className="flex min-h-0 w-full flex-col border-l border-border bg-surface lg:w-[400px]"
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back to the conversation"
          onClick={onClose}
          className="lg:hidden"
        >
          <ArrowLeft />
        </Button>
        <h2 className="flex-1 font-sans text-headline">Thread</h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close thread"
          onClick={onClose}
          className="max-lg:hidden"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {missing ? (
          <p className="text-callout text-fg-secondary">This thread isn&apos;t available.</p>
        ) : !items ? (
          <p className="text-callout text-fg-secondary" role="status">
            Loading…
          </p>
        ) : (
          <>
            <MessageList messages={items.slice(0, 1)} me={me} members={members} inThread />
            <p className="my-3 flex items-center gap-3 text-footnote text-fg-muted">
              <span className="h-px flex-1 bg-border" />
              {items.length - 1} {items.length - 1 === 1 ? "reply" : "replies"}
              <span className="h-px flex-1 bg-border" />
            </p>
            <MessageList messages={items.slice(1)} me={me} members={members} inThread />
          </>
        )}
      </div>
      {!missing && (
        <Composer
          channelId={channelId}
          parentId={parentId}
          members={members}
          myVideos={myVideos}
          onTyping={onTyping}
          onSent={() => setTick((t) => t + 1)}
          placeholder="Reply in thread"
        />
      )}
    </aside>
  )
}
