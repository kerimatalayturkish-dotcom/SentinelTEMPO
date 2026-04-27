import { NextResponse } from "next/server"
import { Mppx, tempo } from "mppx/server"
import { Receipt } from "mppx"
import { privateKeyToAccount } from "viem/accounts"
import { createPublicClient, createWalletClient, decodeEventLog, http, keccak256, toBytes, type PublicClient } from "viem"
import { getTransaction } from "viem/actions"
import pool from "@/lib/db"
import { getServerEnv } from "@/lib/env"
import {
  tempoChain,
  NFT_CONTRACT_ADDRESS,
  PATHUSD_ADDRESS,
  Phase,
  AGENT_CHARGE_WL,
  AGENT_CHARGE_PUBLIC,
} from "@/lib/chain"
import {
  computeTraitHash,
  getTraitAttributes,
  validateTraits,
  type TraitSelection,
} from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"
import { sharpLimit, irysLimit } from "@/lib/concurrency"
import { SENTINEL_ABI } from "@/lib/contract"
import { getMerkleProof } from "@/lib/merkle"
import {
  assignNumber,
  formatNumber,
  isComboTaken,
  isTraitHashUsedOnChain,
  registerMinted,
  syncRegistry,
} from "@/lib/uniqueness"
import { withRecipientLock } from "@/lib/mutex"
import { recordMintReceipt } from "@/lib/receipts"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
import { pgStore } from "@/lib/mpp-store"

interface MintBody {
  recipient?: `0x${string}`
  traits?: TraitSelection
}

// ????????? Module-scope singletons ?????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
function buildMppx() {
  const env = getServerEnv()
  const publicClient: PublicClient = createPublicClient({
    chain: tempoChain,
    transport: http(),
  })
  const mppx = Mppx.create({
    methods: [
      tempo.charge({
        currency: PATHUSD_ADDRESS,
        recipient: env.treasuryWallet,
        feePayer: env.feePayerKey ? privateKeyToAccount(env.feePayerKey) : undefined,
        getClient: async () => publicClient,
        store: pgStore,
      }),
    ],
  })
  return { mppx, publicClient }
}

let _cached: ReturnType<typeof buildMppx> | null = null
function getMppx() {
  if (!_cached) _cached = buildMppx()
  return _cached
}

async function enqueueRefund(
  agent: `0x${string}`,
  amount: string,
  mppTx: string | null,
  reason: string,
) {
  try {
    await pool.query(
      `INSERT INTO refund_queue (agent, amount, mpp_tx, reason) VALUES ($1, $2, $3, $4)`,
      [agent.toLowerCase(), amount, mppTx, reason],
    )
  } catch (e) {
    console.error("Failed to enqueue refund:", e, { agent, amount, mppTx, reason })
  }
}

export async function POST(request: Request) {
  // ───── 0. Rate limit (cheap, additive guard) ─────────────────────────
  // Keeps spam from burning RPC quota or thrashing pre-flight reads.
  // Legitimate single-tx mints hit this once; MPP retry-after-402 stays
  // well under 20/min/IP.
  const ip = getClientIp(request)
  const rl = checkRateLimit(`mint:${ip}`, 20, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

  const env = getServerEnv()
  const serverAccount = privateKeyToAccount(env.serverPrivateKey)
  const { mppx, publicClient } = getMppx()

  const walletClient = createWalletClient({
    account: serverAccount,
    chain: tempoChain,
    transport: http(),
  })

  // ????????? 1. Parse & pre-flight validation (before MPP) ??????????????????????????????????????????
  const rawText = await request.clone().text()
  let body: MintBody
  try {
    body = JSON.parse(rawText) as MintBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { recipient, traits } = body
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 })
  }
  if (!traits || typeof traits !== "object") {
    return NextResponse.json({ error: "Missing traits" }, { status: 400 })
  }
  const validation = validateTraits(traits)
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid traits", details: validation.errors },
      { status: 400 },
    )
  }

  // Note: payer === recipient is enforced AFTER the charge in step 5
  // (we read the tx hash from the Payment-Receipt header, fetch the tx
  // on-chain, and compare `tx.from` to `recipient`).

  // ───── 2. Phase gate ─────────────────────────────────────────────────
  const phaseRaw = await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "currentPhase",
  })
  const phase = Number(phaseRaw)
  if (phase !== Phase.WHITELIST && phase !== Phase.AGENT_PUBLIC) {
    return NextResponse.json(
      { error: "Agent minting is not active in the current phase" },
      { status: 403 },
    )
  }
  const chargeAmount = phase === Phase.WHITELIST ? AGENT_CHARGE_WL : AGENT_CHARGE_PUBLIC

  // ????????? 3. Merkle + uniqueness ???????????????????????????????????????????????????????????????????????????????????????????????????????????????
  let proof: `0x${string}`[] = []
  if (phase === Phase.WHITELIST) {
    const p = await getMerkleProof(recipient)
    if (!p) {
      return NextResponse.json(
        { error: "Recipient address is not whitelisted" },
        { status: 403 },
      )
    }
    proof = p
  }

  const traitHash = computeTraitHash(traits)
  const [usedOnChain] = await Promise.all([
    isTraitHashUsedOnChain(traitHash),
    syncRegistry(),
  ])
  if (usedOnChain || isComboTaken(traitHash)) {
    return NextResponse.json(
      { error: "This trait combination has already been minted" },
      { status: 409 },
    )
  }

  // ????????? 4. Per-wallet + supply pre-checks ??????????????????????????????????????????????????????????????????????????????
  const [totalSupply, maxSupply, walletCheck] = await Promise.all([
    publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "totalSupply",
    }),
    publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS, abi: SENTINEL_ABI, functionName: "MAX_SUPPLY",
    }),
    phase === Phase.WHITELIST
      ? publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "wlMinted",
          args: [recipient],
        })
      : publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "agentMintCount",
          args: [recipient],
        }),
  ])
  if (BigInt(totalSupply as bigint) >= BigInt(maxSupply as bigint)) {
    return NextResponse.json({ error: "Sold out" }, { status: 409 })
  }
  if (phase === Phase.WHITELIST && walletCheck === true) {
    return NextResponse.json(
      { error: "Recipient has already minted their whitelist allocation" },
      { status: 409 },
    )
  }
  if (phase === Phase.AGENT_PUBLIC && BigInt(walletCheck as bigint) >= 5n) {
    return NextResponse.json(
      { error: "Recipient has reached the per-wallet agent mint cap" },
      { status: 409 },
    )
  }

  // ───── 5. MPP charge + serialized mint ───────────────────────────────
  // Idempotency key: deterministic over (recipient, traitHash, phase).
  // A client retrying with the same body will reuse the charge; a client
  // changing any field gets a fresh charge.
  const externalId = keccak256(
    toBytes(`${recipient.toLowerCase()}|${traitHash}|${phase}`),
  )

  // Drive MPP directly (mppx/server) instead of the mppx/nextjs sugar so
  // we can intercept the receipt and enforce payer === recipient before
  // doing any mint work. The behavior of the charge itself (challenge,
  // credential verification, replay store, fee payer) is identical.
  const intent = mppx.charge({ amount: chargeAmount, externalId })
  const result = await intent(request)
  if (result.status === 402) return result.challenge

  // Payment captured. Pull the tx hash out of the Payment-Receipt header
  // by attaching it to a throwaway Response (withReceipt is idempotent —
  // we'll attach it again to the real response below).
  const probe = result.withReceipt(new Response())
  const receiptHeader = probe.headers.get("Payment-Receipt")
  if (!receiptHeader) {
    // Defensive: status === 200 should always carry the header.
    return NextResponse.json(
      { error: "Internal: missing Payment-Receipt header" },
      { status: 500 },
    )
  }
  const mppReceipt = Receipt.deserialize(receiptHeader)
  const mppTxHash = mppReceipt.reference as `0x${string}`

  // ───── Enforce payer === recipient ───────────────────────────────────
  // mppx 0.5.5 does not surface the payer in the user handler, so we
  // resolve it ourselves from the on-chain transaction. If the agent paid
  // from a wallet other than the recipient, we refuse to mint and queue a
  // manual refund.
  let payer: `0x${string}`
  try {
    const tx = await getTransaction(publicClient, { hash: mppTxHash })
    payer = tx.from
  } catch (err) {
    console.error("Failed to fetch payer tx:", err)
    await enqueueRefund(recipient, chargeAmount, mppTxHash, "fetch_payer_failed")
    return result.withReceipt(
      NextResponse.json(
        { error: "Could not verify payer. Refund queued.", mppTxHash },
        { status: 500 },
      ),
    )
  }
  if (payer.toLowerCase() !== recipient.toLowerCase()) {
    await enqueueRefund(
      recipient,
      chargeAmount,
      mppTxHash,
      `payer_recipient_mismatch payer=${payer} recipient=${recipient}`,
    )
    return result.withReceipt(
      NextResponse.json(
        {
          error: "Recipient must equal payer. Refund queued.",
          payer,
          recipient,
          mppTxHash,
        },
        { status: 403 },
      ),
    )
  }

  // ───── Mint (serialized per recipient) ───────────────────────────────
  const innerResponse = await withRecipientLock(recipient, async () => {
      // Re-check phase: auto-advancement could have fired between the 402
      // challenge and the paid retry.
      const currentPhaseRaw = await publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "currentPhase",
      })
      if (Number(currentPhaseRaw) !== phase) {
        await enqueueRefund(
          recipient,
          chargeAmount,
          mppTxHash,
          `phase drift ${phase}->${Number(currentPhaseRaw)}`,
        )
        return NextResponse.json(
          {
            error: "Phase changed between charge and mint. Refund queued.",
            chargedPhase: phase,
            currentPhase: Number(currentPhaseRaw),
          },
          { status: 409 },
        )
      }

      // Re-check uniqueness inside the lock (authoritative).
      if (await isTraitHashUsedOnChain(traitHash)) {
        await enqueueRefund(
          recipient,
          chargeAmount,
          mppTxHash,
          "traitHash taken between charge and mint",
        )
        return NextResponse.json(
          { error: "Trait combo was taken before mint could complete. Refund queued." },
          { status: 409 },
        )
      }

      const number = assignNumber(traitHash)
      const displayNumber = formatNumber(number)

      let imageUrl: string
      let tokenURI: string
      try {
        const imageBuffer = await sharpLimit(() => composeImage(traits))
        imageUrl = await irysLimit(() => uploadImage(imageBuffer))
        const metadata = {
          name: `SentinelTEMPO #${displayNumber}`,
          description: "A Sentinel guarding the Tempo blockchain.",
          image: imageUrl,
          attributes: getTraitAttributes(traits),
          traitHash,
        }
        tokenURI = await irysLimit(() => uploadMetadata(metadata))
      } catch (err) {
        console.error("Irys/compose failed after charge:", err)
        await enqueueRefund(
          recipient,
          chargeAmount,
          mppTxHash,
          "irys_or_compose_failed",
        )
        return NextResponse.json(
          { error: "Upload failed. Refund queued." },
          { status: 500 },
        )
      }

      let txHash: `0x${string}`
      try {
        txHash = await walletClient.writeContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "mintForAgent",
          args: [recipient, proof, tokenURI, traitHash],
        })
      } catch (err) {
        const e = err as { message?: string; shortMessage?: string }
        const reason =
          e?.message?.match(/reverted with the following reason:\n(.+)\n/)?.[1] ||
          e?.shortMessage ||
          "Contract call failed"
        console.error("mintForAgent reverted:", reason)
        await enqueueRefund(recipient, chargeAmount, mppTxHash, `revert:${reason}`)
        return NextResponse.json(
          { error: reason, refundQueued: true },
          { status: 409 },
        )
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== "success") {
        await enqueueRefund(recipient, chargeAmount, mppTxHash, "tx_status_reverted")
        return NextResponse.json(
          { error: "Transaction reverted on-chain. Refund queued.", txHash },
          { status: 500 },
        )
      }

      registerMinted(traitHash, number)
      // Extract on-chain tokenId from the Transfer(from=0, to=recipient) log
      // and persist a receipt for off-chain joins (collection, /my-mints).
      let onChainTokenId: bigint | null = null
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
            if (args.from === "0x0000000000000000000000000000000000000000") {
              onChainTokenId = args.tokenId
              break
            }
          }
        } catch {
          // not a Transfer event, ignore
        }
      }

      if (onChainTokenId !== null) {
        try {
          await recordMintReceipt({
            tokenId: onChainTokenId,
            txHash,
            blockNumber: receipt.blockNumber,
            recipient,
            mppTx: mppTxHash,
            feePayer: env.feePayerKey
              ? privateKeyToAccount(env.feePayerKey).address
              : null,
            kind: phase === Phase.WHITELIST ? "wl_agent" : "agent_public",
          })
        } catch (err) {
          // Non-fatal — the mint succeeded on-chain, the receipt is just for
          // our off-chain UX. Log and move on.
          console.error("recordMintReceipt failed:", err)
        }
      } else {
        console.warn("mintForAgent: Transfer event not found in receipt", txHash)
      }

      return NextResponse.json({
        tokenId: displayNumber,
        onChainTokenId: onChainTokenId !== null ? Number(onChainTokenId) : null,
        tokenURI,
        imageUrl,
        txHash,
        blockNumber: Number(receipt.blockNumber),
        recipient,
        traits,
        traitHash,
      })
    })

  return result.withReceipt(innerResponse)
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}
