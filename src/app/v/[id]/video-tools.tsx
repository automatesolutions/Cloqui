"use client"

import { useState, useTransition } from "react"
import { Download, ImageIcon, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { Textarea } from "@/components/ui/textarea"
import { FormMessage } from "@/components/forms/field"
import {
  deleteVideoAction,
  downloadAction,
  thumbnailAtAction,
  updateDetailsAction,
} from "./actions"
import { usePlayer } from "./player"

export function VideoDetails({
  videoId,
  title,
  description,
  canEdit,
  meta,
}: {
  videoId: string
  title: string
  description: string
  canEdit: boolean
  meta: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [t, setT] = useState(title)
  const [d, setD] = useState(description)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  if (editing) {
    return (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await updateDetailsAction(videoId, t, d)
            if (!res.ok) return setError(res.message)
            setError(undefined)
            setEditing(false)
          })
        }}
      >
        <FormMessage message={error} />
        <div className="grid gap-1.5">
          <Label htmlFor="v-title" className="text-footnote font-medium">
            Title
          </Label>
          <Input
            id="v-title"
            value={t}
            maxLength={120}
            onChange={(e) => setT(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-desc" className="text-footnote font-medium">
            Description
          </Label>
          <Textarea
            id="v-desc"
            value={d}
            maxLength={5000}
            onChange={(e) => setD(e.target.value)}
            placeholder="Add context for viewers"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setT(title)
              setD(description)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-title-2 font-bold max-md:text-title-3">{title}</h1>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit title and description"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )}
      </div>
      <div className="text-footnote text-fg-secondary">{meta}</div>
      {description && (
        <p className="mt-2 max-w-[70ch] text-callout break-words whitespace-pre-wrap">
          {description}
        </p>
      )}
    </div>
  )
}

export function VideoTools({
  videoId,
  slug,
  canEdit,
  isOwner,
  canDownload,
  title,
}: {
  videoId: string
  slug: string
  canEdit: boolean
  isOwner: boolean
  canDownload: boolean
  title: string
}) {
  const player = usePlayer()
  const [pending, start] = useTransition()

  // The server cuts the frame from the private file, so no CORS on the bucket is needed.
  function useFrame() {
    const at = player?.currentMs() ?? 0
    start(async () => {
      const res = await thumbnailAtAction(videoId, at)
      if (res.ok) toast.success(res.message ?? "Saved.")
      else toast.error(res.message)
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (
        <Button variant="secondary" onClick={useFrame} loading={pending}>
          <ImageIcon aria-hidden />
          Use this frame as thumbnail
        </Button>
      )}
      {canDownload && (
        <Button
          variant="secondary"
          onClick={() =>
            start(async () => {
              const res = await downloadAction(videoId)
              if (res.ok && res.url) window.location.assign(res.url)
              else toast.error(res.message ?? "That didn't work.")
            })
          }
        >
          <Download aria-hidden />
          Download
        </Button>
      )}
      {isOwner && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 aria-hidden />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone loses access right away, and the video and its comments are removed. This
                can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary">Keep video</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="danger"
                  onClick={() =>
                    start(async () => {
                      const res = await deleteVideoAction(videoId, slug)
                      if (res && !res.ok) toast.error(res.message)
                    })
                  }
                >
                  Delete video
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
