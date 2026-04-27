import type { Store } from "mppx"
import pool from "./db"

/**
 * Postgres-backed implementation of mppx's Store interface.
 *
 * Used by `tempo.charge({ store: pgStore })` to persist consumed credential
 * hashes across server restarts and (eventually) across multiple instances.
 *
 * mppx writes one row per consumed credential under the key
 * "mppx:charge:<txhash>"; values are JSON-roundtripped (see Store.memory()
 * comment in mppx). On reads, missing rows return null.
 *
 * Failure semantics: any thrown error propagates up into mppx's verify()
 * pipeline, which returns 402 to the agent without capturing payment. This
 * matches the in-memory store's failure surface.
 */
export const pgStore: Store = {
  async get(key: string) {
    const { rows } = await pool.query<{ value: unknown }>(
      "SELECT value FROM mpp_store WHERE key = $1",
      [key],
    )
    if (rows.length === 0) return null
    return rows[0]!.value
  },

  async put(key: string, value: unknown) {
    await pool.query(
      `INSERT INTO mpp_store (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    )
  },

  async delete(key: string) {
    await pool.query("DELETE FROM mpp_store WHERE key = $1", [key])
  },
}
