import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(),
})

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`collection:${ip}`, 20, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "20")))

  try {
    const [totalSupply, maxSupply] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "totalSupply",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "MAX_SUPPLY",
      }),
    ])

    const total = Number(totalSupply)
    const max = Number(maxSupply)
    const start = (page - 1) * limit
    const end = Math.min(start + limit, total)

    if (start >= total) {
      return NextResponse.json({
        items: [],
        total,
        maxSupply: max,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      })
    }

    // Fetch tokenURI + owner for each token in the page range
    const tokenIds = Array.from({ length: end - start }, (_, i) => start + i)

    const items = await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
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

          // Fetch metadata from Irys. Bypass Next's fetch cache so a transient
          // Irys 5xx / propagation lag for a freshly minted token doesn't get
          // pinned for an hour. Retry once on failure.
          const fetchMetadata = async () => {
            try {
              const res = await fetch(tokenURI as string, { cache: "no-store" })
              if (res.ok) return await res.json()
            } catch {}
            return null
          }
          let metadata = await fetchMetadata()
          if (!metadata?.image) {
            metadata = (await fetchMetadata()) || metadata
          }

          return {
            tokenId,
            name: metadata?.name || `SentinelTEMPO #${tokenId}`,
            image: metadata?.image || null,
            attributes: metadata?.attributes || [],
            owner: owner as string,
            tokenURI: tokenURI as string,
          }
        } catch {
          return {
            tokenId,
            name: `SentinelTEMPO #${tokenId}`,
            image: null,
            attributes: [],
            owner: null,
            tokenURI: null,
          }
        }
      }),
    )

    return NextResponse.json({
      items,
      total,
      maxSupply: max,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error("Collection fetch failed:", err)
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 },
    )
  }
}
