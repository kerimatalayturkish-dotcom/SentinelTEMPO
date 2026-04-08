import { NextRequest, NextResponse } from "next/server"
import { findByQuestId, findByAddress, updateEntry } from "@/lib/quest"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(`complete:${ip}`, 5, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

    const body = await req.json()
    const { questId, tempoAddress } = body as { questId?: string; tempoAddress?: string }

    if (!questId || !tempoAddress) {
      return NextResponse.json(
        { error: "Missing 'questId' or 'tempoAddress' in request body." },
        { status: 400 }
      )
    }

    // Validate address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(tempoAddress)) {
      return NextResponse.json(
        { error: "Invalid Tempo address format. Must be a 0x-prefixed 40-hex-char address." },
        { status: 400 }
      )
    }

    const entry = await findByQuestId(questId)
    if (!entry) {
      return NextResponse.json({ error: "Quest not found." }, { status: 404 })
    }

    if (!entry.verified) {
      return NextResponse.json(
        {
          error: "Tweet not yet verified. Complete POST /api/quest/verify first.",
          next: {
            action: "POST /api/quest/verify",
            body: { questId, tweetUrl: "https://x.com/..." },
          },
        },
        { status: 400 }
      )
    }

    if (entry.completedAt) {
      return NextResponse.json({
        message: "Quest already completed.",
        questId: entry.questId,
        twitter: entry.twitter,
        tempoAddress: entry.tempoAddress,
        completedAt: entry.completedAt,
      })
    }

    // Check address not already used by another quest
    const existingAddr = await findByAddress(tempoAddress)
    if (existingAddr && existingAddr.questId !== questId) {
      return NextResponse.json(
        { error: "This Tempo address is already registered to another quest." },
        { status: 409 }
      )
    }

    // Complete the quest
    const updated = await updateEntry(questId, {
      tempoAddress,
      completedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      message: "Quest completed! Your Tempo address has been registered for the whitelist.",
      questId: updated!.questId,
      twitter: updated!.twitter,
      tempoAddress: updated!.tempoAddress,
      completedAt: updated!.completedAt,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
