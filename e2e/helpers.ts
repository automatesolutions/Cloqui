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
  // Toasts fade in too. Wait for finite animations and transitions (not looping spinners).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity
      )
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
 * The hit area includes an absolutely positioned ::after that extends past the element
 * (how dense buttons and switches pad their target without looking bigger).
 * Exempt (WCAG 2.5.8): links inside running text, and controls marked data-inline-target.
 */
export async function expectTapTargets(page: Page, min = 44) {
  const small = await page.evaluate((min) => {
    const sel =
      "a[href], button, [role=button], input:not([type=hidden]):not([type=checkbox]), select, textarea, [role=checkbox], [role=switch], [role=tab], [role=radio], [role=combobox]"
    const hitArea = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      let w = r.width
      let h = r.height
      const a = getComputedStyle(el, "::after")
      if (a.content !== "none" && a.position === "absolute") {
        const out = (v: string) => Math.max(0, -parseFloat(v) || 0)
        w += out(a.left) + out(a.right)
        h += out(a.top) + out(a.bottom)
      }
      return { w, h }
    }
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return false
        const style = getComputedStyle(el)
        if (style.visibility === "hidden" || style.display === "none") return false
        if (el.closest("p") && el.tagName === "A") return false
        if (el.closest(".sr-only") || el.closest("[data-inline-target]")) return false
        // A control wrapped in a <label> uses the label as its target.
        const label = el.closest("label")
        const { w, h } = label ? hitArea(label) : hitArea(el)
        return w < min || h < min
      })
      .map((el) => {
        const { w, h } = hitArea(el)
        const name = el.getAttribute("aria-label") ?? el.textContent ?? el.id
        return `${el.tagName.toLowerCase()} "${name.trim().slice(0, 40)}" ${Math.round(w)}x${Math.round(h)}`
      })
  }, min)
  expect(small, "controls smaller than 44 x 44").toEqual([])
}
