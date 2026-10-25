import { expect, test } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { addToWorkspace, createConfirmedUser, ownerWithWorkspace, signIn } from "./support"

test.describe.configure({ mode: "serial" })

test("spaces, lists, the task drawer, board, calendar, timeline, chat-to-task", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const { slug } = await ownerWithWorkspace(page, "Ana Owner", "tasks")
  const benEmail = await createConfirmedUser("Ben Builder")
  await addToWorkspace(benEmail, slug)

  // ── A space with its first list ──
  await page.goto(`/w/${slug}/tasks`)
  await expectAccessible(page)
  await page.getByRole("button", { name: "New space" }).click()
  await page.getByLabel("Name").fill("Product")
  await page.getByRole("button", { name: "Create space" }).click()
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/)
  const listUrl = new URL(page.url()).pathname
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible()
  await page.waitForLoadState("networkidle")

  // ── Quick add ──
  await page.getByLabel("Add a task to To do").fill("Write launch post")
  await page.getByLabel("Add a task to To do").press("Enter")
  await expect(page.getByRole("button", { name: "Write launch post", exact: true })).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)

  // ── Automations ──
  await page.getByRole("button", { name: "Automations" }).click()
  const auto = page.getByRole("dialog", { name: "Automations" })
  await expect(auto.getByText("No automations on this list yet.")).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  await auto.getByRole("button", { name: "Add automation" }).click()
  await expect(auto.getByText("When moved to Done, notify the assignees")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Automations (1)" })).toBeVisible()

  // ── The drawer ──
  await page.getByRole("button", { name: "Write launch post", exact: true }).click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByLabel("Title")).toHaveValue("Write launch post")
  await drawer.getByRole("combobox", { name: /Priority/ }).click()
  await page.getByRole("option", { name: "High" }).click()
  await drawer.getByRole("button", { name: /Assignees/ }).click()
  await page.getByRole("checkbox", { name: "Ben Builder" }).click()
  await page.keyboard.press("Escape")
  await drawer.getByLabel("Add a checklist item").fill("Draft headline")
  await drawer.getByRole("button", { name: "Add" }).first().click()
  await expect(drawer.getByText("Draft headline")).toBeVisible()
  await drawer.getByLabel("Write a comment").fill("Let's ship Thursday")
  await drawer.getByRole("button", { name: "Comment" }).click()
  await expect(drawer.getByText("Let's ship Thursday")).toBeVisible()
  await expect(drawer.getByText("Ana Owner changed who's assigned")).toBeVisible()
  await expectAccessible(page)
  await page.keyboard.press("Escape")

  // ── Board: move with the accessible menu ──
  await page.goto(`${listUrl}?view=board`)
  await page.getByRole("button", { name: 'Move "Write launch post"' }).click()
  await page.getByRole("menuitem", { name: "In progress" }).click()
  const column = page.getByRole("region", { name: /In progress/ })
  await expect(column.getByText("Write launch post")).toBeVisible()
  await expectAccessible(page)

  // ── Calendar and timeline render accessibly ──
  await page.goto(`${listUrl}?view=calendar`)
  await expect(page.getByRole("table", { name: /Tasks due in/ })).toBeVisible()
  await expectAccessible(page)
  await page.goto(`${listUrl}?view=timeline`)
  await expect(page.getByText("Tasks need a start or due date to show here.")).toBeVisible()
  await expectAccessible(page)

  // ── Ben was assigned: notification and My tasks ──
  const benCtx = await browser.newContext()
  const ben = await benCtx.newPage()
  await signIn(ben, benEmail, `/w/${slug}/notifications`)
  await expect(ben.getByText("Ana Owner assigned you a task")).toBeVisible()
  await ben.goto(`/w/${slug}/tasks`)
  await expect(ben.getByRole("link", { name: /Write launch post/ })).toBeVisible()

  // ── A private space is closed to Ben ──
  await page.goto(`/w/${slug}/tasks`)
  await page.getByRole("button", { name: "New space" }).click()
  await page.getByLabel("Name").fill("Hiring")
  await page.getByRole("switch", { name: "Private" }).click()
  await page.getByRole("button", { name: "Create space" }).click()
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/)
  const privateList = new URL(page.url()).pathname
  await ben.goto(privateList)
  await expect(ben.getByRole("heading", { name: "You don't have access to this" })).toBeVisible()
  await ben.goto(`/w/${slug}/tasks`)
  await expect(ben.getByText("Hiring")).toHaveCount(0)
  await benCtx.close()

  // ── Chat message → task ──
  await page.goto(`/w/${slug}/chat`)
  await page.getByRole("button", { name: "New channel" }).click()
  await page.getByLabel("Name").fill("launch")
  await page.getByRole("button", { name: "Create channel" }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Write a message").fill("Book the venue for the launch party")
  await page.getByLabel("Write a message").press("Enter")
  const msg = page.getByRole("article").filter({ hasText: "Book the venue" })
  await msg.hover()
  await msg.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: "Make a task" }).click()
  await page.getByRole("radio", { name: /Tasks.*Product/ }).click()
  await page.getByRole("button", { name: "Create task" }).click()
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}\?task=/)
  await expect(page.getByRole("dialog").getByLabel("Title")).toHaveValue(
    "Book the venue for the launch party"
  )
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Original message" })
  ).toBeVisible()
})
