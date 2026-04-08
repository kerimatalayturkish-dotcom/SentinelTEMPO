import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`collection-detail:${ip}`, 30, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)
  const { tokenId: tokenIdStr } = await params
  const tokenId = Number(tokenIdStr)

  if (isNaN(tokenId) || tokenId < 0) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400 })
  }

  try {
    const totalSupply = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "totalSupply",
    })

    if (tokenId >= Number(totalSupply)) {
      return NextResponse.json({ error: "Token does not exist" }, { status: 404 })
    }

    const [tokenURI, owner] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      }),
    ])

    let metadata = null
    try {
      const res = await fetch(tokenURI as string, { next: { revalidate: 3600 } })
      if (res.ok) metadata = await res.json()
    } catch {
      // metadata fetch failed
    }

    return NextResponse.json({
      tokenId,
      name: metadata?.name || `SentinelTEMPO #${tokenId}`,
      description: metadata?.description || null,
      image: metadata?.image || null,
      attributes: metadata?.attributes || [],
      owner: owner as string,
      tokenURI: tokenURI as string,
    })
  } catch (err) {
    console.error(`Token ${tokenId} fetch failed:`, err)
    return NextResponse.json(
      { error: "Failed to fetch token" },
      { status: 500 },
    )
  }
}
