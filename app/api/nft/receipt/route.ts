// Client-triggered endpoint to persist an off-chain mint receipt for human
// mints (WL + public). The agent mint flow records receipts directly inside
// the MPP handler. Here, we accept only a txHash, re-fetch the receipt from
// chain, verify the Transfer event was emitted by our contract from the zero
// address, and persist {tokenId, txHash, blockNumber, recipient}. The client
// cannot inject anything — all data comes from the on-chain log.

import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, decodeEventLog, decodeFunctionData, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
import { recordMintReceipt, type MintKind } from "@/lib/receipts"

const ZERO = "0x0000000000000000000000000000000000000000"
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

const publicClient = createPublicClient({ chain: tempoChain, transport: http() })

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`receipt:${ip}`, 30, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  let body: { txHash?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const txHash = body.txHash
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: "txHash must be 0x + 64 hex" }, { status: 400 })
  }

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 30_000,
    })
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Tx reverted" }, { status: 400 })
    }

    let tokenId: bigint | null = null
    let recipient: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({
          abi: SENTINEL_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === "Transfer") {
          const args = decoded.args as { from: string; to: string; tokenId: bigint }
          if (args.from === ZERO) {
            tokenId = args.tokenId
            recipient = args.to
            break
          }
        }
      } catch {
        // not a Transfer event
      }
    }

    if (tokenId === null || recipient === null) {
      return NextResponse.json(
        { error: "No SentinelTEMPO mint Transfer found in tx" },
        { status: 400 },
      )
    }

    // Classify the mint by decoding the original tx input. We only accept
    // human-mint selectors here; the agent-mint route writes its own
    // receipt with kind = wl_agent / agent_public.
    let kind: MintKind | null = null
    try {
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })
      const decoded = decodeFunctionData({ abi: SENTINEL_ABI, data: tx.input })
      if (decoded.functionName === "mintWhitelist") kind = "wl_human"
      else if (decoded.functionName === "mintPublic") kind = "public_human"
    } catch {
      // Leave kind null if decoding fails — receipt is still useful.
    }

    await recordMintReceipt({
      tokenId,
      txHash,
      blockNumber: receipt.blockNumber,
      recipient,
      kind,
    })

    return NextResponse.json({
      ok: true,
      tokenId: Number(tokenId),
      blockNumber: Number(receipt.blockNumber),
      recipient,
    })
  } catch (err) {
    console.error("receipt persist failed:", err)
    const message = err instanceof Error ? err.message.split("\n")[0] : "Receipt failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
