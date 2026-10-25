import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Monitor } from "lucide-react"
import { signOutEverywhereAction } from "@/app/(auth)/actions"
import { UserMenu } from "@/components/app/shell-menus"
import { Button } from "@/components/ui/button"
import { relativeDate } from "@/lib/format"
import { listMySessions } from "@/server/account"
import { requireUser } from "@/server/auth"
import { DeleteAccountSection, TwoFactorSection } from "./account-sections"

export const metadata: Metadata = { title: "Account and security" }

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  )
}

async function Body() {
  const user = await requireUser("/account")
  const sessions = await listMySessions(user)
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="container-page flex h-14 items-center justify-between">
        <Button variant="ghost" asChild className="-ml-2">
          <Link href="/home">
            <ArrowLeft aria-hidden />
            Back
          </Link>
        </Button>
        <UserMenu name={user.displayName} email={user.email} />
      </header>
      <main id="main" className="container-page grid max-w-3xl gap-10 pt-6 pb-16">
        <div>
          <h1 className="text-title-1 font-bold max-md:text-title-2">Account and security</h1>
          <p className="mt-2 text-callout text-fg-secondary">
            {user.displayName} · {user.email}
          </p>
        </div>

        <section aria-labelledby="tfa-h" className="grid gap-4 rounded-lg border border-border bg-surface p-5 md:p-6">
          <h2 id="tfa-h" className="text-title-3 font-medium">Two-step sign-in</h2>
          <TwoFactorSection enabled={user.hasTwoFactor} />
        </section>

        <section aria-labelledby="ses-h" className="grid gap-4 rounded-lg border border-border bg-surface p-5 md:p-6">
          <h2 id="ses-h" className="text-title-3 font-medium">Where you&apos;re signed in</h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Monitor aria-hidden className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout">{describeAgent(s.userAgent)}</span>
                  <span className="block text-footnote text-fg-secondary">
                    {s.ip ?? "Unknown location"} · last active {relativeDate(new Date(s.lastSeenAt ?? s.createdAt))}
                    {s.aal === "aal2" ? " · two-step" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <form action={signOutEverywhereAction}>
            <Button type="submit" variant="secondary">Sign out everywhere</Button>
          </form>
          <p className="text-footnote text-fg-secondary">
            Ends every session, including this one. Devices that are already open stop working within an hour at most.
          </p>
        </section>

        <section aria-labelledby="exp-h" className="grid gap-3 rounded-lg border border-border bg-surface p-5 md:p-6">
          <h2 id="exp-h" className="text-title-3 font-medium">Your data</h2>
          <p className="text-callout text-fg-secondary">
            Download everything you created: videos (details, not files), messages, comments and tasks. Nothing other people wrote.
          </p>
          <Button variant="secondary" asChild className="justify-self-start">
            <a href="/api/account/export" download>
              <Download aria-hidden />
              Download my data
            </a>
          </Button>
        </section>

        <section aria-labelledby="del-h" className="grid gap-3 rounded-lg border border-danger/30 bg-surface p-5 md:p-6">
          <h2 id="del-h" className="text-title-3 font-medium">Delete account</h2>
          <p className="text-callout text-fg-secondary">
            If you own a workspace with other people in it, delete it first, in its Security settings. Handing a workspace to someone else is coming later.
          </p>
          <DeleteAccountSection email={user.email} />
        </section>
      </main>
    </div>
  )
}
