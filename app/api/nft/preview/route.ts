import { NextRequest, NextResponse } from "next/server"
import { validateTraits, TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`preview:${ip}`, 10, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const body = await request.json()
  const traits: TraitSelection = body.traits

  if (!traits || typeof traits !== "object") {
    return NextResponse.json({ error: "Missing traits object" }, { status: 400 })
  }

  const validation = validateTraits(traits)
  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid traits", details: validation.errors }, { status: 400 })
  }

  const imageBuffer = await composeImage(traits)

  return new NextResponse(new Uint8Array(imageBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  })
}
