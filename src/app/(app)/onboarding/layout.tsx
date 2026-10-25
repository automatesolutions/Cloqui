import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="container-page flex h-14 items-center justify-between">
        <Link
          href="/home"
          aria-label="Cloqui home"
          className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
        >
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="container-page flex flex-1 justify-center pt-8 pb-16 md:pt-16">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  )
}
