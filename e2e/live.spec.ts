import { expect, test } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { createConfirmedUser, signIn } from "./support"

// Real WebRTC through one local LiveKit dev server. When both device projects run at once, media
// setup can be slow on a laptop, so this spec (only) gets one retry. It passes on its own every time.
test.describe.configure({ mode: "serial", retries: 1 })

test("waiting room, admit, remove, keep outsiders out, end", async ({ browser, page }) => {
  test.setTimeout(180_000)
  const hostEmail = await createConfirmedUser("Hana Host")
  const mateEmail = await createConfirmedUser("Maria Mate")
  await signIn(page, hostEmail)
  const slug = `live-${Date.now().toString(36)}`
  await page.getByLabel("Workspace name").fill("Live Team")
  await page.getByLabel("Web address").fill(slug)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()

  // ── Create a room with a waiting room ──
  await page.goto(`/w/${slug}/live`)
  await expectAccessible(page)
  await page.getByRole("button", { name: "New live room" }).click()
  await page.getByLabel("Name").fill("Design review")
  await page.getByLabel("Invite people").fill(mateEmail)
  await expectAccessible(page)
  await page.getByRole("button", { name: "Create and open room" }).click()
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/)
  const roomUrl = new URL(page.url()).pathname
  await expect(page.getByRole("heading", { name: "Design review" })).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.getByRole("button", { name: "Join room" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Live · 1 person" })).toBeVisible({
    timeout: 20_000,
  })

  // ── The invited teammate waits ──
  const mateCtx = await browser.newContext()
  const mate = await mateCtx.newPage()
  await signIn(mate, mateEmail, roomUrl)
  await mate.getByRole("button", { name: "Join room" }).click()
  await expect(mate.getByRole("heading", { name: "Waiting for Hana to let you in" })).toBeVisible()
  await expectAccessible(mate)

  // ── The host lets them in ──
  await page.getByRole("button", { name: /Host controls.*1 waiting/ }).click()
  await page.getByRole("button", { name: "Let in", exact: true }).click()
  await expect(mate.getByRole("status").filter({ hasText: "Live · 2 people" })).toBeVisible({
    timeout: 20_000,
  })
  await page.keyboard.press("Escape") // the open sheet hides the page behind it from assistive tech
  await expect(page.getByRole("status").filter({ hasText: "Live · 2 people" })).toBeVisible({
    timeout: 20_000,
  })

  // ── An outsider can't join ──
  const outCtx = await browser.newContext()
  const out = await outCtx.newPage()
  await signIn(out, await createConfirmedUser("Olive Outsider"), roomUrl)
  await expect(out.getByRole("heading", { name: "You don't have access to this" })).toBeVisible()
  await expect(out.getByText("Design review")).toHaveCount(0)
  await outCtx.close()

  // ── Removing someone disconnects them, for good ──
  await page.getByRole("button", { name: /Host controls/ }).click()
  const row = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Maria Mate" })
  await row.getByRole("button", { name: "Remove" }).click()
  await page.getByRole("button", { name: "Remove from room" }).click()
  await expect(
    mate.getByRole("heading", { name: "The host removed you from this room" })
  ).toBeVisible({ timeout: 20_000 })
  await mate.reload()
  await mate.getByRole("button", { name: "Join room" }).click()
  await expect(
    mate.getByRole("heading", { name: "The host removed you from this room" })
  ).toBeVisible()
  await mateCtx.close()

  // ── Ending the room closes it ──
  await page.getByRole("button", { name: "End the room for everyone" }).click()
  await page.getByRole("button", { name: "End room" }).click()
  await expect(page.getByRole("heading", { name: "The room has ended" })).toBeVisible({
    timeout: 20_000,
  })
})
