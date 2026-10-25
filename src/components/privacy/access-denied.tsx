import Link from "next/link"
import { Button } from "@/components/ui/button"

export function ClosedDoorArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 88h80" stroke="var(--text-muted)" />
      <rect x="38" y="12" width="44" height="76" rx="4" stroke="var(--text-secondary)" />
      <path d="M44 18h32v64H44z" stroke="var(--border-strong)" />
      <circle cx="70" cy="52" r="2.5" stroke="var(--accent)" />
      <path d="M70 55v4" stroke="var(--accent)" />
    </svg>
  )
}

/**
 * Calm access-denied screen. Never red, never "403".
 * `requestAction` is a server action that records an access request.
 */
export function AccessDenied({
  ownerName,
  body,
  requestAction,
  requested = false,
}: {
  ownerName?: string
  /** Overrides the "Only people … invited can open it." line. */
  body?: string
  requestAction?: () => Promise<void>
  requested?: boolean
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <ClosedDoorArt className="mb-5 h-24 w-30" />
      <h1 className="text-title-3 font-medium">You don&apos;t have access to this</h1>
      <p className="mt-2 text-callout text-fg-secondary">
        {body ??
          (ownerName
            ? `Only people ${ownerName} invited can open it.`
            : "Only invited people can open it.")}
      </p>
      <div className="mt-6 flex w-full max-w-[260px] flex-col gap-2">
        {requested ? (
          <p role="status" className="text-callout text-fg-secondary">
            Request sent. {ownerName ?? "The owner"} will get a notification.
          </p>
        ) : (
          requestAction && (
            <form action={requestAction}>
              <Button type="submit" className="w-full">
                Request access
              </Button>
            </form>
          )
        )}
        <Button variant="ghost" asChild>
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </div>
  )
}
