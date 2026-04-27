import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, createWalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { requireAdmin } from "@/lib/auth"
import { getOptionalServerEnv } from "@/lib/env"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { serverHttp } from "@/lib/server-rpc"

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = body.action
  if (action !== "pause" && action !== "unpause") {
    return NextResponse.json({ error: "action must be 'pause' or 'unpause'" }, { status: 400 })
  }

  const env = getOptionalServerEnv()
  if (!env.ownerPrivateKey) {
    return NextResponse.json(
      { error: "OWNER_PRIVATE_KEY not configured on server" },
      { status: 503 },
    )
  }

  const owner = privateKeyToAccount(env.ownerPrivateKey)
  const publicClient = createPublicClient({ chain: tempoChain, transport: serverHttp() })
  const walletClient = createWalletClient({ chain: tempoChain, transport: serverHttp(), account: owner })

  // Pre-flight: check current paused state + pause-count cap so we fail fast with a clean error.
  try {
    const [isPaused, pauseCount, maxPauses] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "paused",
      }) as Promise<boolean>,
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "pauseCount",
      }) as Promise<bigint>,
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "MAX_PAUSES",
      }) as Promise<bigint>,
    ])

    if (action === "pause") {
      if (isPaused) {
        return NextResponse.json({ error: "Already paused" }, { status: 409 })
      }
      if (pauseCount >= maxPauses) {
        return NextResponse.json(
          { error: `Pause limit reached (${pauseCount}/${maxPauses})` },
          { status: 409 },
        )
      }
    } else {
      if (!isPaused) {
        return NextResponse.json({ error: "Not currently paused" }, { status: 409 })
      }
    }

    const hash = await walletClient.writeContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: action === "pause" ? "emergencyPause" : "unpause",
      args: [],
    })

    // Wait for inclusion so the UI sees the new paused-state on next refresh.
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Transaction reverted", txHash: hash }, { status: 500 })
    }

    return NextResponse.json({ ok: true, action, txHash: hash, blockNumber: Number(receipt.blockNumber) })
  } catch (err) {
    console.error(`admin/pause ${action} failed:`, err)
    const message = err instanceof Error ? err.message.split("\n")[0] : `${action} failed`
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
