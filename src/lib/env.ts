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
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("cloqui-media"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  TRANSCRIPTION_ENABLED: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_AUTH_GOOGLE: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_AUTH_MICROSOFT: z.enum(["true", "false"]).default("false"),
})

export const env = schema.parse(process.env)
