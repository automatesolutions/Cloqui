import { expect, test } from "@playwright/test"
import { expectAccessible, expectTapTargets } from "./helpers"
import { createConfirmedUser, linkFromEmail, PASSWORD, signIn, uniqueEmail } from "./support"

// One full journey per project (desktop-dark, phone-light). Runs against local Supabase.
test.describe.configure({ mode: "serial" })

test("sign up, create a workspace, invite a teammate, keep outsiders out", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000)
  const ownerEmail = uniqueEmail("owner")
  const slug = `team-${Date.now().toString(36)}`

  // ── Sign up ──
  await page.goto("/sign-up")
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.getByLabel("Your name").fill("Jonel Test")
  await page.getByLabel("Work email").fill(ownerEmail)
  await page.getByLabel("Password").fill("short")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible()
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()

  // ── Confirm from the inbox → onboarding ──
  await page.goto(await linkFromEmail(ownerEmail, /\/auth\/confirm\?/))
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible()
  await expectAccessible(page)
  await page.getByLabel("Workspace name").fill("Team Test")
  await page.getByLabel("Web address").fill(slug)
  await page.getByRole("button", { name: "Create workspace" }).click()

  // ── Invite a teammate ──
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
  const mateEmail = uniqueEmail("mate")
  await page.getByLabel("Emails").fill(mateEmail)
  await page.getByRole("button", { name: "Send invites" }).click()
  await expect(page.getByText("Invited 1 person.")).toBeVisible()
  await page.getByRole("link", { name: "Go to Team Test" }).click()
  await expect(page.getByRole("heading", { name: "Hi, Jonel" })).toBeVisible()
  await expect(page.getByText("Who can see this: 1 person")).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)

  // ── The teammate accepts ──
  const inviteLink = await linkFromEmail(mateEmail, /\/invite\//)
  const mate = await browser.newContext()
  const matePage = await mate.newPage()
  await matePage.goto(inviteLink)
  await expect(matePage.getByRole("heading", { name: /invited you to Team Test/ })).toBeVisible()
  await expectAccessible(matePage)
  await createConfirmedUser("Maria Mate", mateEmail)
  await matePage.getByRole("link", { name: "I already have an account" }).click()
  await matePage.getByLabel("Email").fill(mateEmail)
  await matePage.getByLabel("Password").fill(PASSWORD)
  await matePage.getByRole("button", { name: "Sign in" }).click()
  await matePage.getByRole("button", { name: "Join Team Test" }).click()
  await expect(matePage.getByRole("heading", { name: "Hi, Maria" })).toBeVisible()
  // The same link never works twice.
  await matePage.goto(inviteLink)
  await expect(
    matePage.getByRole("heading", { name: "This invite was already used" })
  ).toBeVisible()
  await mate.close()

  // ── An outsider is kept out, calmly ──
  const outsiderEmail = await createConfirmedUser("Olive Outsider")
  const out = await browser.newContext()
  const outPage = await out.newPage()
  await signIn(outPage, outsiderEmail, `/w/${slug}`)
  await expect(
    outPage.getByRole("heading", { name: "You don't have access to this" })
  ).toBeVisible()
  await expect(outPage.getByText("Team Test")).toHaveCount(0)
  await expectAccessible(outPage)
  // The invite link isn't theirs either.
  await outPage.goto(inviteLink)
  await expect(outPage.getByRole("heading", { name: "This invite was already used" })).toBeVisible()
  await out.close()

  // ── The owner sees the change in members and the audit log ──
  await page.goto(`/w/${slug}/settings/members`)
  await expect(page.getByText("2 members")).toBeVisible()
  // Role labels render on the server (regression: they once came through a client module as undefined).
  await expect(page.getByText("Owner", { exact: true })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Member, Maria's role" })).toBeVisible()
  await expectAccessible(page)
  await expectTapTargets(page)
  await page.goto(`/w/${slug}/settings/audit`)
  await expect(page.getByText("Maria Mate joined as member")).toBeVisible()
  await expect(page.getByText("Jonel Test created the workspace")).toBeVisible()
  await expectAccessible(page)
})

test("signed-out people are sent to sign in and back", async ({ page }) => {
  await page.goto("/w/anything/settings")
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fw%2Fanything%2Fsettings/)
  await expectAccessible(page)
  await expectTapTargets(page)
})

test("sign-in errors don't reveal whether an account exists", async ({ page }) => {
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(uniqueEmail("nobody"))
  await page.getByLabel("Password").fill("Wrong-Password-1")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "That email and password don't match." })
  ).toBeVisible()
})
