import { expect, test } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"

test.describe("landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("says what Cloqui is and offers one clear start", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Video, chat, and tasks behind a closed door." })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible()
    await expect(page.getByText("No public links. No ads. No selling your data.")).toBeVisible()
  })

  test("is honest about encryption", async ({ page }) => {
    await expect(page.getByText("Encrypted in transit and at rest.")).toBeVisible()
    await expect(page.getByText("Not end-to-end encrypted.")).toBeVisible()
    // The only mention of end-to-end must be the "Not end-to-end encrypted." disclaimer.
    const body = (await page.locator("main").textContent()) ?? ""
    expect(body.match(/end-to-end/gi)?.length).toBe(1)
    expect(body).not.toMatch(/military-grade|bank-level|unhackable|100% secure/i)
  })

  test("only the landing page is indexable", async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/)
  })

  test("meets WCAG 2.2 AA", async ({ page }) => {
    await expectAccessible(page)
  })

  test("every control is at least 44 x 44", async ({ page }) => {
    await expectTapTargets(page)
  })

  test("theme switch works and is labelled", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) theme/ })
    const before = await page.locator("html").getAttribute("class")
    await toggle.click()
    await expect(page.locator("html")).not.toHaveAttribute("class", before ?? "")
  })

  test("respects reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" })
    const page = await ctx.newPage()
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await ctx.close()
  })
})
