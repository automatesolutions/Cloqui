import "server-only"
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

/** Format: scrypt$<salt base64url>$<hash base64url>. Never store or log the passcode itself. */
export async function hashPasscode(passcode: string) {
  const salt = randomBytes(16)
  const hash = await scrypt(passcode, salt, 32)
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export async function verifyPasscode(passcode: string, stored: string) {
  const [scheme, saltB64, hashB64] = stored.split("$")
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, "base64url")
  const actual = await scrypt(passcode, Buffer.from(saltB64, "base64url"), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
