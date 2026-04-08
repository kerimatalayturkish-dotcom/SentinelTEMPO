import { Pool } from "pg"

const isProduction = process.env.NODE_ENV === "production"

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/sentinel_tempo",
  ...(isProduction && {
    ssl: { rejectUnauthorized: false },
  }),
})

export default pool
