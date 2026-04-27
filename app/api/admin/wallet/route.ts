import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http, isAddress, getAddress, formatUnits } from "viem"
import { requireAdmin } from "@/lib/auth"
import { tempoChain, NFT_CONTRACT_ADDRESS, PATHUSD_ADDRESS, PATHUSD_DECIMALS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { getMintReceipt } from "@/lib/receipts"

const publicClient = createPublicClient({ chain: tempoChain, transport: http() })

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`
// keccak256("Transfer(address,address,uint256)") — standard TIP-20/ERC-20.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const raw = url.searchParams.get("address")
  if (!raw || !isAddress(raw)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }
  const address = getAddress(raw)

  try {
    // Per-wallet counters from the contract.
    const [wlMinted, agentCount, humanCount, currentBlock] = await Promise.all([
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "wlMinted",
        args: [address],
      }) as Promise<boolean>,
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "agentMintCount",
        args: [address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "humanMintCount",
        args: [address],
      }) as Promise<bigint>,
      publicClient.getBlockNumber(),
    ])

    // Mint events for this wallet (Transfer with from = 0x0, to = address).
    // 90k-block lookback matches the collection-detail endpoint.
    const fromBlock = currentBlock > 90_000n ? currentBlock - 90_000n : 0n
    const mintLogs = await publicClient.getLogs({
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
      args: { from: ZERO, to: address },
      fromBlock,
      toBlock: "latest",
    })

    // Resolve block timestamps (unique blocks only).
    const uniqueBlocks = Array.from(new Set(mintLogs.map((l) => l.blockNumber)))
    const blockMap = new Map<bigint, number>()
    await Promise.all(
      uniqueBlocks.map(async (bn) => {
        try {
          const blk = await publicClient.getBlock({ blockNumber: bn })
          blockMap.set(bn, Number(blk.timestamp))
        } catch {
          blockMap.set(bn, 0)
        }
      }),
    )

    // Treasury address — needed to identify pathUSD payments inside each
    // mint tx (human path) and to fetch the corresponding MPP charge tx
    // (agent path) for the treasury-receive line.
    const treasury = (await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "treasury",
    })) as `0x${string}`

    // Per-mint enrichment: fetch receipt + tx for each mint, decode pathUSD
    // payment from the mint tx logs (human), and pull the MPP charge tx +
    // fee payer from mint_receipts (agent). All numbers are derived from
    // chain data; mint_receipts is only used to retrieve the MPP tx hash
    // recorded at mint time.
    const enriched = await Promise.all(
      mintLogs.map(async (log) => {
        const tokenId = Number(log.args.tokenId)
        const baseTxHash = log.transactionHash
        const blockNumber = Number(log.blockNumber)
        const mintedAt = blockMap.get(log.blockNumber) ?? 0

        // Fetch mint tx + receipt + db row in parallel.
        const [txReceipt, dbReceipt] = await Promise.all([
          publicClient
            .getTransactionReceipt({ hash: baseTxHash })
            .catch(() => null),
          getMintReceipt(tokenId).catch(() => null),
        ])

        const mintSigner = txReceipt?.from ?? null

        // Find pathUSD Transfer (sender → treasury) within this mint tx.
        // For human mints, this is the in-tx pathUSD pull. For agent mints,
        // there should be NO such transfer in the mint tx (the contract
        // does not pull pathUSD on mintForAgent). We still parse to be
        // certain.
        let inTxPayment: {
          from: `0x${string}`
          to: `0x${string}`
          amount: string
        } | null = null
        if (txReceipt) {
          for (const l of txReceipt.logs) {
            if (l.address.toLowerCase() !== PATHUSD_ADDRESS.toLowerCase()) continue
            if (l.topics[0] !== TRANSFER_TOPIC) continue
            try {
              // Decode indexed from/to + value.
              const fromTopic = l.topics[1]
              const toTopic = l.topics[2]
              if (!fromTopic || !toTopic) continue
              const from = (`0x${fromTopic.slice(26)}`) as `0x${string}`
              const to = (`0x${toTopic.slice(26)}`) as `0x${string}`
              if (to.toLowerCase() !== treasury.toLowerCase()) continue
              const amount = BigInt(l.data)
              inTxPayment = {
                from,
                to,
                amount: formatUnits(amount, PATHUSD_DECIMALS),
              }
              break
            } catch {
              // ignore decode failure
            }
          }
        }

        // For agent mints, pull the MPP charge tx + fee payer recorded by
        // the mint route. Verify on-chain by re-fetching that tx and
        // confirming it carries a pathUSD Transfer to the treasury.
        let mppPayment:
          | {
              txHash: string
              from: `0x${string}` | null
              feePayer: string | null
              amount: string | null
            }
          | null = null
        if (dbReceipt?.mppTx) {
          const mppRcpt = await publicClient
            .getTransactionReceipt({ hash: dbReceipt.mppTx as `0x${string}` })
            .catch(() => null)
          let mppAmount: string | null = null
          let mppFrom: `0x${string}` | null = mppRcpt?.from ?? null
          if (mppRcpt) {
            for (const l of mppRcpt.logs) {
              if (l.address.toLowerCase() !== PATHUSD_ADDRESS.toLowerCase()) continue
              if (l.topics[0] !== TRANSFER_TOPIC) continue
              const toTopic = l.topics[2]
              if (!toTopic) continue
              const to = (`0x${toTopic.slice(26)}`) as `0x${string}`
              if (to.toLowerCase() !== treasury.toLowerCase()) continue
              try {
                mppAmount = formatUnits(BigInt(l.data), PATHUSD_DECIMALS)
              } catch {
                /* ignore */
              }
              break
            }
          }
          mppPayment = {
            txHash: dbReceipt.mppTx,
            from: mppFrom,
            feePayer: dbReceipt.feePayer ?? null,
            amount: mppAmount,
          }
        }

        // Derive kind: prefer the value recorded at mint time. Fall back
        // to a chain-derived guess (agent if mint signer is server wallet
        // and there's no in-tx pathUSD payment; otherwise human).
        const kind =
          dbReceipt?.kind ??
          (mppPayment
            ? "agent_public"
            : inTxPayment
              ? "public_human"
              : null)

        return {
          tokenId,
          mintTxHash: baseTxHash,
          mintSigner,
          blockNumber,
          mintedAt,
          kind,
          treasuryReceive: mppPayment
            ? {
                txHash: mppPayment.txHash,
                payer: mppPayment.from,
                feePayer: mppPayment.feePayer,
                amount: mppPayment.amount,
                source: "mpp" as const,
              }
            : inTxPayment
              ? {
                  txHash: baseTxHash, // same tx as mint
                  payer: inTxPayment.from,
                  feePayer: null,
                  amount: inTxPayment.amount,
                  source: "in_mint_tx" as const,
                }
              : null,
        }
      }),
    )

    const mints = enriched.sort((a, b) => a.tokenId - b.tokenId)

    return NextResponse.json({
      address,
      counters: {
        wlMinted,
        agentMints: Number(agentCount),
        humanMints: Number(humanCount),
        totalMints: mints.length,
      },
      mints,
      lookbackFromBlock: Number(fromBlock),
      lookbackToBlock: Number(currentBlock),
    })
  } catch (err) {
    console.error("admin/wallet lookup failed:", err)
    const message = err instanceof Error ? err.message.split("\n")[0] : "Lookup failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
