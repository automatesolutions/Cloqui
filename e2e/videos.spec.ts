import { expect, test, type Browser, type Page } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { createConfirmedUser, signIn } from "./support"

test.describe.configure({ mode: "serial" })

async function ownerWithWorkspace(page: Page) {
  const email = await createConfirmedUser("Jonel Owner")
  await signIn(page, email)
  const slug = `vids-${Date.now().toString(36)}`
  await page.getByLabel("Workspace name").fill("Video Team")
  await page.getByLabel("Web address").fill(slug)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
  return { email, slug }
}

async function asUser(browser: Browser, name: string, next: string) {
  const email = await createConfirmedUser(name)
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signIn(page, email, next)
  return { email, ctx, page }
}

test("record, share, discuss, request access, remove access", async ({ browser, page }) => {
  test.setTimeout(180_000)
  const { slug } = await ownerWithWorkspace(page)

  // ── Record with the (fake) camera ──
  await page.goto(`/w/${slug}/record`)
  await expect(page.getByRole("heading", { name: "Record" })).toBeVisible()
  await page.getByRole("radio", { name: /Camera/ }).click()
  await expect(page.getByLabel("Camera preview")).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.getByRole("button", { name: "Start recording" }).click()
  await expect(page.getByText("Starting in", { exact: false })).toBeVisible()
  const pill = page.getByRole("status").filter({ hasText: "You are recording" })
  await expect(pill).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(2500)
  await page.getByRole("button", { name: "Pause" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible()
  await page.getByRole("button", { name: "Resume" }).click()
  await page.waitForTimeout(1000)
  await page.getByRole("button", { name: "Stop" }).click()

  // ── Review and save ──
  await expect(page.getByRole("button", { name: "Save video" })).toBeVisible()
  await page.getByLabel("Title").fill("Onboarding walkthrough")
  await page.getByRole("button", { name: "Save video" }).click()
  await expect(page).toHaveURL(/\/v\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const videoUrl = new URL(page.url()).pathname
  await expect(page.getByRole("heading", { name: "Onboarding walkthrough" })).toBeVisible()
  await expect(
    page.getByText("Who can see this: Only you").filter({ visible: true }).first()
  ).toBeVisible()
  await expect(page.getByLabel("Video: Onboarding walkthrough")).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)

  // ── The video is in the library, private ──
  await page.goto(`/w/${slug}/library`)
  await expect(page.getByRole("link", { name: "Onboarding walkthrough" })).toBeVisible()
  await expectAccessible(page)

  // ── Share with a teammate (an existing account) ──
  const mate = await asUser(browser, "Maria Mate", videoUrl)
  await expect(
    mate.page.getByRole("heading", { name: "You don't have access to this" })
  ).toBeVisible()

  await page.goto(videoUrl)
  await page.getByRole("button", { name: /Who can see this/ }).click()
  const panel = page.getByRole("dialog", { name: "Who can see this" })
  await panel.getByLabel("Emails or names").fill(mate.email)
  await panel.getByRole("button", { name: "Share" }).click()
  await expect(panel.getByText("Shared with 1 person.")).toBeVisible()
  await expect(panel.getByText("Maria Mate")).toBeVisible()
  await expectAccessible(page)
  await page.keyboard.press("Escape")

  // ── The teammate watches, comments and reacts ──
  await mate.page.reload()
  await expect(mate.page.getByRole("heading", { name: "Onboarding walkthrough" })).toBeVisible()
  await expect(mate.page.getByText("Who can see this: You and Maria")).toHaveCount(0) // owner-only phrasing
  await mate.page.getByLabel("Add a comment").fill("Love the pacing at the start.")
  await mate.page.getByRole("button", { name: "Post" }).click()
  await expect(mate.page.getByText("Love the pacing at the start.")).toBeVisible()
  await mate.page.getByRole("button", { name: "heart" }).click()
  await expect(mate.page.getByRole("button", { name: "heart, 1" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expectAccessible(mate.page)

  // ── An outsider asks for access; the owner lets them in ──
  const out = await asUser(browser, "Olive Outsider", videoUrl)
  await expect(
    out.page.getByRole("heading", { name: "You don't have access to this" })
  ).toBeVisible()
  await expect(out.page.getByText("Only people Jonel invited can open it.")).toBeVisible()
  await expect(out.page.getByText("Onboarding walkthrough")).toHaveCount(0)
  await expectAccessible(out.page)
  await out.page.getByRole("button", { name: "Request access" }).click()
  await expect(out.page.getByText("Request sent. Jonel will get a notification.")).toBeVisible()

  await page.reload()
  await page.getByRole("button", { name: /Who can see this.*1 access request/ }).click()
  await page.getByRole("button", { name: "Let them watch" }).click()
  await expect(page.getByText("Olive can watch now.")).toBeVisible()
  await page.keyboard.press("Escape")
  await out.page.reload()
  await expect(out.page.getByRole("heading", { name: "Onboarding walkthrough" })).toBeVisible()

  // ── Removing access works right away ──
  await page.reload()
  await page.getByRole("button", { name: /Who can see this/ }).click()
  const row = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Maria Mate" })
  await row.getByRole("button", { name: "Remove" }).click()
  await expect(page.getByRole("alertdialog", { name: "Remove Maria's access?" })).toBeVisible()
  await page.getByRole("button", { name: "Remove access" }).click()
  await expect(page.getByText("Maria no longer has access.")).toBeVisible()
  await mate.page.reload()
  await expect(
    mate.page.getByRole("heading", { name: "You don't have access to this" })
  ).toBeVisible()

  // ── The owner sees who watched ──
  await page.keyboard.press("Escape")
  await page.reload()
  await expect(page.getByText("Maria Mate watched")).toBeVisible()
  await expect(page.getByText("Olive Outsider asked for access")).toBeVisible()
  await expect(page.getByText("Jonel Owner let Olive Outsider watch")).toBeVisible()
  await expect(page.getByText("Jonel Owner removed Maria Mate's access")).toBeVisible()

  await mate.ctx.close()
  await out.ctx.close()
})
