import "server-only"
import { createHash, randomBytes } from "node:crypto"

/** A URL-safe random token (256 bits). Only its hash is stored. */
export function newToken() {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
