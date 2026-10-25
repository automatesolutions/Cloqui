import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // server-only throws outside a React Server environment; tests import server modules directly.
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup-dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          // Runs against the local Supabase Postgres (pnpm db:start). Proves RLS + authz.
          name: "permissions",
          environment: "node",
          include: ["tests/permissions/**/*.test.ts"],
          setupFiles: ["./tests/permissions/setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
  },
})
