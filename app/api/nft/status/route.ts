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
  const rl = checkRateLimit(`status:${ip}`, 30, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  try {
    const [totalSupply, mintPhase] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "totalSupply",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "mintPhase",
      }),
    ])

    const phaseNames = ["closed", "whitelist", "public"]

    return NextResponse.json({
      totalSupply: Number(totalSupply),
      maxSupply: 10_000,
      remaining: 10_000 - Number(totalSupply),
      phase: phaseNames[Number(mintPhase)],
      prices: {
        whitelist: "5",
        public: "8",
        currency: "pathUSD",
      },
    })
  } catch (err) {
    console.error("Status check failed:", err)
    return NextResponse.json(
      { error: "Failed to fetch contract status" },
      { status: 500 },
    )
  }
}
