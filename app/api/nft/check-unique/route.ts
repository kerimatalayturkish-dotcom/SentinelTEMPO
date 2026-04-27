import { NextRequest, NextResponse } from "next/server"
import { validateTraits, computeTraitHash, type TraitSelection } from "@/lib/traits"
import {
  assignNumber,
  formatNumber,
  isComboTaken,
  isTraitHashUsedOnChain,
  syncRegistry,
} from "@/lib/uniqueness"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`check-unique:${ip}`, 30, 60_000)
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

  const traitHash = computeTraitHash(traits)

  // On-chain is authoritative; local registry is a hint for the number.
  const [usedOnChain] = await Promise.all([
    isTraitHashUsedOnChain(traitHash),
    syncRegistry(),
  ])

  const taken = usedOnChain || isComboTaken(traitHash)
  const number = assignNumber(traitHash)

  return NextResponse.json({
    unique: !taken,
    number: formatNumber(number),
    name: `SentinelTEMPO #${formatNumber(number)}`,
    traitHash,
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
