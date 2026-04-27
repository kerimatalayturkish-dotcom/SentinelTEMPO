import { Store } from "mppx"
import pool from "./db"

type AtomicStore = Store.AtomicStore
type Change<V, R> = Store.Change<V, R>

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
export const pgStore: AtomicStore = {
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

  // Atomic read-modify-write required by mppx@0.6+ for replay protection.
  // Uses a transaction with SELECT ... FOR UPDATE so concurrent updates
  // on the same key serialize at the database.
  async update<R>(
    key: string,
    fn: (current: unknown | null) => Change<unknown, R>,
  ): Promise<R> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query<{ value: unknown }>(
        "SELECT value FROM mpp_store WHERE key = $1 FOR UPDATE",
        [key],
      )
      const current = rows.length === 0 ? null : rows[0]!.value
      const change = fn(current)
      if (change.op === "set") {
        await client.query(
          `INSERT INTO mpp_store (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, JSON.stringify(change.value)],
        )
      } else if (change.op === "delete") {
        await client.query("DELETE FROM mpp_store WHERE key = $1", [key])
      }
      await client.query("COMMIT")
      return change.result
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
      throw err
    } finally {
      client.release()
    }
  },
}
