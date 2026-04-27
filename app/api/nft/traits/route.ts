import { NextResponse } from "next/server"
import { getTraitCatalog } from "@/lib/traits"

export async function GET() {
  return NextResponse.json(getTraitCatalog(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600, immutable",
    },
  })
}