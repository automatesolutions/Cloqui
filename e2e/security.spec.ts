import { expect, test } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import {
  addToWorkspace,
  createConfirmedUser,
  nextTotpWindow,
  ownerWithWorkspace,
  PASSWORD,
  signIn,
  totp,
} from "./support"

test.describe.configure({ mode: "serial" })

test("two-step sign-in, a workspace that requires it, and the security settings", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const { email, slug } = await ownerWithWorkspace(page, "Sana Secure", "secure")
  const benEmail = await createConfirmedUser("Ben Basic")
  await addToWorkspace(benEmail, slug)

  // ── Account page, then set up the authenticator ──
  await page.goto("/account")
  await expect(page.getByRole("heading", { name: "Account and security", level: 1 })).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.getByRole("button", { name: "Set up two-step sign-in" }).click()
  const secret = (await page.locator("code").textContent())!.trim()
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible()
  await expectAccessible(page)
  await page.getByLabel("6-digit code").fill(totp(secret))
  await page.getByRole("button", { name: "Turn on" }).click()
  await expect(page.getByText("On. You'll enter a code")).toBeVisible()

  // ── Require it for the workspace ──
  await page.goto(`/w/${slug}/settings/security`)
  await expect(page.getByRole("heading", { name: "Two-step sign-in" })).toBeVisible()
  await expect(page.getByText(/Ben Basic/)).toBeVisible()
  await page.getByRole("switch", { name: "Everyone must use two-step sign-in" }).click()
  await expect(page.getByText("Two-step sign-in is now required.")).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)

  // ── Ben, without it, gets told what to do instead of a dead end ──
  const benCtx = await browser.newContext()
  const ben = await benCtx.newPage()
  await signIn(ben, benEmail)
  await ben.goto(`/w/${slug}`)
  await expect(ben.getByRole("heading", { name: "Turn on two-step sign-in first" })).toBeVisible()
  await expectAccessible(ben)
  await benCtx.close()

  // ── Signing in again asks for the code ──
  await page.context().clearCookies()
  await page.goto(`/sign-in?next=${encodeURIComponent(`/w/${slug}`)}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/sign-in\/2fa/)
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  // Without the code, nothing in the app opens.
  await page.goto(`/w/${slug}`)
  await expect(page).toHaveURL(/\/sign-in\/2fa/)
  await nextTotpWindow()
  await page.getByLabel("6-digit code").fill(totp(secret))
  await page.getByRole("button", { name: "Verify" }).click()
  await expect(page).toHaveURL(new RegExp(`/w/${slug}$`))
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached()
})

test("keyboard: the skip link comes first and moves focus to the content", async ({ page }) => {
  const { slug } = await ownerWithWorkspace(page, "Kai Keys", "keys")
  await page.goto(`/w/${slug}`)
  await page.waitForLoadState("networkidle")
  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: "Skip to content" })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/#main$/)
})
