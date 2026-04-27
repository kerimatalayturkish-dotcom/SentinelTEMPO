import { NextResponse } from "next/server"
import { createPublicClient, formatUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import pool from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { getOptionalServerEnv } from "@/lib/env"
import {
  tempoChain,
  NFT_CONTRACT_ADDRESS,
  PATHUSD_ADDRESS,
  PATHUSD_DECIMALS,
  PHASE_NAMES,
} from "@/lib/chain"
import { SENTINEL_ABI, PATHUSD_ABI } from "@/lib/contract"
import { serverHttp } from "@/lib/server-rpc"

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: serverHttp(),
})

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Read everything in parallel ??? one RPC round trip.
    const [
      phaseInfoResult,
      isPaused,
      pausedAt,
      totalPausedDuration,
      pauseCount,
      mintStartTime,
      wlEndTime,
      agentEndTime,
      merkleRoot,
      maxSupply,
      wlCap,
      agentCap,
      wlPrice,
      humanPrice,
      wlMaxPerWallet,
      publicMaxPerWallet,
      maxPauses,
      treasury,
    ] = await Promise.all([
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "phaseInfo" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "paused" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "pausedAt" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "totalPausedDuration" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "pauseCount" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "mintStartTime" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "wlEndTime" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "agentEndTime" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "merkleRoot" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "MAX_SUPPLY" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "WL_CAP" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "AGENT_CAP" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "WL_PRICE" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "HUMAN_PRICE" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "WL_MAX_PER_WALLET" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "PUBLIC_MAX_PER_WALLET" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "MAX_PAUSES" }),
      publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "treasury" }),
    ])

    const [phase, phaseEndsAt, phaseRemaining, totalSupply, wlSupply, agentSupply] =
      phaseInfoResult as [number, bigint, bigint, bigint, bigint, bigint]

    // Derive server wallet address without requiring the key be configured.
    const env = getOptionalServerEnv()
    const serverAddress = env.serverPrivateKey
      ? privateKeyToAccount(env.serverPrivateKey).address
      : null
    const ownerAddress = env.ownerPrivateKey
      ? privateKeyToAccount(env.ownerPrivateKey).address
      : null

    // Balances (best-effort ??? don't fail the whole endpoint if RPC hiccups).
    const [treasuryPathUsd, serverPathUsd] = await Promise.all([
      publicClient
        .readContract({
          address: PATHUSD_ADDRESS,
          abi: PATHUSD_ABI,
          functionName: "balanceOf",
          args: [treasury as `0x${string}`],
        })
        .catch(() => null),
      serverAddress
        ? publicClient
            .readContract({
              address: PATHUSD_ADDRESS,
              abi: PATHUSD_ABI,
              functionName: "balanceOf",
              args: [serverAddress],
            })
            .catch(() => null)
        : Promise.resolve(null),
    ])

    // Refund queue stats (Postgres).
    let refundUnsettled = 0
    let refundTotal = 0
    try {
      const { rows } = await pool.query<{ unsettled: string; total: string }>(
        `SELECT
          COUNT(*) FILTER (WHERE settled = false) AS unsettled,
          COUNT(*) AS total
        FROM refund_queue`,
      )
      refundUnsettled = Number(rows[0]?.unsettled ?? 0)
      refundTotal = Number(rows[0]?.total ?? 0)
    } catch (e) {
      console.error("refund_queue query failed:", e)
    }

    const maxN = Number(maxSupply as bigint)
    const wlCapN = Number(wlCap as bigint)
    const agentCapN = Number(agentCap as bigint)
    const totalN = Number(totalSupply)
    const wlN = Number(wlSupply)
    const agentN = Number(agentSupply)

    return NextResponse.json({
      contract: {
        address: NFT_CONTRACT_ADDRESS,
        treasury,
        serverMinter: serverAddress,
        ownerSigner: ownerAddress,
        ownerConfigured: ownerAddress !== null,
        merkleRoot,
        phase: PHASE_NAMES[Number(phase)] || "closed",
        phaseIndex: Number(phase),
        phaseEndsAt: Number(phaseEndsAt),
        phaseRemaining: Number(phaseRemaining),
        paused: isPaused,
        pausedAt: Number(pausedAt),
        totalPausedDuration: Number(totalPausedDuration),
        pauseCount: Number(pauseCount),
        maxPauses: Number(maxPauses),
        mintStartTime: Number(mintStartTime),
        wlEndTime: Number(wlEndTime),
        agentEndTime: Number(agentEndTime),
      },
      constants: {
        maxSupply: maxN,
        wlCap: wlCapN,
        agentCap: agentCapN,
        humanCap: maxN - wlCapN - agentCapN,
        wlPrice: formatUnits(wlPrice as bigint, PATHUSD_DECIMALS),
        humanPrice: formatUnits(humanPrice as bigint, PATHUSD_DECIMALS),
        wlMaxPerWallet: Number(wlMaxPerWallet as bigint),
        publicMaxPerWallet: Number(publicMaxPerWallet as bigint),
      },
      supply: {
        total: totalN,
        max: maxN,
        wl: wlN,
        wlCap: wlCapN,
        agent: agentN,
        agentCap: agentCapN,
        human: totalN - wlN - agentN,
        remaining: maxN - totalN,
      },
      balances: {
        treasuryPathUsd:
          treasuryPathUsd !== null
            ? formatUnits(treasuryPathUsd as bigint, PATHUSD_DECIMALS)
            : null,
        serverPathUsd:
          serverPathUsd !== null
            ? formatUnits(serverPathUsd as bigint, PATHUSD_DECIMALS)
            : null,
      },
      refundQueue: {
        unsettled: refundUnsettled,
        total: refundTotal,
      },
      timing: {
        now: Math.floor(Date.now() / 1000),
        mintStarted: Number(mintStartTime) > 0,
        wlEnded: Number(wlEndTime) > 0,
        agentEnded: Number(agentEndTime) > 0,
      },
    })
  } catch (err) {
    console.error("Admin status failed:", err)
    return NextResponse.json(
      { error: "Failed to fetch contract status" },
      { status: 500 },
    )
  }
}