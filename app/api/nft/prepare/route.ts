import { NextRequest, NextResponse } from "next/server"
import { validateTraits, getTraitAttributes, type TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`prepare:${ip}`, 5, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const { traits, tokenIndex } = await request.json()

    const validation = validateTraits(traits as TraitSelection)
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid traits", details: validation.errors },
        { status: 400 },
      )
    }

    const imageBuffer = await composeImage(traits)
    const imageUrl = await uploadImage(imageBuffer)

    const metadata = {
      name: `SentinelTEMPO #${tokenIndex ?? "?"}`,
      description: "A Sentinel guarding the Tempo blockchain.",
      image: imageUrl,
      attributes: getTraitAttributes(traits),
    }
    const tokenURI = await uploadMetadata(metadata)

    return NextResponse.json({ tokenURI, imageUrl, metadata })
  } catch (err) {
    console.error("Prepare failed:", err)
    return NextResponse.json(
      { error: "Failed to prepare NFT" },
      { status: 500 },
    )
  }
}
