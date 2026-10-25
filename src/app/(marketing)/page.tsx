import type { Metadata } from "next"
import Link from "next/link"
import {
  CircleDot,
  Eye,
  Hash,
  ListChecks,
  Lock,
  MessageSquare,
  ShieldCheck,
  UserPlus,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { AccessChip } from "@/components/privacy/access-chip"
import { RecordingPill } from "@/components/privacy/recording-pill"
import { HeroReveal } from "@/components/motion/hero-reveal"

export const metadata: Metadata = {
  title: { absolute: "Cloqui · Video, chat, and tasks behind a closed door" },
  description:
    "Record your screen, talk it through, and track the work. Only people you invite can see any of it.",
  robots: { index: true, follow: true },
}

export default function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-3 text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <HowSharingWorks />
        <Features />
        <Honesty />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/88 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="container-page flex h-14 items-center justify-between">
        <Link
          href="/"
          aria-label="Cloqui home"
          className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
        >
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Button variant="ghost" asChild className="max-sm:hidden">
            <Link href="#sharing">How sharing works</Link>
          </Button>
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="max-sm:hidden">
            <Link href="/sign-up">Start free</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_60%_at_50%_30%,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_70%)]"
      />
      <HeroReveal className="relative container-page flex flex-col items-center pt-16 pb-12 text-center md:pt-24">
        <div data-reveal>
          <AccessChip label="Invite-only" />
        </div>
        <h1
          data-reveal
          className="mt-5 max-w-[14ch] text-[2.5rem] leading-[2.75rem] font-bold tracking-[-0.02em] md:text-display"
        >
          Video, chat, and tasks behind a closed door.
        </h1>
        <p data-reveal className="mt-5 max-w-[34rem] text-body-lg text-fg-secondary">
          Record your screen, talk it through, and track the work. Only people you invite can see
          any of it.
        </p>
        <div data-reveal className="mt-8 flex flex-wrap justify-center gap-2">
          <Button size="lg" asChild>
            <Link href="/sign-up">Start free</Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link href="#sharing">See how sharing works</Link>
          </Button>
        </div>
        <p data-reveal className="mt-6 text-footnote text-fg-muted">
          No public links. No ads. No selling your data.
        </p>
        <div data-reveal className="mt-14 w-full max-w-3xl">
          <HeroProduct />
        </div>
      </HeroReveal>
    </section>
  )
}

/** A small, honest picture of the product: a private video with its viewers. */
function HeroProduct() {
  return (
    <div className="rounded-xl border border-border bg-surface p-2 text-left shadow-lg">
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_10%,var(--raised)),var(--raised))]">
        <div className="absolute top-3 left-3">
          <AccessChip label="You and Maria" />
        </div>
        <div className="flex flex-col items-center gap-3 text-fg-muted">
          <Video aria-hidden className="size-10" strokeWidth={1.5} />
          <span className="text-footnote">Onboarding flow walkthrough</span>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full w-1/3 rounded-full bg-brand" />
          </div>
          <span className="rounded-sm bg-[rgb(14_20_32/.78)] px-2 py-0.5 text-caption text-[#e8edf5] tnum">
            1:24 / 4:12
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 pb-1">
        <div>
          <p className="text-headline">Onboarding flow walkthrough</p>
          <p className="text-footnote text-fg-secondary">Jonel · 2 hours ago · 3 comments</p>
        </div>
        <span className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong px-4 text-callout font-medium">
          <Lock aria-hidden className="size-5" strokeWidth={1.75} />
          Who can see this
        </span>
      </div>
    </div>
  )
}

const steps = [
  {
    icon: UserPlus,
    title: "Invite people by name",
    body: 'Add people by email or from your workspace. There\'s no "anyone with the link".',
  },
  {
    icon: Lock,
    title: "Links only work for them",
    body: "If someone else opens the link, they see a closed door and can ask you for access.",
  },
  {
    icon: Eye,
    title: "See who watched, and stop it anytime",
    body: "Set an end date, turn off downloads, or remove access. It takes effect right away.",
  },
]

function HowSharingWorks() {
  return (
    <section id="sharing" className="scroll-mt-20 py-16 md:py-24">
      <div className="container-page">
        <h2 className="max-w-[20ch] text-title-2 font-bold">How sharing works</h2>
        <p className="mt-3 max-w-[40rem] text-body-lg text-fg-secondary">
          Every video, room, channel, and task starts private. You choose who comes in.
        </p>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-lg border border-border bg-surface p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-brand">
                  <step.icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <span className="text-footnote text-fg-muted tnum">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-title-3 font-medium">{step.title}</h3>
              <p className="mt-2 text-callout text-fg-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section aria-labelledby="features-title" className="py-16 md:py-24">
      <div className="container-page">
        <h2 id="features-title" className="sr-only">
          What you can do in Cloqui
        </h2>
        <div className="grid gap-16 md:gap-24">
          <Feature
            icon={CircleDot}
            eyebrow="Record"
            title="Show it instead of typing it."
            body="Record your screen, your camera, or both. Trim it, add a title, and send it to the people who need it."
            visual={<RecordVisual />}
          />
          <Feature
            icon={MessageSquare}
            eyebrow="Talk"
            title="Discuss it with your team."
            body="Channels, direct messages, and threads. Start a voice or video huddle in any channel with one click."
            visual={<ChatVisual />}
            flip
          />
          <Feature
            icon={ListChecks}
            eyebrow="Track"
            title="Turn the talk into tasks."
            body="Make a task from any message or video. Track it on a list, a board, or a calendar."
            visual={<TaskVisual />}
          />
        </div>
      </div>
    </section>
  )
}

function Feature({
  icon: Icon,
  eyebrow,
  title,
  body,
  visual,
  flip = false,
}: {
  icon: typeof Video
  eyebrow: string
  title: string
  body: string
  visual: React.ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <div className={flip ? "md:order-2" : undefined}>
        <p className="inline-flex items-center gap-2 text-footnote font-medium text-brand">
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          {eyebrow}
        </p>
        <h3 className="mt-3 text-title-2 font-bold">{title}</h3>
        <p className="mt-3 max-w-[30rem] text-body-lg text-fg-secondary">{body}</p>
      </div>
      <div aria-hidden className={flip ? "md:order-1" : undefined}>
        {visual}
      </div>
    </div>
  )
}

function RecordVisual() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
      <div className="grid grid-cols-3 gap-2">
        {["Screen", "Camera", "Both"].map((m, i) => (
          <div
            key={m}
            className={
              i === 2
                ? "rounded-md border border-brand bg-brand-soft px-3 py-3 text-center text-callout font-medium text-brand"
                : "rounded-md border border-border-strong px-3 py-3 text-center text-callout text-fg-secondary"
            }
          >
            {m}
          </div>
        ))}
      </div>
      <div className="relative mt-4 aspect-video rounded-lg bg-background">
        <div className="absolute right-4 bottom-4 size-16 rounded-full border-2 border-surface bg-[linear-gradient(135deg,var(--border-strong),var(--input-border))] shadow-md" />
      </div>
      <div className="mt-4 flex justify-center">
        <RecordingPill elapsedSeconds={42} />
      </div>
    </div>
  )
}

function ChatVisual() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
      <div className="flex items-center gap-2">
        <Hash aria-hidden className="size-5 text-fg-secondary" strokeWidth={1.75} />
        <span className="text-headline">design-review</span>
        <AccessChip label="6 people" people />
      </div>
      <div className="mt-5 flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary">
          MS
        </span>
        <div className="min-w-0">
          <p className="text-callout">
            <span className="font-semibold">Maria Santos</span>{" "}
            <span className="text-caption text-fg-muted tnum">10:42</span>
          </p>
          <p className="mt-0.5 text-callout">
            Here&apos;s the new invite flow. Two questions at the end.
          </p>
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-background p-2.5">
            <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-sm bg-muted-foreground/15 text-fg-muted">
              <Video className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-callout font-medium">Invite flow v2</p>
              <p className="flex items-center gap-1.5 text-footnote text-fg-secondary">
                <Lock className="size-4" strokeWidth={1.75} />
                Channel members only · 2:38
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskVisual() {
  const tasks = [
    { title: "Fix invite email wording", status: "In progress", who: "MS", due: "Today" },
    { title: "Review onboarding video", status: "To do", who: "JD", due: "Thu" },
    { title: "Lock the Q4 roadmap room", status: "Done", who: "AK", due: "Mon" },
  ]
  return (
    <div className="rounded-xl border border-border bg-surface p-2 shadow-md">
      {tasks.map((t) => (
        <div
          key={t.title}
          className="flex items-center gap-3 rounded-md px-4 py-3 not-last:border-b not-last:border-border"
        >
          <span
            className={
              t.status === "Done"
                ? "size-5 shrink-0 rounded-[6px] bg-brand"
                : "size-5 shrink-0 rounded-[6px] border border-input"
            }
          />
          <span className="flex-1 truncate text-callout">{t.title}</span>
          <span className="text-footnote text-fg-secondary max-sm:hidden">{t.status}</span>
          <span className="w-12 text-right text-footnote text-fg-muted tnum">{t.due}</span>
          <span className="grid size-7 place-items-center rounded-full border border-border bg-raised text-caption text-fg-secondary">
            {t.who}
          </span>
        </div>
      ))}
    </div>
  )
}

function Honesty() {
  return (
    <section aria-labelledby="honest-title" className="py-16 md:py-24">
      <div className="container-page">
        <div className="rounded-xl border border-border bg-surface p-6 md:p-10">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden className="size-6 text-brand" strokeWidth={1.75} />
            <h2 id="honest-title" className="text-title-2 font-bold">
              What we protect, in plain words
            </h2>
          </div>
          <ul className="mt-6 grid gap-x-10 gap-y-4 text-callout md:grid-cols-2">
            <li>
              <strong className="font-semibold">Encrypted in transit and at rest.</strong>{" "}
              <span className="text-fg-secondary">
                Your videos and messages travel over TLS and are stored encrypted.
              </span>
            </li>
            <li>
              <strong className="font-semibold">No public links, ever.</strong>{" "}
              <span className="text-fg-secondary">
                Every link checks that you&apos;re signed in and invited.
              </span>
            </li>
            <li>
              <strong className="font-semibold">Videos play through short-lived links.</strong>{" "}
              <span className="text-fg-secondary">
                They expire in minutes, so a copied link stops working.
              </span>
            </li>
            <li>
              <strong className="font-semibold">Not end-to-end encrypted.</strong>{" "}
              <span className="text-fg-secondary">
                We say so plainly. We&apos;ll tell you if that changes.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="py-16 text-center md:py-24">
      <div className="container-page flex flex-col items-center">
        <h2 className="max-w-[18ch] text-title-1 font-bold">Close the door and get to work.</h2>
        <p className="mt-3 text-body-lg text-fg-secondary">
          Invite your team when you&apos;re ready.
        </p>
        <Button size="lg" asChild className="mt-8">
          <Link href="/sign-up">Start free</Link>
        </Button>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-border pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="container-page flex flex-wrap items-center justify-between gap-4 pt-8">
        <Logo />
        <p className="text-footnote text-fg-muted">
          © <CurrentYear /> Cloqui. Private by default.
        </p>
      </div>
    </footer>
  )
}

async function CurrentYear() {
  "use cache"
  return <>{new Date().getFullYear()}</>
}
