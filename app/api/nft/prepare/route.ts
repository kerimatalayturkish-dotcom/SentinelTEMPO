import { NextRequest, NextResponse } from "next/server"
import { validateTraits, computeTraitHash, getTraitAttributes, type TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"
import { sharpLimit, irysLimit } from "@/lib/concurrency"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
import { buildMintChallenge, verifyAddressSignature } from "@/lib/sig"
import {
  assignNumber,
  formatNumber,
  isComboTaken,
  isTraitHashUsedOnChain,
  registerMinted,
  syncRegistry,
} from "@/lib/uniqueness"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"

interface PrepareBody {
  address?: `0x${string}`
  traitHash?: `0x${string}`
  nonce?: string
  signature?: `0x${string}`
  traits?: TraitSelection
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`prepare:${ip}`, 5, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  let body: PrepareBody
  try {
    body = (await request.json()) as PrepareBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { address, traitHash: claimedHash, nonce, signature, traits } = body

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }
  if (!signature || !/^0x[a-fA-F0-9]+$/.test(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }
  if (!nonce || typeof nonce !== "string" || nonce.length < 8 || nonce.length > 128) {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 })
  }
  if (!claimedHash || !/^0x[a-fA-F0-9]{64}$/.test(claimedHash)) {
    return NextResponse.json({ error: "Invalid traitHash" }, { status: 400 })
  }
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

  const serverHash = computeTraitHash(traits)
  if (serverHash.toLowerCase() !== claimedHash.toLowerCase()) {
    return NextResponse.json(
      { error: "traitHash does not match traits payload" },
      { status: 400 },
    )
  }

  const challenge = buildMintChallenge({
    address,
    traitHash: serverHash,
    nonce,
    chainId: tempoChain.id,
    contract: NFT_CONTRACT_ADDRESS,
  })
  const sigOk = await verifyAddressSignature({ address, message: challenge, signature })
  if (!sigOk) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 })
  }

  const [usedOnChain] = await Promise.all([
    isTraitHashUsedOnChain(serverHash),
    syncRegistry(),
  ])
  if (usedOnChain || isComboTaken(serverHash)) {
    return NextResponse.json(
      { error: "This trait combination has already been minted" },
      { status: 409 },
    )
  }

  const number = assignNumber(serverHash)
  const displayNumber = formatNumber(number)

  try {
    const imageBuffer = await sharpLimit(() => composeImage(traits))
    const imageUrl = await irysLimit(() => uploadImage(imageBuffer))

    const metadata = {
      name: `SentinelTEMPO #${displayNumber}`,
      description: "A Sentinel guarding the Tempo blockchain.",
      image: imageUrl,
      attributes: getTraitAttributes(traits),
      traitHash: serverHash,
    }
    const tokenURI = await irysLimit(() => uploadMetadata(metadata))

    registerMinted(serverHash, number)

    return NextResponse.json({ tokenURI, imageUrl, metadata, traitHash: serverHash })
  } catch (err) {
    console.error("Prepare failed:", err)
    return NextResponse.json(
      { error: "Failed to prepare NFT" },
      { status: 500 },
    )
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
