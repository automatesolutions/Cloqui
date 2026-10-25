import "server-only"
import { createHash } from "node:crypto"

/**
 * Checks a password against known breaches with k-anonymity: only the first 5 characters of
 * its SHA-1 hash leave the server (Have I Been Pwned range API). Fails open if the API is down.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return false
    const body = await res.text()
    return body.split("\n").some((line) => {
      const [hashSuffix, count] = line.trim().split(":")
      return hashSuffix === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}
