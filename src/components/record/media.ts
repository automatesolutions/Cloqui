// Browser media helpers for the recorder. Client-only.

export type Mode = "screen" | "camera" | "both"

export function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
  ]
  return (
    candidates.find(
      (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
    ) ?? ""
  )
}

export const canRecordScreen = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices &&
  "getDisplayMedia" in navigator.mediaDevices

export const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window

/** Mix any number of audio tracks into one (screen audio + microphone). */
export function mixAudio(streams: MediaStream[]): {
  track: MediaStreamTrack | null
  close: () => void
} {
  const withAudio = streams.filter((s) => s.getAudioTracks().length > 0)
  if (withAudio.length === 0) return { track: null, close: () => {} }
  if (withAudio.length === 1) return { track: withAudio[0].getAudioTracks()[0], close: () => {} }
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  for (const s of withAudio) ctx.createMediaStreamSource(s).connect(dest)
  return { track: dest.stream.getAudioTracks()[0], close: () => void ctx.close() }
}

export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop())
}

/** Turns browser media errors into calm, specific copy. */
export function mediaErrorMessage(e: unknown, what: "screen" | "camera" | "microphone"): string {
  const name = (e as DOMException)?.name
  if (name === "NotAllowedError" || name === "SecurityError") {
    return what === "screen"
      ? "Screen sharing was canceled. Choose a screen or window to record."
      : `Cloqui needs permission to use your ${what}. Allow it in your browser's address bar, then try again.`
  }
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return `We couldn't find a ${what}. Check it's connected.`
  if (name === "NotReadableError")
    return `Your ${what} is being used by another app. Close it and try again.`
  return `We couldn't start your ${what}. Try again.`
}

/** A floating, movable camera bubble. Uses Document Picture-in-Picture where available. */
export async function openCameraBubble(stream: MediaStream): Promise<(() => void) | null> {
  const dpip = (
    window as unknown as {
      documentPictureInPicture?: { requestWindow: (o: object) => Promise<Window> }
    }
  ).documentPictureInPicture
  if (dpip) {
    const win = await dpip.requestWindow({ width: 220, height: 220 })
    const doc = win.document
    doc.body.style.cssText =
      "margin:0;background:#0e1420;display:grid;place-items:center;height:100vh;overflow:hidden"
    const v = doc.createElement("video")
    v.autoplay = true
    v.muted = true
    v.playsInline = true
    v.srcObject = stream
    v.style.cssText =
      "width:200px;height:200px;border-radius:50%;object-fit:cover;transform:scaleX(-1)"
    doc.body.append(v)
    return () => win.close()
  }
  const v = document.createElement("video")
  v.muted = true
  v.playsInline = true
  v.srcObject = stream
  await v.play()
  if ("requestPictureInPicture" in v) {
    await v.requestPictureInPicture()
    return () => void document.exitPictureInPicture().catch(() => {})
  }
  return null
}

/** Upload with progress straight to the presigned URL. */
export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (p: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.send(body)
  })
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
