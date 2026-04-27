import pool from "./db"

/**
 * Postgres-backed Merkle proof lookup.
 *
 * Schema (see /memories/session/fix-plan-execution.md):
 *
 *   CREATE TABLE merkle_proofs (
 *     address TEXT PRIMARY KEY,
 *     proof JSONB,
 *     root TEXT,
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   CREATE TABLE merkle_meta (
 *     id INT PRIMARY KEY DEFAULT 1,
 *     root TEXT,
 *     leaf_count INT,
 *     generated_at TIMESTAMPTZ,
 *     CHECK (id = 1)
 *   );
 *
 * Replaces the previous 1.5MB `merkle-proofs.json` bundle so we don't
 * ship every proof in the client bundle.
 */

export interface MerkleMeta {
  root: `0x${string}`
  leafCount: number
  generatedAt: Date
}

/**
 * Look up the Merkle proof for an address. Returns `null` if the
 * address is not whitelisted.
 */
export async function getMerkleProof(
  address: string,
): Promise<`0x${string}`[] | null> {
  const addr = address.toLowerCase()
  const { rows } = await pool.query<{ proof: string[] }>(
    "SELECT proof FROM merkle_proofs WHERE address = $1 LIMIT 1",
    [addr],
  )
  if (rows.length === 0) return null
  return rows[0].proof as `0x${string}`[]
}

/** Check if an address is whitelisted (cheaper than fetching the proof). */
export async function isWhitelisted(address: string): Promise<boolean> {
  const addr = address.toLowerCase()
  const { rows } = await pool.query(
    "SELECT 1 FROM merkle_proofs WHERE address = $1 LIMIT 1",
    [addr],
  )
  return rows.length > 0
}

/** Fetch the current tree metadata (root + leaf count). */
export async function getMerkleMeta(): Promise<MerkleMeta | null> {
  const { rows } = await pool.query<{
    root: string
    leaf_count: number
    generated_at: Date
  }>("SELECT root, leaf_count, generated_at FROM merkle_meta WHERE id = 1")
  if (rows.length === 0) return null
  return {
    root: rows[0].root as `0x${string}`,
    leafCount: rows[0].leaf_count,
    generatedAt: rows[0].generated_at,
  }
}

/**
 * Replace the whole tree atomically. Called by `scripts/generate-merkle.ts`
 * after it regenerates root + proofs from `config/whitelist.json`.
 */
export async function replaceMerkleTree(
  root: `0x${string}`,
  proofs: Record<string, `0x${string}`[]>,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM merkle_proofs")

    const entries = Object.entries(proofs)
    // Bulk-insert in batches to avoid PostgreSQL's 64K-parameter ceiling
    // (each row uses 3 params, so cap rows-per-statement at ~10K to be safe).
    const ROWS_PER_BATCH = 500
    for (let i = 0; i < entries.length; i += ROWS_PER_BATCH) {
      const batch = entries.slice(i, i + ROWS_PER_BATCH)
      const values: unknown[] = []
      const placeholders: string[] = []
      batch.forEach(([address, proof], j) => {
        const base = j * 3
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
        values.push(address.toLowerCase(), JSON.stringify(proof), root)
      })
      await client.query(
        `INSERT INTO merkle_proofs (address, proof, root) VALUES ${placeholders.join(", ")}`,
        values,
      )
    }

    await client.query(
      `INSERT INTO merkle_meta (id, root, leaf_count, generated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE
         SET root = EXCLUDED.root,
             leaf_count = EXCLUDED.leaf_count,
             generated_at = EXCLUDED.generated_at`,
      [root, entries.length],
    )

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}
