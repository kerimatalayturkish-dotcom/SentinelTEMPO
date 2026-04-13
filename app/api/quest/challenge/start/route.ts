import { NextRequest, NextResponse } from "next/server"
import { findByQuestId, findChallengeByQuest, createChallenge, deleteChallenge } from "@/lib/quest"
import { generateChallenge, newSeed } from "@/lib/challenge"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`challenge-start:${ip}`, 5, 60_000)
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

    // Check for existing challenge
    const existing = await findChallengeByQuest(questId)
    if (existing) {
      if (existing.lockedOut) {
        return NextResponse.json(
          {
            error: "You have been locked out after too many failed attempts.",
            attempts: existing.attempts,
            maxAttempts: existing.maxAttempts,
          },
          { status: 403 }
        )
      }

      if (existing.solved) {
        return NextResponse.json({
          message: "Challenge already solved. Proceed to verify your tweet.",
          challengeId: existing.challengeId,
          solved: true,
          finalAnswer: existing.finalAnswer,
        })
      }

      // Expired? Let them restart (delete old and create new)
      if (new Date(existing.expiresAt) < new Date()) {
        // Count this as a failed attempt if they never submitted
        if (existing.attempts < existing.maxAttempts) {
          // Delete and allow re-issue below
          await deleteChallenge(questId)
        } else {
          return NextResponse.json(
            {
              error: "You have been locked out after too many failed attempts.",
              attempts: existing.attempts,
              maxAttempts: existing.maxAttempts,
            },
            { status: 403 }
          )
        }
      } else {
        // Still active — regenerate questions from same seed and return
        const challenge = generateChallenge(existing.seed)
        return NextResponse.json({
          challengeId: existing.challengeId,
          questId,
          questions: challenge.questions,
          expiresAt: existing.expiresAt,
          attempts: existing.attempts,
          maxAttempts: existing.maxAttempts,
          message: "Challenge already active. Answer all 10 questions and submit to /api/quest/challenge/submit.",
          next: {
            action: "POST /api/quest/challenge/submit",
            body: { questId, answers: ["answer1", "answer2", "..."] },
          },
        })
      }
    }

    // Generate new challenge
    const seed = newSeed()
    const challenge = generateChallenge(seed)

    const row = await createChallenge(questId, seed, challenge.answers, challenge.expiresAt)

    return NextResponse.json({
      challengeId: row.challengeId,
      questId,
      questions: challenge.questions,
      expiresAt: row.expiresAt,
      attempts: 0,
      maxAttempts: row.maxAttempts,
      timeWindowSeconds: 300,
      message:
        "Solve all 10 questions within 5 minutes. Submit your answers as an array to /api/quest/challenge/submit.",
      next: {
        action: "POST /api/quest/challenge/submit",
        body: { questId, answers: ["answer1", "answer2", "...10 answers..."] },
      },
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
