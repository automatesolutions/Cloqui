import { z } from "zod"

// Copy follows /cloqui-tone: say what to do, no blame.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Add the full email, like maria@acme.co" }))

// Mirrors supabase/config.toml: 10+ characters with upper, lower and a digit.
export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters." })
  .max(128, { error: "Use 128 characters or fewer." })
  .regex(/[a-z]/, { error: "Add a lowercase letter." })
  .regex(/[A-Z]/, { error: "Add an uppercase letter." })
  .regex(/[0-9]/, { error: "Add a number." })

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Add your name." })
  .max(80, { error: "Use 80 characters or fewer." })

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Add a workspace name." })
  .max(60, { error: "Use 60 characters or fewer." })

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, {
    error: "Use 1 to 40 lowercase letters, numbers or dashes.",
  })

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, { error: "Add a domain like acme.co" })

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "workspace"
  )
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string") return fallback
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback
  return next
}

export type FormState = {
  ok?: boolean
  message?: string
  fieldErrors?: Partial<Record<string, string>>
  values?: Record<string, string>
}

export function fieldErrorsOf(error: z.ZodError): FormState["fieldErrors"] {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    out[key] ??= issue.message
  }
  return out
}
