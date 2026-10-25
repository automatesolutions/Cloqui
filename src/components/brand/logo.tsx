import { cn } from "@/lib/utils"

/** Cloqui mark: an open ring (a door left ajar) around one person inside. */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M21.6 10.4A8 8 0 1 0 21.6 21.6"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.6" fill="var(--on-accent)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-[1.25rem] leading-none font-bold tracking-[-0.01em]">
        Cloqui
      </span>
    </span>
  )
}
