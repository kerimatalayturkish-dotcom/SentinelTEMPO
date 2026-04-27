import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const filter = url.searchParams.get("filter") ?? "unsettled"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500)

  let where = ""
  if (filter === "unsettled") where = "WHERE settled = false"
  else if (filter === "settled") where = "WHERE settled = true"
  // filter=all → no where clause

  try {
    const result = await pool.query(
      `SELECT id, agent, amount::text AS amount, mpp_tx, reason,
              EXTRACT(EPOCH FROM created_at)::bigint AS created_at,
              settled,
              EXTRACT(EPOCH FROM settled_at)::bigint AS settled_at,
              settled_tx
       FROM refund_queue
       ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    )
    return NextResponse.json({ refunds: result.rows })
  } catch (err) {
    console.error("refund_queue list failed:", err)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
