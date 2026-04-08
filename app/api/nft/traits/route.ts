import { NextResponse } from "next/server"
import { getTraitCatalog } from "@/lib/traits"

export async function GET() {
  return NextResponse.json(getTraitCatalog())
}
