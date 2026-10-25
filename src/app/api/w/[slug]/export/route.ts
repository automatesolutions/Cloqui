import { NextResponse } from "next/server"
import { AccessDeniedError } from "@/server/authz"
import { getCurrentUser } from "@/server/auth"
import { exportWorkspace } from "@/server/workspace-admin"

// Admins download the workspace as one JSON file, limited to what they can see.
export async function GET(_: Request, { params }: RouteContext<"/api/w/[slug]/export">) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const { slug } = await params
  try {
    const data = await exportWorkspace(user, slug)
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cloqui-${data.workspace.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    if (e instanceof AccessDeniedError) return new NextResponse(null, { status: 404 })
    throw e
  }
}
