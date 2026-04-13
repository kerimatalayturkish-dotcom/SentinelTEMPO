import { NextRequest, NextResponse } from "next/server"
import { findByTwitter, createEntry } from "@/lib/quest"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
import { lookupFollowers, TwitterLookupError } from "@/lib/twitter"

const MIN_FOLLOWERS = Number(process.env.MIN_FOLLOWER_COUNT ?? "50")

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

    // Check follower count
    let followerCount: number
    try {
      const twitterUser = await lookupFollowers(handle)
      followerCount = twitterUser.followers_count
    } catch (err) {
      if (err instanceof TwitterLookupError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status === 429 ? 429 : 400 }
        )
      }
      return NextResponse.json(
        { error: "Unable to verify Twitter account. Please try again later." },
        { status: 503 }
      )
    }

    if (followerCount < MIN_FOLLOWERS) {
      return NextResponse.json(
        {
          error: `Your Twitter account needs at least ${MIN_FOLLOWERS} followers to qualify for the whitelist.`,
          your_followers: followerCount,
          required: MIN_FOLLOWERS,
        },
        { status: 403 }
      )
    }

    const entry = await createEntry(handle)

    const phase = (process.env.QUEST_CODE_PREFIX ?? "S2").toUpperCase()

    // Phase 3: direct to math challenge before tweet
    if (phase === "S3") {
      return NextResponse.json({
        questId: entry.questId,
        code: entry.code,
        twitter: entry.twitter,
        phase: "S3",
        message:
          `Quest started (Phase 3)! First, solve the math challenge via POST /api/quest/challenge/start. ` +
          `After solving, post a public tweet from ${entry.twitter} containing the code "${entry.code}" ` +
          `and your finalAnswer. Then verify via POST /api/quest/verify.`,
        next: {
          action: "POST /api/quest/challenge/start",
          body: { questId: entry.questId },
        },
      })
    }

    // Phase 2 (default): direct to tweet
    return NextResponse.json({
      questId: entry.questId,
      code: entry.code,
      twitter: entry.twitter,
      phase: phase,
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
