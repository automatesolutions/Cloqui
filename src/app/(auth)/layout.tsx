import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="container-page flex h-14 items-center justify-between">
        <Link
          href="/"
          aria-label="Cloqui home"
          className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
        >
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main"
        className="container-page flex flex-1 items-start justify-center pt-8 pb-16 md:items-center md:pt-0"
      >
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  )
}
