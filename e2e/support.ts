import { randomUUID } from "node:crypto"
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { expect, type Page } from "@playwright/test"

config({ path: ".env.local", quiet: true })

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324"
export const PASSWORD = "Quiet-Room-2026"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
)

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@e2e.cloqui.dev`

/** A confirmed account created directly (for people who aren't the subject of the test). */
export async function createConfirmedUser(
  name: string,
  email = uniqueEmail(name.toLowerCase().replaceAll(" ", "-"))
) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (error) throw error
  return email
}

/** Waits for the newest email to `to` in the local Mailpit inbox and returns its first link matching `pattern`. */
export async function linkFromEmail(to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as {
        HTML: string
        Text: string
      }
      const hrefs = [...msg.HTML.matchAll(/href="([^"]+)"/g)].map((m) =>
        m[1].replaceAll("&amp;", "&")
      )
      const link = hrefs.find((h) => pattern.test(h))
      // Emails use NEXT_PUBLIC_APP_URL (port 3000); the E2E server runs on its own port.
      if (link)
        return link.replace(
          "http://localhost:3000",
          `http://localhost:${process.env.E2E_PORT ?? 3100}`
        )
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email to ${to} with a link matching ${pattern}`)
}

export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/sign-in/)
}
