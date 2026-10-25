"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase/client"

/** Unread count, kept live by realtime. RLS means each person only hears about their own. */
export function NotificationBell({
  slug,
  userId,
  initial,
}: {
  slug: string
  userId: string
  initial: number
}) {
  const [count, setCount] = useState(initial)
  useEffect(() => {
    const supabase = supabaseBrowser()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setCount((c) => c + 1)
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications"
  return (
    <Link
      href={`/w/${slug}/notifications`}
      aria-label={label}
      className="relative grid size-11 place-items-center rounded-md text-fg-secondary transition-colors duration-150 hover:bg-raised hover:text-fg"
    >
      <Bell aria-hidden className="size-5" strokeWidth={1.75} />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.625rem] leading-4 font-semibold text-on-brand tnum"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
