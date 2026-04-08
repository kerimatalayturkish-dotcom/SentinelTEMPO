import { NextRequest, NextResponse } from "next/server"
import { findByTwitter, createEntry } from "@/lib/quest"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`start:${ip}`, 5, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const body = await req.json()
    const twitter: string | undefined = body.twitter

    if (!twitter || typeof twitter !== "string" || twitter.trim().length < 2) {
      return NextResponse.json(
        { error: "Missing or invalid 'twitter' field. Provide your X/Twitter handle, e.g. '@myhandle'." },
        { status: 400 }
      )
    }

    const handle = twitter.trim()

    // Validate Twitter handle format
    if (!/^@?[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return NextResponse.json(
        { error: "Invalid Twitter handle format. Must be 1-15 alphanumeric/underscore characters, optionally prefixed with @." },
        { status: 400 }
      )
    }

    // Check if handle already registered
    const existing = await findByTwitter(handle)
    if (existing) {
      return NextResponse.json(
        {
          error: "This Twitter handle already has a quest. If this is you, use the questId from your original /start response.",
          hint: existing.verified
            ? "Tweet already verified. Proceed to POST /api/quest/complete with your tempoAddress."
            : "Submit your tweet URL to POST /api/quest/verify.",
        },
        { status: 409 }
      )
    }

    const entry = await createEntry(handle)

    return NextResponse.json({
      questId: entry.questId,
      code: entry.code,
      twitter: entry.twitter,
      message:
        `Quest started! Now post a public tweet from ${entry.twitter} containing the code "${entry.code}" ` +
        `and the word "SentinelTEMPO". Then submit the tweet URL to POST /api/quest/verify.`,
      next: {
        action: "POST /api/quest/verify",
        body: { questId: entry.questId, tweetUrl: "https://x.com/..." },
      },
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
