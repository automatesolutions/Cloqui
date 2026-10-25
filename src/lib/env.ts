import "server-only"
import { z } from "zod"

// Server-side env, validated once. Import `env` instead of reading process.env directly.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().startsWith("postgres"),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Cloqui <hello@example.com>"),
  // "resend" in production. "mailpit" sends to the local inbox (pnpm db:start) and never leaves the machine.
  EMAIL_TRANSPORT: z.enum(["resend", "mailpit"]).default("resend"),
  MAILPIT_URL: z.url().optional().default("http://127.0.0.1:55324"),
  NEXT_PUBLIC_AUTH_GOOGLE: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_AUTH_MICROSOFT: z.enum(["true", "false"]).default("false"),
})

export const env = schema.parse(process.env)
