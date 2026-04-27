import { NextRequest, NextResponse } from "next/server"
import pool from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

const TX_RE = /^0x[0-9a-fA-F]{64}$/

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: unknown; settledTx?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const settledTx = body.settledTx
  if (settledTx !== undefined && settledTx !== null && settledTx !== "") {
    if (typeof settledTx !== "string" || !TX_RE.test(settledTx)) {
      return NextResponse.json({ error: "Invalid settledTx (expect 0x + 64 hex)" }, { status: 400 })
    }
  }

  const txValue = typeof settledTx === "string" && settledTx.length > 0 ? settledTx : null

  try {
    const result = await pool.query(
      `UPDATE refund_queue
         SET settled = true,
             settled_at = COALESCE(settled_at, now()),
             settled_tx = COALESCE(settled_tx, $2)
       WHERE id = $1
       RETURNING id, settled, EXTRACT(EPOCH FROM settled_at)::bigint AS settled_at, settled_tx`,
      [id, txValue],
    )
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true, refund: result.rows[0] })
  } catch (err) {
    console.error("refund settle failed:", err)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
