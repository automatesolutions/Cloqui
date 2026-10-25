import type { Metadata } from "next"
import { MessageSquare } from "lucide-react"

export const metadata: Metadata = { title: "Chat" }

// Desktop only: on phones the conversation list is the chat home.
export default function ChatHome() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 max-lg:hidden">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-lg bg-raised text-fg-secondary">
          <MessageSquare aria-hidden className="size-6" strokeWidth={1.75} />
        </span>
        <h1 className="text-title-3 font-medium">Pick a conversation</h1>
        <p className="mt-1 text-callout text-fg-secondary">
          Private channels and direct messages are only visible to the people in them.
        </p>
      </div>
    </div>
  )
}
