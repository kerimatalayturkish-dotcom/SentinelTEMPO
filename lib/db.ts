// Shared Postgres connection pool.
// Used by the live SentinelTEMPO mint flow (merkle proofs, refund queue) AND
// by the legacy @sentinel0-only quest/challenge modules.

import { Pool } from "pg"

const isProduction = process.env.NODE_ENV === "production"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isProduction && {
    ssl: { rejectUnauthorized: false },
  }),
})

export default pool
