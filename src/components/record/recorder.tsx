"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  CircleDot,
  Mic,
  MicOff,
  Monitor,
  MonitorPlay,
  Pause,
  Play,
  Square,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { finishUploadAction, startUploadAction } from "@/app/(app)/w/[slug]/record/actions"
import { FormMessage } from "@/components/forms/field"
import { AccessChip } from "@/components/privacy/access-chip"
import { RecordingPill } from "@/components/privacy/recording-pill"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Countdown } from "./countdown"
import {
  canRecord,
  canRecordScreen,
  formatTime,
  mediaErrorMessage,
  mixAudio,
  openCameraBubble,
  pickMimeType,
  putWithProgress,
  stopStream,
  type Mode,
} from "./media"

type Phase = "setup" | "countdown" | "recording" | "review" | "saving"
const MAX_MS = 30 * 60 * 1000

const modes: { value: Mode; label: string; icon: typeof Monitor; help: string }[] = [
  {
    value: "screen",
    label: "Screen",
    icon: Monitor,
    help: "A screen, window or tab, with your voice.",
  },
  { value: "camera", label: "Camera", icon: Camera, help: "Just you, on camera." },
  {
    value: "both",
    label: "Screen + camera",
    icon: MonitorPlay,
    help: "Your screen with a camera bubble you can move.",
  },
]

export function Recorder({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("setup")
  const [mode, setMode] = useState<Mode>("screen")
  const [micOn, setMicOn] = useState(true)
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({
    cams: [],
    mics: [],
  })
  const [camId, setCamId] = useState<string>("")
  const [micId, setMicId] = useState<string>("")
  const [error, setError] = useState<string>()
  const [supported, setSupported] = useState({ record: true, screen: true })
  const [bubbleOpen, setBubbleOpen] = useState(false)

  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{
    blob: Blob
    url: string
    type: string
    durationMs: number
  }>()
  const [title, setTitle] = useState("")
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  const [progress, setProgress] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const previewRef = useRef<HTMLVideoElement>(null)
  const reviewRef = useRef<HTMLVideoElement>(null)
  const camStream = useRef<MediaStream | null>(null)
  const streams = useRef<MediaStream[]>([])
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const closeBubble = useRef<(() => void) | null>(null)
  const closeAudio = useRef<() => void>(() => {})
  const clock = useRef({ startedAt: 0, pausedTotal: 0, pausedAt: 0 })

  // ── Capability check and devices ──
  useEffect(() => {
    const record = canRecord()
    const screen = canRecordScreen()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capabilities are only known on the client
    setSupported({ record, screen })
    if (!screen) setMode("camera")
    setTitle(
      `Recording ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}`
    )
  }, [])

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices?.enumerateDevices?.()
    if (!list) return
    const cams = list.filter((d) => d.kind === "videoinput")
    const mics = list.filter((d) => d.kind === "audioinput")
    setDevices({ cams, mics })
    setCamId((c) => c || cams[0]?.deviceId || "")
    setMicId((m) => m || mics[0]?.deviceId || "")
  }, [])

  // ── Camera preview ──
  // Lives as long as a camera mode is selected, not just during setup: it keeps the preview
  // visible while recording and feeds the floating bubble in "Screen + camera".
  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewRef.current = el
    if (el && camStream.current && el.srcObject !== camStream.current)
      el.srcObject = camStream.current
  }, [])

  useEffect(() => {
    if (mode === "screen") {
      stopStream(camStream.current)
      camStream.current = null
      return
    }
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: camId ? { exact: camId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) return stopStream(s)
        stopStream(camStream.current)
        camStream.current = s
        if (previewRef.current) previewRef.current.srcObject = s
        setError(undefined)
        await refreshDevices()
      })
      .catch((e) => !cancelled && setError(mediaErrorMessage(e, "camera")))
    return () => {
      cancelled = true
    }
  }, [mode, camId, refreshDevices])

  // ── Elapsed clock ──
  useEffect(() => {
    if (phase !== "recording") return
    const t = setInterval(() => {
      const c = clock.current
      const now = performance.now()
      const ms = now - c.startedAt - c.pausedTotal - (c.pausedAt ? now - c.pausedAt : 0)
      setElapsed(ms)
      if (ms >= MAX_MS) stop()
    }, 250)
    return () => clearInterval(t)
  }, [phase])

  // ── Clean up everything on leave ──
  useEffect(
    () => () => {
      streams.current.forEach(stopStream)
      stopStream(camStream.current)
      closeBubble.current?.()
      closeAudio.current()
    },
    []
  )

  async function popOutBubble() {
    if (!camStream.current) return
    try {
      closeBubble.current = await openCameraBubble(camStream.current)
      setBubbleOpen(!!closeBubble.current)
    } catch {
      toast.error("Your browser didn't open the camera bubble. Your screen will still be recorded.")
    }
  }

  async function begin() {
    setError(undefined)
    const acquired: MediaStream[] = []
    try {
      let video: MediaStreamTrack
      if (mode === "camera") {
        // Reuse the preview's camera: many webcams can't be opened twice at once.
        const previewTrack = camStream.current?.getVideoTracks()[0]
        const cam = previewTrack
          ? new MediaStream([previewTrack.clone()])
          : await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: camId ? { exact: camId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            })
        acquired.push(cam)
        video = cam.getVideoTracks()[0]
      } else {
        let screen: MediaStream
        try {
          screen = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 30 },
            audio: true,
          })
        } catch (e) {
          throw Object.assign(new Error(mediaErrorMessage(e, "screen")), { friendly: true })
        }
        acquired.push(screen)
        video = screen.getVideoTracks()[0]
        // Clicking the browser's "Stop sharing" ends the recording cleanly.
        video.addEventListener("ended", () => recorder.current?.state !== "inactive" && stop())
      }
      if (micOn) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: micId ? { exact: micId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
          acquired.push(mic)
        } catch (e) {
          toast.error(mediaErrorMessage(e, "microphone"))
        }
      }
      const audio = mixAudio(acquired)
      closeAudio.current = audio.close
      const tracks = [video, ...(audio.track ? [audio.track] : [])]
      streams.current = acquired
      const type = pickMimeType()
      const rec = new MediaRecorder(
        new MediaStream(tracks),
        type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : undefined
      )
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
      rec.onstop = finish
      recorder.current = rec
      setPhase("countdown")
    } catch (e) {
      acquired.forEach(stopStream)
      const err = e as Error & { friendly?: boolean }
      setError(
        err.friendly ? err.message : mediaErrorMessage(e, mode === "camera" ? "camera" : "screen")
      )
    }
  }

  function startRecording() {
    const rec = recorder.current
    if (!rec) return
    clock.current = { startedAt: performance.now(), pausedTotal: 0, pausedAt: 0 }
    rec.start(1000)
    setElapsed(0)
    setPaused(false)
    setPhase("recording")
  }

  function togglePause() {
    const rec = recorder.current
    if (!rec) return
    const c = clock.current
    if (rec.state === "recording") {
      rec.pause()
      c.pausedAt = performance.now()
      setPaused(true)
    } else if (rec.state === "paused") {
      rec.resume()
      c.pausedTotal += performance.now() - c.pausedAt
      c.pausedAt = 0
      setPaused(false)
    }
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop()
  }

  function finish() {
    const c = clock.current
    const now = performance.now()
    const durationMs = Math.round(
      now - c.startedAt - c.pausedTotal - (c.pausedAt ? now - c.pausedAt : 0)
    )
    const type = recorder.current?.mimeType || "video/webm"
    const blob = new Blob(chunks.current, { type })
    streams.current.forEach(stopStream)
    streams.current = []
    closeBubble.current?.()
    closeBubble.current = null
    setBubbleOpen(false)
    closeAudio.current()
    setResult({ blob, url: URL.createObjectURL(blob), type, durationMs })
    setTrim({ start: 0, end: durationMs })
    setPhase("review")
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) {
      setError("Choose an MP4, WebM or MOV video.")
      return
    }
    const url = URL.createObjectURL(file)
    setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled video")
    setResult({ blob: file, url, type: file.type, durationMs: 0 })
    setTrim({ start: 0, end: 0 })
    setPhase("review")
  }

  function discard() {
    if (result) URL.revokeObjectURL(result.url)
    setResult(undefined)
    setConfirmDiscard(false)
    setPhase("setup")
  }

  async function save() {
    if (!result) return
    if (!title.trim()) {
      setError("Add a title.")
      return
    }
    setError(undefined)
    setPhase("saving")
    setProgress(0)
    const total = result.durationMs || Math.round((reviewRef.current?.duration || 0) * 1000)
    const trimmed = total > 0 && (trim.start > 0 || (trim.end > 0 && trim.end < total - 250))
    const start = await startUploadAction(slug, {
      title: title.trim(),
      mimeType: result.type,
      sizeBytes: result.blob.size,
      durationMs: total || undefined,
      trimStartMs: trimmed && trim.start > 0 ? Math.round(trim.start) : undefined,
      trimEndMs: trimmed && trim.end > 0 && trim.end < total ? Math.round(trim.end) : undefined,
    })
    if (!start.ok) {
      setError(start.message)
      setPhase("review")
      return
    }
    try {
      await putWithProgress(start.uploadUrl, result.blob, start.contentType, setProgress)
    } catch {
      setError("The upload stopped. Check your connection, then save again.")
      setPhase("review")
      return
    }
    const done = await finishUploadAction(start.videoId)
    if (!done.ok) {
      setError(done.message)
      setPhase("review")
      return
    }
    URL.revokeObjectURL(result.url)
    router.push(`/v/${start.videoId}`)
  }

  // ── Render ──
  if (!supported.record) {
    return (
      <FormMessage message="Recording isn't available in this browser. You can still upload a video you already have." />
    )
  }

  return (
    <div className="grid gap-6">
      {phase === "countdown" && <Countdown onDone={startRecording} />}

      {phase === "recording" && (
        <div className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
          <RecordingPill elapsedSeconds={elapsed / 1000} paused={paused}>
            <Button size="sm" variant="secondary" onClick={togglePause} className="rounded-full">
              {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button size="sm" variant="danger" onClick={stop} className="rounded-full">
              <Square aria-hidden />
              Stop
            </Button>
          </RecordingPill>
        </div>
      )}

      <FormMessage message={error} />

      {(phase === "setup" || phase === "countdown" || phase === "recording") && (
        <>
          <fieldset disabled={phase !== "setup"} className="grid gap-3">
            <legend className="mb-3 text-headline">What do you want to record?</legend>
            <div
              role="radiogroup"
              aria-label="What to record"
              className="grid gap-3 sm:grid-cols-3"
            >
              {modes.map((m) => {
                const disabled = m.value !== "camera" && !supported.screen
                const active = mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "flex min-h-11 flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors duration-150 disabled:opacity-45",
                      active
                        ? "border-brand bg-brand-soft"
                        : "border-border-strong bg-surface hover:bg-raised"
                    )}
                  >
                    <m.icon
                      aria-hidden
                      className={cn("size-6", active ? "text-brand-ink" : "text-fg-secondary")}
                      strokeWidth={1.75}
                    />
                    <span className={cn("text-callout font-medium", active && "text-brand-ink")}>
                      {m.label}
                    </span>
                    <span className="text-footnote text-fg-secondary">
                      {disabled ? "Screen recording isn't available in this browser." : m.help}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg border border-border bg-raised">
              {mode === "screen" ? (
                <div className="flex flex-col items-center gap-2 px-6 text-center text-fg-secondary">
                  <Monitor aria-hidden className="size-10" strokeWidth={1.5} />
                  <p className="text-callout">
                    You&apos;ll choose a screen, window or tab after you press Start.
                  </p>
                </div>
              ) : (
                <video
                  ref={attachPreview}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Camera preview"
                  className={cn(
                    "-scale-x-100 object-cover",
                    mode === "both"
                      ? "size-40 rounded-full border-4 border-surface shadow-lg"
                      : "size-full"
                  )}
                />
              )}
              {mode === "both" && (
                <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="rounded-sm bg-[rgb(14_20_32/.78)] px-2 py-1 text-footnote text-[#e8edf5]">
                    {bubbleOpen
                      ? "Camera bubble is open. Drag it where you like."
                      : "Share your whole screen to include the bubble."}
                  </p>
                  {!bubbleOpen && phase === "setup" && (
                    <Button size="sm" variant="secondary" onClick={popOutBubble}>
                      Pop out camera bubble
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="grid content-start gap-5">
              {mode !== "screen" && devices.cams.length > 1 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="cam" className="text-footnote font-medium">
                    Camera
                  </Label>
                  <Select value={camId} onValueChange={setCamId} disabled={phase !== "setup"}>
                    <SelectTrigger id="cam" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.cams.map((d, i) => (
                        <SelectItem key={d.deviceId || i} value={d.deviceId || `cam-${i}`}>
                          {d.label || `Camera ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mic-switch" className="flex items-center gap-2 text-callout">
                  {micOn ? (
                    <Mic aria-hidden className="size-5" strokeWidth={1.75} />
                  ) : (
                    <MicOff aria-hidden className="size-5" strokeWidth={1.75} />
                  )}
                  Microphone
                </Label>
                <Switch
                  id="mic-switch"
                  checked={micOn}
                  onCheckedChange={setMicOn}
                  disabled={phase !== "setup"}
                />
              </div>
              {micOn && devices.mics.length > 1 && (
                <Select value={micId} onValueChange={setMicId} disabled={phase !== "setup"}>
                  <SelectTrigger aria-label="Microphone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.mics.map((d, i) => (
                      <SelectItem key={d.deviceId || i} value={d.deviceId || `mic-${i}`}>
                        {d.label || `Microphone ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <AccessChip label="Only you, until you share it" />
              {phase === "setup" ? (
                <Button size="lg" onClick={begin} className="w-full">
                  <CircleDot aria-hidden />
                  Start recording
                </Button>
              ) : (
                <p className="text-callout text-fg-secondary" role="status">
                  {phase === "countdown"
                    ? "Get ready…"
                    : "Recording. Use the bar at the top to pause or stop."}
                </p>
              )}
              {phase === "setup" && (
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md text-callout font-medium text-fg-secondary focus-within:outline-2 focus-within:outline-brand hover:bg-raised hover:text-fg">
                  <Upload aria-hidden className="size-5" strokeWidth={1.75} />
                  Upload a video instead
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>
        </>
      )}

      {(phase === "review" || phase === "saving") && result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3">
            <video
              ref={reviewRef}
              src={result.url}
              controls
              playsInline
              className="aspect-video w-full rounded-lg border border-border bg-black"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration
                if (Number.isFinite(d) && d > 0 && !result.durationMs) {
                  setResult({ ...result, durationMs: Math.round(d * 1000) })
                  setTrim({ start: 0, end: Math.round(d * 1000) })
                }
              }}
            />
            {result.durationMs > 1000 && (
              <fieldset
                disabled={phase === "saving"}
                className="grid gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <legend className="px-1 text-footnote font-medium">Trim</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TrimSlider
                    label="Start"
                    value={trim.start}
                    max={result.durationMs}
                    onChange={(v) => setTrim((t) => ({ ...t, start: Math.min(v, t.end - 500) }))}
                    onSeek={(v) => reviewRef.current && (reviewRef.current.currentTime = v / 1000)}
                  />
                  <TrimSlider
                    label="End"
                    value={trim.end}
                    max={result.durationMs}
                    onChange={(v) => setTrim((t) => ({ ...t, end: Math.max(v, t.start + 500) }))}
                    onSeek={(v) => reviewRef.current && (reviewRef.current.currentTime = v / 1000)}
                  />
                </div>
                <p className="text-footnote text-fg-secondary">
                  Keeps {formatTime(trim.end - trim.start)} of {formatTime(result.durationMs)}. The
                  original is kept, so you can change this later.
                </p>
              </fieldset>
            )}
          </div>
          <div className="grid content-start gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="title" className="text-footnote font-medium">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                disabled={phase === "saving"}
              />
            </div>
            <AccessChip label="Only you, until you share it" />
            {phase === "saving" ? (
              <div className="grid gap-2" role="status" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="text-footnote text-fg-secondary tnum">
                  Uploading privately… {Math.round(progress * 100)}%
                </p>
              </div>
            ) : (
              <>
                <Button size="lg" onClick={save} className="w-full">
                  Save video
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDiscard(true)} className="w-full">
                  Discard
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              It hasn&apos;t been saved, so it will be gone for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep it</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={discard}>
                Discard
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <span className="sr-only">Saving to {workspaceName}</span>
    </div>
  )
}

function TrimSlider({
  label,
  value,
  max,
  onChange,
  onSeek,
}: {
  label: string
  value: number
  max: number
  onChange: (v: number) => void
  onSeek: (v: number) => void
}) {
  const id = `trim-${label.toLowerCase()}`
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-footnote font-medium">
          {label}
        </Label>
        <span className="text-footnote text-fg-secondary tnum">{formatTime(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={100}
        value={value}
        aria-valuetext={formatTime(value)}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(v)
          onSeek(v)
        }}
        className="h-11 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  )
}
