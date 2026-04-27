import { NextRequest, NextResponse } from "next/server"
import { isWhitelisted } from "@/lib/merkle"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`wl-check:${ip}`, 20, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const address = request.nextUrl.searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }

  return NextResponse.json({
    address: address.toLowerCase(),
    whitelisted: await isWhitelisted(address),
  })
}
