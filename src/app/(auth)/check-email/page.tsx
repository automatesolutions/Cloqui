import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Check your email" }

const copy = {
  confirm: {
    title: "Check your email",
    body: "We sent you a link to confirm your email. Open it on any device to finish.",
  },
  magic: {
    title: "Check your email",
    body: "If there's an account for that email, we sent a sign-in link. It works once and expires in 1 hour.",
  },
  reset: {
    title: "Check your email",
    body: "If there's an account for that email, we sent a link to choose a new password.",
  },
} as const

export default function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  return (
    <Suspense fallback={null}>
      <CheckEmailBody searchParams={searchParams} />
    </Suspense>
  )
}

async function CheckEmailBody({
  searchParams,
}: {
  searchParams: PageProps<"/check-email">["searchParams"]
}) {
  const sp = await searchParams
  const reason = sp.reason === "magic" || sp.reason === "reset" ? sp.reason : "confirm"
  const { title, body } = copy[reason]
  return (
    <div className="text-center">
      <span className="mx-auto mb-6 grid size-14 place-items-center rounded-lg bg-brand-soft text-brand-ink">
        <MailCheck aria-hidden className="size-7" strokeWidth={1.75} />
      </span>
      <h1 className="text-title-2 font-bold">{title}</h1>
      <p className="mt-3 text-callout text-fg-secondary" role="status">
        {body}
      </p>
      <p className="mt-2 text-footnote text-fg-muted">
        Can&apos;t find it? Check your spam folder.
      </p>
      <Button variant="ghost" asChild className="mt-8">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </div>
  )
}
