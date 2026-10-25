/**
 * Signature entrance for the landing hero and onboarding steps: each direct child marked
 * data-reveal rises 8px and fades in, 80ms apart (globals.css). Pure CSS so it starts at first
 * paint: the headline is the page's largest paint, and waiting for JS delayed it by a second.
 */
export function HeroReveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className} data-hero-reveal>
      {children}
    </div>
  )
}
