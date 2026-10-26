import { expect, test, type Page } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { ownerWithWorkspace } from "./support"

test.describe.configure({ mode: "serial" })

async function recordVideo(page: Page, slug: string, title: string) {
  await page.goto(`/w/${slug}/record`)
  await page.getByRole("radio", { name: /Camera/ }).click()
  await expect(page.getByLabel("Camera preview")).toBeVisible()
  await page.getByRole("button", { name: "Start recording" }).click()
  await expect(page.getByRole("status").filter({ hasText: "You are recording" })).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(2000)
  await page.getByRole("button", { name: "Stop" }).click()
  await page.getByLabel("Title").fill(title)
  await page.getByRole("button", { name: "Save video" }).click()
  await expect(page).toHaveURL(/\/v\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  return new URL(page.url()).pathname
}

async function openPanel(page: Page) {
  await page.getByRole("button", { name: /Who can see this/ }).click()
  return page.getByRole("dialog", { name: "Who can see this" })
}

test("public link: turn on, watch signed out, turn off, admin block", async ({ browser, page }) => {
  test.setTimeout(180_000)
  const { slug } = await ownerWithWorkspace(page, "Jonel Owner", "pub")
  const videoUrl = await recordVideo(page, slug, "Product tour")

  // ── Off by default. Turning it on asks first. ──
  let panel = await openPanel(page)
  const toggle = panel.getByRole("switch", { name: "Anyone with the link can watch" })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  const confirm = page.getByRole("alertdialog", { name: "Turn on a public link?" })
  await confirm.getByRole("button", { name: "Keep it private" }).click()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await confirm.getByRole("button", { name: "Turn on link" }).click()
  const linkBox = panel.getByRole("textbox", { name: "Public link" })
  await expect(linkBox).toHaveValue(/\/p\/[A-Za-z0-9_-]{43}$/)
  const publicUrl = new URL(await linkBox.inputValue()).pathname
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.keyboard.press("Escape")

  // The chip tells everyone who can see it.
  await page.reload()
  await expect(
    page.getByText("Who can see this: Anyone with the link").filter({ visible: true }).first()
  ).toBeVisible()

  // ── Someone with no account watches it ──
  const stranger = await browser.newContext()
  const anon = await stranger.newPage()
  await anon.goto(publicUrl)
  await expect(anon.getByRole("heading", { name: "Product tour" })).toBeVisible()
  await expect(anon.getByLabel("Video: Product tour")).toBeVisible()
  await expect(anon.getByText("Who can see this: Anyone with the link")).toBeVisible()
  // Watch only: no comments, no sharing, no download.
  await expect(anon.getByRole("button", { name: /Who can see this/ })).toHaveCount(0)
  await expect(anon.getByText("Comments")).toHaveCount(0)
  await expectAccessible(anon)
  await expectTapTargets(anon)
  // The normal video address still needs an invitation.
  await anon.goto(videoUrl)
  await expect(anon).toHaveURL(/\/sign-in/)

  // ── Turning it off stops the link ──
  panel = await openPanel(page)
  await panel.getByRole("switch", { name: "Anyone with the link can watch" }).click()
  await expect(panel.getByRole("textbox", { name: "Public link" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await anon.goto(publicUrl)
  await expect(anon.getByRole("heading", { name: "This link doesn't work" })).toBeVisible()
  await expectAccessible(anon)

  // ── An admin block stops a new link too, and owners can't turn one on ──
  panel = await openPanel(page)
  await panel.getByRole("switch", { name: "Anyone with the link can watch" }).click()
  await page
    .getByRole("alertdialog", { name: "Turn on a public link?" })
    .getByRole("button", { name: "Turn on link" })
    .click()
  const second = new URL(await panel.getByRole("textbox", { name: "Public link" }).inputValue())
    .pathname
  expect(second).not.toBe(publicUrl)
  await page.keyboard.press("Escape")

  await page.goto(`/w/${slug}/settings/security`)
  const allow = page.getByRole("switch", { name: "Video owners can turn on a public link" })
  await expect(allow).toBeChecked()
  await expect(page.getByText(/Anyone with the link can watch 1 video here/)).toBeVisible()
  await allow.click()
  const block = page.getByRole("alertdialog", { name: "Turn off public links?" })
  await block.getByRole("button", { name: "Turn off links" }).click()
  await expect(allow).not.toBeChecked()
  await expect(page.getByText("Every video here only opens for invited people.")).toBeVisible()
  await expectAccessible(page)

  await anon.goto(second)
  await expect(anon.getByRole("heading", { name: "This link doesn't work" })).toBeVisible()

  await page.goto(videoUrl)
  panel = await openPanel(page)
  await expect(panel.getByRole("switch", { name: "Anyone with the link can watch" })).toBeDisabled()
  await expect(panel.getByText("Your workspace admins have turned off public links.")).toBeVisible()
  await stranger.close()
})
