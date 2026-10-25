// Writes .env.local from .env.example plus the values `supabase status` prints for the local stack.
// Usage: pnpm env:local   (after pnpm db:start). Never prints the keys.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
})
const status = JSON.parse(raw.slice(raw.indexOf("{")))

const set = (text, key, value) => {
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, "m")
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`
}

let env = readFileSync(existsSync(".env.local") ? ".env.local" : ".env.example", "utf8")
env = set(env, "NEXT_PUBLIC_SUPABASE_URL", status.API_URL)
env = set(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY", status.ANON_KEY)
env = set(env, "SUPABASE_SERVICE_ROLE_KEY", status.SERVICE_ROLE_KEY)
env = set(env, "DATABASE_URL", status.DB_URL)
env = set(env, "MAILPIT_URL", status.MAILPIT_URL ?? status.INBUCKET_URL)
env = set(env, "EMAIL_TRANSPORT", "mailpit")
writeFileSync(".env.local", env)
console.log("Wrote .env.local for the local Supabase stack.")
