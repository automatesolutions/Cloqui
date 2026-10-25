import { config } from "dotenv"

// Local Supabase values (pnpm db:start). CI writes the same file from `supabase status`.
config({ path: ".env.local", quiet: true })
