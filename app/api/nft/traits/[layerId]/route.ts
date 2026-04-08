import { NextRequest, NextResponse } from "next/server"
import { getLayer } from "@/lib/traits"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layerId: string }> }
) {
  const { layerId } = await params
  const layer = getLayer(layerId)

  if (!layer) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 })
  }

  return NextResponse.json(layer)
}
