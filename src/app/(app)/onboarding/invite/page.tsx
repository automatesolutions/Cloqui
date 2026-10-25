import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { HeroReveal } from "@/components/motion/hero-reveal"
import { requireUser } from "@/server/auth"
import { can } from "@/server/authz"
import { inviteAction } from "../../w/[slug]/settings/actions"
import { InviteForm } from "../../w/[slug]/settings/members/member-controls"

export default function OnboardingInvitePage({ searchParams }: PageProps<"/onboarding/invite">) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  )
}

async function Body({
  searchParams,
}: {
  searchParams: PageProps<"/onboarding/invite">["searchParams"]
}) {
  const sp = await searchParams
  const slug = typeof sp.w === "string" ? sp.w : ""
  const user = await requireUser("/onboarding")
  const access = await can(user, "members.invite", slug)
  if (!access) redirect("/home")

  return (
    <HeroReveal>
      <p data-reveal className="text-footnote font-medium text-brand tnum">
        Step 2 of 2
      </p>
      <h1 data-reveal className="mt-2 text-title-1 font-bold max-md:text-title-2">
        Invite your team
      </h1>
      <p data-reveal className="mt-2 text-callout text-fg-secondary">
        They&apos;ll get an email with a link that only works for them. You can do this later too.
      </p>
      <div data-reveal className="mt-8">
        <InviteForm action={inviteAction.bind(null, slug)} roles={["admin", "member", "guest"]} />
      </div>
      <div data-reveal className="mt-8 border-t border-border pt-6">
        <Button variant="secondary" asChild className="w-full">
          <Link href={`/w/${slug}`}>Go to {access.workspace.name}</Link>
        </Button>
      </div>
    </HeroReveal>
  )
}
