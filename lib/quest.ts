import crypto from "crypto"
import pool from "./db"

export interface QuestEntry {
  questId: string
  twitter: string
  code: string
  tweetUrl: string | null
  tempoAddress: string | null
  verified: boolean
  completedAt: string | null
  createdAt: string
}

function rowToEntry(row: Record<string, unknown>): QuestEntry {
  return {
    questId: row.quest_id as string,
    twitter: row.twitter as string,
    code: row.code as string,
    tweetUrl: (row.tweet_url as string) || null,
    tempoAddress: (row.tempo_address as string) || null,
    verified: row.verified as boolean,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  }
}

export function generateCode(): string {
  return "SQ-" + crypto.randomBytes(4).toString("hex").toUpperCase()
}

export async function findByQuestId(questId: string): Promise<QuestEntry | undefined> {
  const { rows } = await pool.query("SELECT * FROM quest_entries WHERE quest_id = $1", [questId])
  return rows[0] ? rowToEntry(rows[0]) : undefined
}

export async function findByTwitter(handle: string): Promise<QuestEntry | undefined> {
  const normalized = handle.toLowerCase().replace(/^@/, "")
  const { rows } = await pool.query(
    "SELECT * FROM quest_entries WHERE LOWER(REPLACE(twitter, '@', '')) = $1",
    [normalized]
  )
  return rows[0] ? rowToEntry(rows[0]) : undefined
}

export async function findByAddress(addr: string): Promise<QuestEntry | undefined> {
  const { rows } = await pool.query(
    "SELECT * FROM quest_entries WHERE LOWER(tempo_address) = $1",
    [addr.toLowerCase()]
  )
  return rows[0] ? rowToEntry(rows[0]) : undefined
}

export async function createEntry(twitter: string): Promise<QuestEntry> {
  const handle = twitter.startsWith("@") ? twitter : `@${twitter}`
  const code = generateCode()
  const { rows } = await pool.query(
    `INSERT INTO quest_entries (twitter, code) VALUES ($1, $2) RETURNING *`,
    [handle, code]
  )
  return rowToEntry(rows[0])
}

export async function updateEntry(
  questId: string,
  updates: Partial<QuestEntry>
): Promise<QuestEntry | null> {
  const setClauses: string[] = []
  const values: unknown[] = []
  let i = 1

  if (updates.tweetUrl !== undefined) {
    setClauses.push(`tweet_url = $${i++}`)
    values.push(updates.tweetUrl)
  }
  if (updates.tempoAddress !== undefined) {
    setClauses.push(`tempo_address = $${i++}`)
    values.push(updates.tempoAddress)
  }
  if (updates.verified !== undefined) {
    setClauses.push(`verified = $${i++}`)
    values.push(updates.verified)
  }
  if (updates.completedAt !== undefined) {
    setClauses.push(`completed_at = $${i++}`)
    values.push(updates.completedAt)
  }

  if (setClauses.length === 0) return (await findByQuestId(questId)) ?? null

  values.push(questId)
  const { rows } = await pool.query(
    `UPDATE quest_entries SET ${setClauses.join(", ")} WHERE quest_id = $${i} RETURNING *`,
    values
  )
  return rows[0] ? rowToEntry(rows[0]) : null
}

export async function verifyTweetViaOEmbed(
  tweetUrl: string,
  expectedCode: string,
  expectedHandle: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const oembed = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}`
    const res = await fetch(oembed, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      return { valid: false, reason: "Tweet not found or is not public" }
    }
    const data = await res.json()
    const html: string = data.html || ""
    const authorUrl: string = data.author_url || ""

    // Check author matches (exact path-end comparison, not substring)
    const normalizedHandle = expectedHandle.toLowerCase().replace(/^@/, "")
    const normalizedAuthorUrl = authorUrl.toLowerCase().replace(/\/+$/, "")
    if (!normalizedAuthorUrl.endsWith("/" + normalizedHandle)) {
      return { valid: false, reason: "Tweet author does not match registered handle" }
    }

    // Check code is present in tweet HTML
    if (!html.includes(expectedCode)) {
      return { valid: false, reason: "Tweet does not contain the verification code" }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: "Failed to verify tweet — network error or timeout" }
  }
}
