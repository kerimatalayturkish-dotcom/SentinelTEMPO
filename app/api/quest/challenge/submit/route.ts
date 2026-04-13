import { NextRequest, NextResponse } from "next/server"
import {
  findByQuestId,
  findChallengeByQuest,
  incrementChallengeAttempts,
  markChallengeSolved,
} from "@/lib/quest"
import { validateAnswers } from "@/lib/challenge"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`challenge-submit:${ip}`, 10, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const body = await req.json()
    const { questId, answers } = body as { questId?: string; answers?: string[] }

    if (!questId || !answers) {
      return NextResponse.json(
        { error: "Missing 'questId' or 'answers' in request body." },
        { status: 400 }
      )
    }

    if (!Array.isArray(answers) || answers.length !== 10) {
      return NextResponse.json(
        { error: "Must submit exactly 10 answers as an array of strings." },
        { status: 400 }
      )
    }

    // Ensure all answers are strings
    const sanitized = answers.map((a) => String(a).trim())

    const entry = await findByQuestId(questId)
    if (!entry) {
      return NextResponse.json({ error: "Quest not found." }, { status: 404 })
    }

    const challenge = await findChallengeByQuest(questId)
    if (!challenge) {
      return NextResponse.json(
        { error: "No challenge found. Start one first via POST /api/quest/challenge/start." },
        { status: 404 }
      )
    }

    if (challenge.solved) {
      return NextResponse.json({
        message: "Challenge already solved.",
        finalAnswer: challenge.finalAnswer,
      })
    }

    if (challenge.lockedOut) {
      return NextResponse.json(
        {
          error: "You have been locked out after too many failed attempts.",
          attempts: challenge.attempts,
          maxAttempts: challenge.maxAttempts,
        },
        { status: 403 }
      )
    }

    // Check if expired
    if (new Date(challenge.expiresAt) < new Date()) {
      // Increment attempt (the window expired without a correct submission)
      const updated = await incrementChallengeAttempts(challenge.challengeId)
      return NextResponse.json(
        {
          error: "Challenge has expired. Request a new one via POST /api/quest/challenge/start.",
          attempts: updated.attempts,
          maxAttempts: updated.maxAttempts,
          lockedOut: updated.lockedOut,
        },
        { status: 410 }
      )
    }

    // Validate answers against seed
    const result = validateAnswers(challenge.seed, sanitized)

    if (result.correct) {
      // All correct — mark solved
      const finalAnswer = sanitized[sanitized.length - 1] // last answer = finalAnswer
      const solved = await markChallengeSolved(challenge.challengeId, finalAnswer)

      return NextResponse.json({
        message:
          "All 10 answers correct! Challenge solved. " +
          `Include the finalAnswer "${finalAnswer}" in your tweet, then verify via POST /api/quest/verify.`,
        solved: true,
        finalAnswer,
        correctCount: result.correctCount,
        total: result.total,
        next: {
          action: "POST /api/quest/verify",
          body: { questId, tweetUrl: "https://x.com/..." },
        },
      })
    }

    // Wrong answers — increment attempt
    const updated = await incrementChallengeAttempts(challenge.challengeId)

    if (updated.lockedOut) {
      return NextResponse.json(
        {
          error: "Incorrect answers. You have used all attempts and are now locked out.",
          correctCount: result.correctCount,
          total: result.total,
          wrongQuestions: result.wrongIndices,
          attempts: updated.attempts,
          maxAttempts: updated.maxAttempts,
          lockedOut: true,
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        error: "Some answers are incorrect. Try again.",
        correctCount: result.correctCount,
        total: result.total,
        wrongQuestions: result.wrongIndices,
        attempts: updated.attempts,
        maxAttempts: updated.maxAttempts,
        remainingAttempts: updated.maxAttempts - updated.attempts,
      },
      { status: 422 }
    )
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
