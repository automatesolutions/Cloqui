import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse, type NextRequest } from "next/server"
import { bakeTokens, type TweakTheme, type TweakValues } from "@/lib/tweak"

// /tweak "Bake": writes slider values into src/app/globals.css. Development only, from this
// machine only, and only from the app's own pages. Everywhere else the route doesn't exist.
function allowed(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return false
  const host = request.headers.get("host") ?? ""
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false
  const origin = request.headers.get("origin")
  return origin === `http://${host}`
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return new NextResponse(null, { status: 404 })
  const body = (await request.json().catch(() => null)) as {
    theme?: TweakTheme
    values?: TweakValues
  } | null
  if (!body || (body.theme !== "dark" && body.theme !== "light") || !body.values) {
    return NextResponse.json({ error: "Send { theme, values }." }, { status: 400 })
  }
  const file = join(process.cwd(), "src", "app", "globals.css")
  const css = await readFile(file, "utf8")
  try {
    const next = bakeTokens(css, body.theme, body.values)
    if (next !== css) await writeFile(file, next, "utf8")
    return NextResponse.json({ ok: true, changed: next !== css })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
