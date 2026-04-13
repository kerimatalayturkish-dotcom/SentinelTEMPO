import { NextRequest, NextResponse } from "next/server"
import { findByQuestId, findChallengeByQuest } from "@/lib/quest"
import { generateChallenge } from "@/lib/challenge"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`challenge-status:${ip}`, 20, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const body = await req.json()
    const { questId } = body as { questId?: string }

    if (!questId) {
      return NextResponse.json(
        { error: "Missing 'questId' in request body." },
        { status: 400 }
      )
    }

    const entry = await findByQuestId(questId)
    if (!entry) {
      return NextResponse.json({ error: "Quest not found." }, { status: 404 })
    }

    const challenge = await findChallengeByQuest(questId)
    if (!challenge) {
      return NextResponse.json({
        status: "no_challenge",
        message: "No challenge started. Begin via POST /api/quest/challenge/start.",
        next: {
          action: "POST /api/quest/challenge/start",
          body: { questId },
        },
      })
    }

    const now = new Date()
    const expired = new Date(challenge.expiresAt) < now

    if (challenge.solved) {
      return NextResponse.json({
        status: "solved",
        challengeId: challenge.challengeId,
        finalAnswer: challenge.finalAnswer,
        solvedAt: challenge.solvedAt,
        message: "Challenge solved. Proceed to tweet verification.",
      })
    }

    if (challenge.lockedOut) {
      return NextResponse.json({
        status: "locked_out",
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        message: "Locked out after too many failed attempts.",
      })
    }

    if (expired) {
      return NextResponse.json({
        status: "expired",
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        message: "Challenge expired. Request a new one via POST /api/quest/challenge/start.",
      })
    }

    // Active challenge — return questions again
    const challengeData = generateChallenge(challenge.seed)

    return NextResponse.json({
      status: "active",
      challengeId: challenge.challengeId,
      questions: challengeData.questions,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
      maxAttempts: challenge.maxAttempts,
      remainingAttempts: challenge.maxAttempts - challenge.attempts,
      timeRemainingMs: new Date(challenge.expiresAt).getTime() - now.getTime(),
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
