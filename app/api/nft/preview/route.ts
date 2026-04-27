import { NextRequest, NextResponse } from "next/server"
import { validateTraits, type TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { sharpLimit } from "@/lib/concurrency"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`preview:${ip}`, 10, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const traits = (body as { traits?: TraitSelection } | null)?.traits
  if (!traits || typeof traits !== "object") {
    return NextResponse.json({ error: "Missing traits object" }, { status: 400 })
  }

  const validation = validateTraits(traits)
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid traits", details: validation.errors },
      { status: 400 },
    )
  }

  const imageBuffer = await sharpLimit(() => composeImage(traits))

  return new NextResponse(new Uint8Array(imageBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
