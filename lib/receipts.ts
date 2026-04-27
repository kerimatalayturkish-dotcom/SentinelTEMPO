// Off-chain mint receipts (Option B for G3). The on-chain tokenURI is locked
// to the Irys metadata that was pinned BEFORE the mint tx existed, so the
// canonical metadata cannot carry the source tx hash. We persist
// {tokenId, txHash, blockNumber, recipient, mintedAt} here at mint time and
// join it back in the collection/detail/My Mints surfaces.

import pool from "@/lib/db"

export type MintKind = "wl_human" | "public_human" | "wl_agent" | "agent_public"

export interface MintReceipt {
  tokenId: number
  txHash: string
  blockNumber: number
  recipient: string
  mintedAt: number // unix seconds
  mppTx: string | null
  feePayer: string | null
  kind: MintKind | null
}

export async function recordMintReceipt(input: {
  tokenId: number | bigint
  txHash: string
  blockNumber: number | bigint
  recipient: string
  mppTx?: string | null
  feePayer?: string | null
  kind?: MintKind | null
}): Promise<void> {
  const tokenId = Number(input.tokenId)
  const blockNumber = Number(input.blockNumber)
  const recipient = input.recipient.toLowerCase()
  await pool.query(
    `INSERT INTO mint_receipts (token_id, tx_hash, block_number, recipient, mpp_tx, fee_payer, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token_id) DO UPDATE SET
       mpp_tx    = COALESCE(mint_receipts.mpp_tx,    EXCLUDED.mpp_tx),
       fee_payer = COALESCE(mint_receipts.fee_payer, EXCLUDED.fee_payer),
       kind      = COALESCE(mint_receipts.kind,      EXCLUDED.kind)`,
    [
      tokenId,
      input.txHash,
      blockNumber,
      recipient,
      input.mppTx ?? null,
      input.feePayer ? input.feePayer.toLowerCase() : null,
      input.kind ?? null,
    ],
  )
}

export async function getMintReceipt(tokenId: number): Promise<MintReceipt | null> {
  const result = await pool.query(
    `SELECT token_id, tx_hash, block_number, recipient, mpp_tx, fee_payer, kind,
            EXTRACT(EPOCH FROM minted_at)::bigint AS minted_at
       FROM mint_receipts WHERE token_id = $1`,
    [tokenId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    tokenId: Number(row.token_id),
    txHash: row.tx_hash,
    blockNumber: Number(row.block_number),
    recipient: row.recipient,
    mintedAt: Number(row.minted_at),
    mppTx: row.mpp_tx ?? null,
    feePayer: row.fee_payer ?? null,
    kind: row.kind ?? null,
  }
}

export async function getReceiptsForRecipient(
  recipient: string,
  limit = 100,
): Promise<MintReceipt[]> {
  const result = await pool.query(
    `SELECT token_id, tx_hash, block_number, recipient, mpp_tx, fee_payer, kind,
            EXTRACT(EPOCH FROM minted_at)::bigint AS minted_at
       FROM mint_receipts WHERE recipient = $1
       ORDER BY token_id ASC LIMIT $2`,
    [recipient.toLowerCase(), limit],
  )
  return result.rows.map((row) => ({
    tokenId: Number(row.token_id),
    txHash: row.tx_hash,
    blockNumber: Number(row.block_number),
    recipient: row.recipient,
    mintedAt: Number(row.minted_at),
    mppTx: row.mpp_tx ?? null,
    feePayer: row.fee_payer ?? null,
    kind: row.kind ?? null,
  }))
}
