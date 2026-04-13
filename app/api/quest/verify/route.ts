import { NextRequest, NextResponse } from "next/server"
import { findByQuestId, updateEntry, verifyTweetViaOEmbed, findChallengeByQuest } from "@/lib/quest"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`verify:${ip}`, 10, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const body = await req.json()
    const { questId, tweetUrl } = body as { questId?: string; tweetUrl?: string }

    if (!questId || !tweetUrl) {
      return NextResponse.json(
        { error: "Missing 'questId' or 'tweetUrl' in request body." },
        { status: 400 }
      )
    }

    // Validate tweet URL format
    if (
      !/^https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+\/?(\?.*)?$/.test(tweetUrl)
    ) {
      return NextResponse.json(
        { error: "Invalid tweet URL format. Expected: https://x.com/username/status/123456" },
        { status: 400 }
      )
    }

    const entry = await findByQuestId(questId)
    if (!entry) {
      return NextResponse.json({ error: "Quest not found." }, { status: 404 })
    }

    if (entry.verified) {
      return NextResponse.json({
        message: "Tweet already verified. Proceed to POST /api/quest/complete.",
        questId: entry.questId,
        next: {
          action: "POST /api/quest/complete",
          body: { questId: entry.questId, tempoAddress: "0x..." },
        },
      })
    }

    // Phase 3: require math challenge solved before verification
    const phase = (process.env.QUEST_CODE_PREFIX ?? "S2").toUpperCase()
    if (phase === "S3") {
      const challenge = await findChallengeByQuest(questId)
      if (!challenge || !challenge.solved) {
        return NextResponse.json(
          {
            error: "Math challenge not solved. Complete POST /api/quest/challenge/start first.",
            next: {
              action: "POST /api/quest/challenge/start",
              body: { questId },
            },
          },
          { status: 400 }
        )
      }
    }

    // Verify via oEmbed
    const result = await verifyTweetViaOEmbed(tweetUrl, entry.code, entry.twitter)

    if (!result.valid) {
      return NextResponse.json(
        {
          error: "Tweet verification failed.",
          reason: result.reason,
          hint: `Make sure the tweet is public, posted from ${entry.twitter}, and contains the code "${entry.code}".`,
        },
        { status: 422 }
      )
    }

    // Mark verified
    await updateEntry(questId, { tweetUrl, verified: true })

    return NextResponse.json({
      message: "Tweet verified successfully! Now submit your Tempo wallet address.",
      questId: entry.questId,
      verified: true,
      next: {
        action: "POST /api/quest/complete",
        body: { questId: entry.questId, tempoAddress: "0x..." },
      },
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
