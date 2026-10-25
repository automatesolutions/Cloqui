import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { relativeDate } from "@/lib/format"
import { requireUser } from "@/server/auth"
import { searchMessages } from "@/server/chat"

export const metadata: Metadata = { title: "Search" }

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/chat/search">) {
  const { slug } = await params
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q : ""
  const user = await requireUser()
  const results = q ? await searchMessages(user, slug, q) : []
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <Button variant="ghost" asChild className="mb-2 -ml-2 lg:hidden">
        <Link href={`/w/${slug}/chat`}>
          <ArrowLeft aria-hidden />
          Conversations
        </Link>
      </Button>
      <h1 className="text-title-2 font-bold">Search</h1>
      <p className="mt-1 text-callout text-fg-secondary">
        {q ? (
          <>Results for &ldquo;{q}&rdquo;. Only conversations you can read are searched.</>
        ) : (
          "Type in the search box to find messages."
        )}
      </p>
      <div className="mt-6">
        {q && results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            body="Try different words. Private conversations you're not in are never searched."
          />
        ) : (
          <ul className="grid gap-2">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/w/${slug}/chat/${r.channelId}${r.parentId ? `?thread=${r.parentId}` : ""}`}
                  className="block rounded-lg border border-border bg-surface px-4 py-3 hover:bg-raised"
                >
                  <p className="text-footnote text-fg-secondary">
                    <span className="font-semibold text-fg">{r.authorName}</span>
                    {r.channelKind === "channel"
                      ? ` in #${r.channelName}`
                      : " in a direct message"}{" "}
                    · {relativeDate(r.createdAt)}
                  </p>
                  <p className="mt-1 line-clamp-3 text-callout whitespace-pre-wrap">{r.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
