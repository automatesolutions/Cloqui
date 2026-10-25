"use client"

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"

/**
 * Signature moment #3 (of 3 allowed GSAP uses): the 3-2-1 before recording.
 * Under reduced motion the numbers change without animation.
 */
export function Countdown({ from = 3, onDone }: { from?: number; onDone: () => void }) {
  const [n, setN] = useState(from)
  const numRef = useRef<HTMLSpanElement>(null)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    if (n === 0) {
      done.current()
      return
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!reduce && numRef.current) {
      gsap.fromTo(
        numRef.current,
        { autoAlpha: 0, scale: 0.9 },
        { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out" }
      )
    }
    const t = setTimeout(() => setN((x) => x - 1), 1000)
    return () => clearTimeout(t)
  }, [n])

  if (n === 0) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] backdrop-blur-[4px]"
      role="status"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-4">
        <span ref={numRef} className="font-heading text-[7rem] leading-none font-bold text-fg tnum">
          {n}
        </span>
        <span className="text-callout text-fg-secondary">Starting in {n}</span>
      </div>
    </div>
  )
}
