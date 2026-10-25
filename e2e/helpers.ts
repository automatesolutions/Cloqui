import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

/** WCAG 2.2 AA via axe. Runs on whatever theme the project uses. */
export async function expectAccessible(page: Page) {
  // Let entrance animations settle: half-faded text would fail contrast for the wrong reason.
  // Only visible ones: Next keeps recently visited pages mounted but hidden (React <Activity>).
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-reveal]")]
      .filter((el) => el.checkVisibility())
      .every((el) => getComputedStyle(el).opacity === "1")
  )
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`
  )
  expect(summary, "axe violations").toEqual([])
}

/**
 * /hig: every visible control has a hit area of at least 44 x 44.
 * Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
 * Dense controls (data-size sm / icon-sm) pad their hit area by 4 px per side with ::after.
 */
export async function expectTapTargets(page: Page, min = 44) {
  const small = await page.evaluate((min) => {
    const sel =
      "a[href], button, [role=button], input:not([type=hidden]), select, textarea, [role=checkbox], [role=switch], [role=tab]"
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return false
        const style = getComputedStyle(el)
        if (style.visibility === "hidden" || style.display === "none") return false
        if (el.closest("p") && el.tagName === "A") return false
        if (el.closest(".sr-only")) return false
        const pad = ["sm", "icon-sm", "xs", "icon-xs"].includes(el.dataset.size ?? "") ? 8 : 0
        return r.width + pad < min || r.height + pad < min
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`
      })
  }, min)
  expect(small, "controls smaller than 44 x 44").toEqual([])
}
