import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS, PHASE_NAMES } from "@/lib/chain"
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
    const [phaseInfoResult, isPaused, maxSupply, wlCap, agentCap] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "phaseInfo",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "paused",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "MAX_SUPPLY",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "WL_CAP",
      }),
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "AGENT_CAP",
      }),
    ])

    const [phase, phaseEndsAt, phaseRemaining, totalSupply, wlSupply, agentSupply] = phaseInfoResult as [
      number, bigint, bigint, bigint, bigint, bigint
    ]

    return NextResponse.json({
      totalSupply: Number(totalSupply),
      maxSupply: Number(maxSupply),
      remaining: Number(maxSupply) - Number(totalSupply),
      phase: PHASE_NAMES[Number(phase)] || "closed",
      phaseEndsAt: Number(phaseEndsAt),
      phaseRemaining: Number(phaseRemaining),
      wlSupply: Number(wlSupply),
      agentSupply: Number(agentSupply),
      humanSupply: Number(totalSupply) - Number(wlSupply) - Number(agentSupply),
      paused: isPaused,
      prices: {
        whitelist: "1",
        agent_public: "2",
        human_public: "3",
        currency: "pathUSD",
      },
      limits: {
        wl_per_wallet: 1,
        public_per_wallet: 5,
        wl_cap: Number(wlCap),
        agent_cap: Number(agentCap),
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
