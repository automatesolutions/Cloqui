import { expect, test, type Browser } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { addToWorkspace, createConfirmedUser, ownerWithWorkspace, signIn } from "./support"

test.describe.configure({ mode: "serial" })

async function member(browser: Browser, name: string, slug: string, next: string) {
  const email = await createConfirmedUser(name)
  await addToWorkspace(email, slug)
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signIn(page, email, next)
  return { email, ctx, page }
}

test("channels, mentions, live threads, private channels and DMs", async ({ browser, page }) => {
  test.setTimeout(180_000)
  const { slug } = await ownerWithWorkspace(page, "Alice Owner", "chat")
  const bob = await member(browser, "Bob Builder", slug, `/w/${slug}/chat`)

  // ── Alice creates an open channel and mentions Bob ──
  await page.goto(`/w/${slug}/chat`)
  await page.getByRole("button", { name: "New channel" }).click()
  await page.getByLabel("Name").fill("design")
  await page.getByRole("button", { name: "Create channel" }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  const channelUrl = new URL(page.url()).pathname
  await expect(page.getByText("Who can see this: Everyone in chat team").first()).toBeAttached()
  await expectAccessible(page)
  await expectTapTargets(page)

  const box = page.getByLabel("Write a message")
  await box.fill("Morning @Bo")
  await page.getByRole("option", { name: /Bob Builder/ }).click()
  await box.press("End")
  await box.pressSequentially("can you look at the header?")
  await box.press("Enter")
  await expect(page.getByText("can you look at the header?")).toBeVisible()

  // ── Bob finds the channel, joins, and has a notification ──
  await bob.page.goto(`/w/${slug}/chat/browse`)
  await expectAccessible(bob.page)
  await bob.page.getByRole("button", { name: "Join" }).click()
  await expect(bob.page).toHaveURL(new RegExp(`${channelUrl}$`))
  await expect(bob.page.getByText("can you look at the header?")).toBeVisible()
  await expect(bob.page.getByRole("link", { name: /Notifications, 1 unread/ })).toBeVisible()

  // ── Bob replies in a thread; Alice sees it live, without reloading ──
  const msg = bob.page.getByRole("article").filter({ hasText: "can you look at the header?" })
  await msg.hover()
  await msg.getByRole("button", { name: "Reply in thread" }).click()
  await bob.page
    .getByRole("textbox", { name: "Reply in thread" })
    .fill("On it, give me ten minutes.")
  await bob.page.getByRole("textbox", { name: "Reply in thread" }).press("Enter")
  await expect(
    bob.page.getByRole("complementary", { name: "Thread" }).getByText("On it, give me ten minutes.")
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "1 reply" })).toBeVisible({ timeout: 15_000 })

  // ── Notifications page ──
  await bob.page.goto(`/w/${slug}/notifications`)
  await expect(bob.page.getByText("Alice Owner mentioned you")).toBeVisible()
  await expectAccessible(bob.page)

  // ── A private channel is invisible to others ──
  await page.goto(`/w/${slug}/chat`)
  await page.getByRole("button", { name: "New channel" }).click()
  await page.getByLabel("Name").fill("leadership")
  await page.getByRole("switch", { name: "Private" }).click()
  await page.getByRole("button", { name: "Create channel" }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  const privateUrl = new URL(page.url()).pathname
  await page.getByLabel("Write a message").fill("Budget numbers go here.")
  await page.getByLabel("Write a message").press("Enter")
  await expect(page.getByText("Budget numbers go here.")).toBeVisible()

  const carol = await member(browser, "Carol Curious", slug, `/w/${slug}/chat/browse`)
  await expect(carol.page.getByText("leadership")).toHaveCount(0)
  await carol.page.goto(privateUrl)
  await expect(
    carol.page.getByRole("heading", { name: "You don't have access to this" })
  ).toBeVisible()
  await expect(carol.page.getByText("Budget numbers go here.")).toHaveCount(0)
  await carol.page.goto(`/w/${slug}/chat/search?q=budget`)
  await expect(carol.page.getByText("No matches")).toBeVisible()
  await carol.ctx.close()

  // ── A direct message ──
  await page.goto(`/w/${slug}/chat`) // on phones the conversation list is its own screen
  await page.getByRole("button", { name: "New direct message" }).click()
  await page.getByRole("dialog").getByText("Bob Builder").click()
  await page.getByRole("button", { name: "Open conversation" }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Write a message").fill("Quick question, just between us.")
  await page.getByLabel("Write a message").press("Enter")
  await expect(page.getByText("Quick question, just between us.")).toBeVisible()
  await bob.page.goto(`/w/${slug}/chat`)
  await bob.page.getByRole("link", { name: /^Alice/ }).click()
  await expect(bob.page.getByText("Quick question, just between us.")).toBeVisible()
  await bob.ctx.close()
})
