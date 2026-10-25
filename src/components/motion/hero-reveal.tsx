"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(useGSAP)

/**
 * Signature moment #1 (of 3 allowed GSAP uses): the landing hero settles into place.
 * Children start hidden via CSS only when motion is allowed and scripts run,
 * with a CSS fallback that reveals them if hydration never happens.
 */
export function HeroReveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-reveal]",
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }
        )
      })
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-reveal]", { autoAlpha: 1, y: 0 })
      })
      return () => mm.revert()
    },
    { scope: ref }
  )

  return (
    <div ref={ref} className={className} data-hero-reveal>
      {children}
    </div>
  )
}
