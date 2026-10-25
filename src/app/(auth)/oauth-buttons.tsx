import { oauthAction } from "./actions"
import { Button } from "@/components/ui/button"

/** Shown only for providers that are configured (NEXT_PUBLIC_AUTH_GOOGLE / _MICROSOFT). */
export function OAuthButtons({ next }: { next: string }) {
  const google = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true"
  const microsoft = process.env.NEXT_PUBLIC_AUTH_MICROSOFT === "true"
  if (!google && !microsoft) return null
  return (
    <>
      <div className="grid gap-2">
        {google && (
          <form action={oauthAction}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Google
            </Button>
          </form>
        )}
        {microsoft && (
          <form action={oauthAction}>
            <input type="hidden" name="provider" value="azure" />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Microsoft
            </Button>
          </form>
        )}
      </div>
      <div className="my-6 flex items-center gap-3 text-footnote text-fg-muted" role="separator">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  )
}
