import { Lock } from "lucide-react"

/** Title + one-line reassurance for every auth screen. */
export function AuthHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-title-1 font-bold max-md:text-title-2">{title}</h1>
      {body && <p className="mt-2 text-callout text-fg-secondary">{body}</p>}
    </div>
  )
}

export function PrivateNote() {
  return (
    <p className="mt-8 flex items-center gap-2 text-footnote text-fg-muted">
      <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
      Encrypted in transit and at rest. Nothing in Cloqui is public.
    </p>
  )
}

export function AuthFormSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="h-[70px] rounded-md bg-raised" />
      <div className="h-[70px] rounded-md bg-raised" />
      <div className="h-11 rounded-md bg-raised" />
    </div>
  )
}
