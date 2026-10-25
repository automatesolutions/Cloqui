import { NextResponse } from "next/server"
import { exportMyData } from "@/server/account"
import { getCurrentUser } from "@/server/auth"

// Download everything you created, as one JSON file.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const data = await exportMyData(user)
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cloqui-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
