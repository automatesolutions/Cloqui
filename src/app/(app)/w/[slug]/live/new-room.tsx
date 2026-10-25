"use client"

import { useState, useTransition } from "react"
import { Radio } from "lucide-react"
import { createRoomAction } from "@/app/live/[id]/actions"
import { FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"

export function NewRoom({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const [title, setTitle] = useState("")
  const [emails, setEmails] = useState("")
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [workspaceVisible, setWorkspaceVisible] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Radio aria-hidden />
          New live room
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New live room</DialogTitle>
          <DialogDescription>Only the people you invite can join.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await createRoomAction(slug, {
                title,
                emails,
                waitingRoom,
                workspaceVisible,
              })
              if (r && !r.ok) setError(r.message)
            })
          }}
        >
          <FormMessage message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="room-title" className="text-footnote font-medium">
              Name
            </Label>
            <Input
              id="room-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly design review"
              maxLength={120}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="room-emails" className="text-footnote font-medium">
              Invite people
            </Label>
            <Textarea
              id="room-emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="maria@acme.co, sam@acme.co"
              className="min-h-20"
            />
            <p className="text-footnote text-fg-secondary">
              They get an email with a link that only works for them. You can invite more later.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="wr" className="text-callout font-medium">
                Waiting room
              </Label>
              <p id="wr-help" className="mt-1 text-footnote text-fg-secondary">
                You let each person in. Recommended.
              </p>
            </div>
            <Switch
              id="wr"
              checked={waitingRoom}
              onCheckedChange={setWaitingRoom}
              aria-describedby="wr-help"
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="wv" className="text-callout font-medium">
                Everyone in {workspaceName} can join
              </Label>
              <p id="wv-help" className="mt-1 text-footnote text-fg-secondary">
                Off: only the people you invite. Guests never get this.
              </p>
            </div>
            <Switch
              id="wv"
              checked={workspaceVisible}
              onCheckedChange={setWorkspaceVisible}
              aria-describedby="wv-help"
            />
          </div>
          <Button type="submit" loading={pending} disabled={!title.trim()}>
            Create and open room
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
