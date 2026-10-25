"use client"

import { useSelectedLayoutSegment } from "next/navigation"
import { cn } from "@/lib/utils"

/** Chat and tasks need the full width and height. Every other page keeps a comfortable reading width. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const fullBleed = segment === "chat" || segment === "tasks"
  return (
    <main
      id="main"
      className={cn(
        "flex-1",
        fullBleed ? "flex min-h-0 flex-col" : "px-4 pt-8 pb-28 md:px-6 lg:px-8 lg:pb-16"
      )}
    >
      {fullBleed ? children : <div className="mx-auto w-full max-w-5xl">{children}</div>}
    </main>
  )
}
