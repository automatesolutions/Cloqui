import { describe, expect, it } from "vitest"
import { passwordSchema, safeNext, slugify, emailSchema } from "./validation"

describe("safeNext", () => {
  it.each([
    ["/w/acme", "/w/acme"],
    ["//evil.com", "/home"],
    ["/\\evil.com", "/home"],
    ["https://evil.com", "/home"],
    [undefined, "/home"],
  ])("%s → %s", (input, out) => expect(safeNext(input)).toBe(out))
})

describe("passwordSchema", () => {
  it("accepts a strong password", () =>
    expect(passwordSchema.safeParse("Quiet-Room-42").success).toBe(true))
  it.each(["short1A", "alllowercase123", "ALLUPPERCASE123", "NoNumbersHere"])("rejects %s", (p) =>
    expect(passwordSchema.safeParse(p).success).toBe(false)
  )
})

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Acme Design Team!")).toBe("acme-design-team")
    expect(slugify("Café Ñandú")).toBe("cafe-nandu")
    expect(slugify("***")).toBe("workspace")
  })
})

describe("emailSchema", () => {
  it("normalises case and spaces", () =>
    expect(emailSchema.parse("  Maria@Acme.CO ")).toBe("maria@acme.co"))
})
