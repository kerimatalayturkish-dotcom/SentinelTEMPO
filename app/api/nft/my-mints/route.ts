import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http, isAddress } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
import { getReceiptsForRecipient, recordMintReceipt } from "@/lib/receipts"

const publicClient = createPublicClient({ chain: tempoChain, transport: http() })
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`

// Returns the connected wallet's mints. Strategy:
// 1. Read the receipts table (covers anything we recorded at mint time).
// 2. Backfill from on-chain Transfer logs (to=address) within a 90k-block
//    lookback so legacy mints that pre-date the receipts table also appear.
//    Anything new found in the logs is opportunistically persisted.
// 3. Fetch tokenURI + metadata for each tokenId.
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`my-mints:${ip}`, 30, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const address = request.nextUrl.searchParams.get("address")
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Valid 0x… address required" }, { status: 400 })
  }
  const lower = address.toLowerCase()

  try {
    const cached = await getReceiptsForRecipient(lower).catch(() => [])
    const knownTokenIds = new Set(cached.map((r) => r.tokenId))

    // Backfill from chain logs
    const currentBlock = await publicClient.getBlockNumber()
    const fromBlock = currentBlock > 90_000n ? currentBlock - 90_000n : 0n
    const logs = await publicClient.getLogs({
      address: NFT_CONTRACT_ADDRESS,
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { type: "address", name: "from", indexed: true },
          { type: "address", name: "to", indexed: true },
          { type: "uint256", name: "tokenId", indexed: true },
        ],
      },
      args: { from: ZERO, to: address as `0x${string}` },
      fromBlock,
      toBlock: "latest",
    })

    const backfill = []
    for (const log of logs) {
      const args = log.args as { tokenId?: bigint }
      if (args.tokenId === undefined) continue
      const tokenId = Number(args.tokenId)
      if (knownTokenIds.has(tokenId)) continue
      backfill.push({
        tokenId,
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
        recipient: lower,
      })
    }

    // Persist backfill rows opportunistically (non-fatal on failure).
    for (const row of backfill) {
      recordMintReceipt({
        tokenId: row.tokenId,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        recipient: row.recipient,
      }).catch((err) => console.warn("backfill recordMintReceipt failed:", err))
    }

    const all = [
      ...cached.map((r) => ({
        tokenId: r.tokenId,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
      })),
      ...backfill.map((r) => ({
        tokenId: r.tokenId,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
      })),
    ].sort((a, b) => a.tokenId - b.tokenId)

    // Fetch tokenURI + metadata in parallel (capped at 50 to keep RPC sane).
    const enriched = await Promise.all(
      all.slice(0, 50).map(async (row) => {
        let tokenURI: string | null = null
        let image: string | null = null
        let name: string | null = null
        try {
          const uri = await publicClient.readContract({
            address: NFT_CONTRACT_ADDRESS,
            abi: SENTINEL_ABI,
            functionName: "tokenURI",
            args: [BigInt(row.tokenId)],
          })
          tokenURI = uri as string
          const res = await fetch(tokenURI, { next: { revalidate: 3600 } })
          if (res.ok) {
            const meta = await res.json()
            image = meta?.image ?? null
            name = meta?.name ?? null
          }
        } catch {
          // metadata fetch failed; return what we have
        }
        return {
          ...row,
          tokenURI,
          image,
          name: name ?? `SentinelTEMPO #${row.tokenId}`,
        }
      }),
    )

    return NextResponse.json({
      address: lower,
      count: enriched.length,
      mints: enriched,
      lookbackFromBlock: Number(fromBlock),
      lookbackToBlock: Number(currentBlock),
    })
  } catch (err) {
    console.error("/api/nft/my-mints failed:", err)
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
  }
}
