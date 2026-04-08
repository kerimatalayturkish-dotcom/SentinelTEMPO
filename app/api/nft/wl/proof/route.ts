import { NextRequest, NextResponse } from "next/server"
import { getMerkleProof, isWhitelisted } from "@/lib/whitelist"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`wl-proof:${ip}`, 20, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const address = request.nextUrl.searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }

  if (!isWhitelisted(address)) {
    return NextResponse.json({ error: "Address not whitelisted" }, { status: 404 })
  }

  return NextResponse.json({
    address: address.toLowerCase(),
    proof: getMerkleProof(address),
  })
}
