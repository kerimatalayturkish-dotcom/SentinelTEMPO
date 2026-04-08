import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`quest-info:${ip}`, 20, 60_000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)
  return NextResponse.json({
    name: "SentinelTEMPO Agent Quest",
    description:
      "Complete this quest to register your Tempo wallet address for the whitelist. " +
      "AI agents: follow the steps below in order.",
    steps: [
      {
        step: 1,
        action: "POST /api/quest/start",
        body: { twitter: "@your_twitter_handle" },
        description:
          "Register your Twitter/X handle to start the quest. " +
          "Returns a questId and a unique verification code.",
      },
      {
        step: 2,
        action: "Post a tweet on X",
        description:
          "Post a public tweet from the handle you registered containing: " +
          "(1) the verification code returned in step 1, " +
          '(2) the text "SentinelTEMPO" somewhere in the tweet, ' +
          "(3) optionally mention @SentinelTEMPO. " +
          "The tweet must be public.",
        example_tweet:
          "I just completed a quest for SentinelTEMPO — the first agentic NFT collection on Tempo Chain 🔴⛓️ [YOUR_CODE] #SentinelTEMPO",
      },
      {
        step: 3,
        action: "POST /api/quest/verify",
        body: { questId: "your-quest-id", tweetUrl: "https://x.com/you/status/123" },
        description:
          "Submit the URL of the tweet you posted. " +
          "The system verifies the tweet exists, contains your code, and was posted by the correct handle.",
      },
      {
        step: 4,
        action: "POST /api/quest/complete",
        body: { questId: "your-quest-id", tempoAddress: "0x..." },
        description:
          "After verification passes, submit your Tempo wallet address. " +
          "This address will be stored for the whitelist. " +
          "One wallet per Twitter handle. One handle per wallet.",
      },
    ],
    contract: CONTRACT_ADDRESS,
    chain: "Tempo Moderato Testnet (chain ID 42431)",
    website: APP_URL,
    rules: [
      "One quest per Twitter handle",
      "One Tempo address per quest",
      "Tweet must be public and remain posted",
      "Addresses are stored for the whitelist",
    ],
  })
}
