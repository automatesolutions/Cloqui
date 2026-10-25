"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useParticipants,
} from "@livekit/components-react"
import "@livekit/components-styles"
import { DisconnectReason } from "livekit-client"
import {
  Camera,
  CameraOff,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  Settings2,
  UserPlus,
  Users,
  VolumeX,
} from "lucide-react"
import { toast } from "sonner"
import { initials } from "@/components/app/initials"
import { FormMessage } from "@/components/forms/field"
import { AccessChip } from "@/components/privacy/access-chip"
import { ClosedDoorArt } from "@/components/privacy/access-denied"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import type { JoinResult } from "@/server/live"
import {
  decideAction,
  endAction,
  heartbeatAction,
  inviteAction,
  joinAction,
  lockAction,
  muteAllAction,
  removeAction,
  waitingAction,
} from "./actions"

type Phase =
  | { kind: "lobby" }
  | { kind: "joining" }
  | { kind: "waiting" }
  | { kind: "in"; token: string; url: string }
  | { kind: "stopped"; title: string; body: string }

const stopCopy: Record<string, { title: string; body: string }> = {
  denied: { title: "The host didn't let you in", body: "You can ask them to invite you again." },
  removed: { title: "The host removed you from this room", body: "You can't rejoin this room." },
  locked: { title: "This room is locked", body: "Ask the host to unlock it, then try again." },
  no_access: {
    title: "You don't have access to this",
    body: "Only people the host invited can join.",
  },
  ended: { title: "The room has ended", body: "Thanks for joining." },
  left: { title: "You left the room", body: "You can rejoin while it's open." },
}

export function LiveRoom({
  roomId,
  title,
  hostName,
  isManager,
  isHost,
  locked: initialLocked,
  audience,
  backHref,
}: {
  roomId: string
  title: string
  hostName: string
  isManager: boolean
  isHost: boolean
  locked: boolean
  audience: { label: string; scope: "private" | "workspace"; people: boolean }
  backHref: string
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "lobby" })
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)

  const handle = useCallback((r: JoinResult) => {
    if (r.status === "admitted") setPhase({ kind: "in", token: r.token, url: r.url })
    else if (r.status === "waiting") setPhase({ kind: "waiting" })
    else setPhase({ kind: "stopped", ...stopCopy[r.status] })
  }, [])

  // While waiting, check every few seconds whether the host let us in.
  useEffect(() => {
    if (phase.kind !== "waiting") return
    const t = setInterval(async () => handle(await joinAction(roomId)), 2500)
    return () => clearInterval(t)
  }, [phase.kind, roomId, handle])

  // Keep "Live now" accurate while connected.
  useEffect(() => {
    if (phase.kind !== "in") return
    const t = setInterval(() => void heartbeatAction(roomId), 60_000)
    return () => clearInterval(t)
  }, [phase.kind, roomId])

  async function join() {
    setPhase({ kind: "joining" })
    try {
      handle(await joinAction(roomId))
    } catch {
      setPhase({ kind: "lobby" })
      toast.error("We couldn't reach the room. Try again.")
    }
  }

  if (phase.kind === "in") {
    return (
      <div className="cloqui-lk flex h-[calc(100dvh-3.5rem)] flex-col" data-lk-theme="default">
        <LiveKitRoom
          token={phase.token}
          serverUrl={phase.url}
          connect
          video={camOn}
          audio={micOn}
          onDisconnected={(reason) => {
            const key =
              reason === DisconnectReason.PARTICIPANT_REMOVED
                ? "removed"
                : reason === DisconnectReason.ROOM_DELETED
                  ? "ended"
                  : "left"
            setPhase({ kind: "stopped", ...stopCopy[key] })
          }}
          onError={() => toast.error("The connection dropped. We'll keep trying.")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <RoomBar
            roomId={roomId}
            title={title}
            audience={audience}
            isManager={isManager}
            isHost={isHost}
            initialLocked={initialLocked}
          />
          <div className="min-h-0 flex-1">
            <VideoConference />
          </div>
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        {phase.kind === "stopped" ? (
          <>
            <ClosedDoorArt className="mx-auto mb-5 h-24 w-30" />
            <h1 className="text-title-2 font-bold">{phase.title}</h1>
            <p className="mt-2 text-callout text-fg-secondary">{phase.body}</p>
            <div className="mt-6 flex flex-col gap-2">
              {phase.title === stopCopy.left.title && <Button onClick={join}>Rejoin</Button>}
              <Button variant="ghost" asChild>
                <Link href={backHref}>Go back</Link>
              </Button>
            </div>
          </>
        ) : phase.kind === "waiting" ? (
          <div role="status" aria-live="polite">
            <span
              aria-hidden
              className="mx-auto mb-6 block size-3 animate-calm-pulse rounded-full bg-brand"
            />
            <h1 className="text-title-2 font-bold">Waiting for {hostName} to let you in</h1>
            <p className="mt-2 text-callout text-fg-secondary">
              This room has a waiting room. Keep this page open.
            </p>
            <Button variant="ghost" className="mt-6" onClick={() => setPhase({ kind: "lobby" })}>
              Leave the waiting room
            </Button>
          </div>
        ) : (
          <>
            <p className="inline-flex items-center gap-2">
              <AccessChip label={audience.label} scope={audience.scope} people={audience.people} />
            </p>
            <h1 className="mt-4 text-title-1 font-bold max-md:text-title-2">{title}</h1>
            <p className="mt-2 text-callout text-fg-secondary">
              Hosted by {hostName}. Only invited people can join.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button
                variant={camOn ? "secondary" : "ghost"}
                aria-pressed={camOn}
                onClick={() => setCamOn((v) => !v)}
              >
                {camOn ? <Camera aria-hidden /> : <CameraOff aria-hidden />}
                {camOn ? "Camera on" : "Camera off"}
              </Button>
              <Button
                variant={micOn ? "secondary" : "ghost"}
                aria-pressed={micOn}
                onClick={() => setMicOn((v) => !v)}
              >
                {micOn ? <Mic aria-hidden /> : <MicOff aria-hidden />}
                {micOn ? "Mic on" : "Mic off"}
              </Button>
            </div>
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={join}
              loading={phase.kind === "joining"}
            >
              Join room
            </Button>
            <p className="mt-4 text-footnote text-fg-muted">
              Encrypted in transit. Recording live rooms is coming later.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function RoomBar({
  roomId,
  title,
  audience,
  isManager,
  isHost,
  initialLocked,
}: {
  roomId: string
  title: string
  audience: { label: string; scope: "private" | "workspace"; people: boolean }
  isManager: boolean
  isHost: boolean
  initialLocked: boolean
}) {
  const participants = useParticipants()
  const [waiting, setWaiting] = useState<{ userId: string; name: string; email: string }[]>([])

  useEffect(() => {
    if (!isManager) return
    let alive = true
    const tick = async () => {
      const w = await waitingAction(roomId)
      if (alive) setWaiting(w)
    }
    void tick()
    const t = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [isManager, roomId])

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <span
        role="status"
        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-raised px-3 py-1 text-footnote font-medium"
      >
        <span aria-hidden className="size-2 animate-calm-pulse rounded-full bg-danger" />
        Live · <span className="tnum">{participants.length}</span>{" "}
        {participants.length === 1 ? "person" : "people"}
      </span>
      <h1 className="min-w-0 flex-1 truncate text-callout font-semibold">{title}</h1>
      <AccessChip
        label={audience.label}
        scope={audience.scope}
        people={audience.people}
        className="max-sm:hidden"
      />
      {isManager && (
        <HostControls
          roomId={roomId}
          isHost={isHost}
          initialLocked={initialLocked}
          waiting={waiting}
          setWaiting={setWaiting}
        />
      )}
    </div>
  )
}

function HostControls({
  roomId,
  isHost,
  initialLocked,
  waiting,
  setWaiting,
}: {
  roomId: string
  isHost: boolean
  initialLocked: boolean
  waiting: { userId: string; name: string; email: string }[]
  setWaiting: (w: { userId: string; name: string; email: string }[]) => void
}) {
  const participants = useParticipants()
  const [locked, setLocked] = useState(initialLocked)
  const [pending, start] = useTransition()
  const [emails, setEmails] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>({ ok: true })

  const others = participants.filter((p) => !p.isLocal)
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="secondary">
          <Settings2 aria-hidden />
          Host controls
          {waiting.length > 0 && (
            <span className="rounded-full bg-attention-soft px-2 text-caption font-semibold text-attention tnum">
              {waiting.length}
              <span className="sr-only"> waiting</span>
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>Host controls</SheetTitle>
          <SheetDescription>Only hosts see this.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-8 p-5">
          <section aria-labelledby="wait-h" className="grid gap-3">
            <h3 id="wait-h" className="text-headline">
              Waiting room
            </h3>
            {waiting.length === 0 ? (
              <p className="text-callout text-fg-secondary">Nobody is waiting.</p>
            ) : (
              <ul className="grid gap-2">
                {waiting.map((w) => (
                  <li
                    key={w.userId}
                    className="grid gap-3 rounded-lg border border-attention/40 bg-attention-soft p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-callout font-medium">{w.name}</p>
                      <p className="truncate text-footnote text-fg-secondary">{w.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await decideAction(roomId, w.userId, true)
                            if (r.ok) setWaiting(waiting.filter((x) => x.userId !== w.userId))
                            else toast.error(r.message)
                          })
                        }
                      >
                        Let in
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await decideAction(roomId, w.userId, false)
                            if (r.ok) setWaiting(waiting.filter((x) => x.userId !== w.userId))
                            else toast.error(r.message)
                          })
                        }
                      >
                        Don&apos;t let in
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="in-h" className="grid gap-3">
            <h3 id="in-h" className="flex items-center gap-2 text-headline">
              <Users aria-hidden className="size-5" strokeWidth={1.75} />
              In the room
            </h3>
            {others.length === 0 ? (
              <p className="text-callout text-fg-secondary">It&apos;s just you so far.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {others.map((p) => (
                  <li key={p.identity} className="flex items-center gap-3 px-3 py-2">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
                    >
                      {initials(p.name || "?")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-callout">
                      {p.name || "Someone"}
                    </span>
                    <RemoveButton
                      roomId={roomId}
                      identity={p.identity}
                      name={p.name || "this person"}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="secondary"
              disabled={pending || others.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await muteAllAction(roomId)
                  if (r.ok) toast.success(r.message ?? "Done.")
                  else toast.error(r.message)
                })
              }
            >
              <VolumeX aria-hidden />
              Mute everyone else
            </Button>
          </section>

          <section aria-labelledby="room-h" className="grid gap-5">
            <h3 id="room-h" className="text-headline">
              Room
            </h3>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="lock" className="flex items-center gap-2 text-callout font-medium">
                  {locked ? (
                    <Lock aria-hidden className="size-4" />
                  ) : (
                    <LockOpen aria-hidden className="size-4" />
                  )}
                  Lock the room
                </Label>
                <p id="lock-help" className="mt-1 text-footnote text-fg-secondary">
                  Nobody new can join or wait. People already here stay.
                </p>
              </div>
              <Switch
                id="lock"
                checked={locked}
                aria-describedby="lock-help"
                disabled={pending}
                onCheckedChange={(v) =>
                  start(async () => {
                    setLocked(v)
                    const r = await lockAction(roomId, v)
                    if (!r.ok) {
                      setLocked(!v)
                      toast.error(r.message)
                    } else toast.success(r.message ?? "Saved.")
                  })
                }
              />
            </div>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                start(async () => {
                  const r = await inviteAction(roomId, emails)
                  setMsg({ ok: r.ok, text: r.message })
                  if (r.ok) setEmails("")
                })
              }}
            >
              {msg.text && <FormMessage message={msg.text} tone={msg.ok ? "info" : "error"} />}
              <Label htmlFor="room-invite" className="text-callout font-medium">
                Invite people
              </Label>
              <div className="flex gap-2">
                <Input
                  id="room-invite"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="maria@acme.co"
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={pending || !emails.trim()}>
                  <UserPlus aria-hidden />
                  Invite
                </Button>
              </div>
            </form>
            <p className="text-footnote text-fg-secondary">Recording live rooms is coming later.</p>
            {isHost && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">End the room for everyone</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End the room for everyone?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Everyone is disconnected right away, and the link stops working.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                      <Button variant="secondary">Keep it open</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="danger"
                        onClick={() =>
                          start(async () => {
                            const r = await endAction(roomId)
                            if (!r.ok) toast.error(r.message)
                          })
                        }
                      >
                        End room
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RemoveButton({
  roomId,
  identity,
  name,
}: {
  roomId: string
  identity: string
  name: string
}) {
  const [pending, start] = useTransition()
  const first = name.split(" ")[0]
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {first} from the room?</AlertDialogTitle>
          <AlertDialogDescription>
            {first} will be disconnected right away and can&apos;t rejoin this room.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Keep {first}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeAction(roomId, identity)
                  if (r.ok) toast.success(`${first} was removed.`)
                  else toast.error(r.message)
                })
              }
            >
              Remove from room
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
