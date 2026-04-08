import { TwitterApi } from "twitter-api-v2"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local"), override: true })

console.log("API Key loaded:", process.env.TWITTER_API_KEY ? "yes (" + process.env.TWITTER_API_KEY.slice(0,5) + "...)" : "NO")

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
})

async function main() {
  // Verify credentials first
  const me = await client.v2.me()
  console.log("Authenticated as:", me.data.username, `(ID: ${me.data.id})`)

  // Post a test tweet
  const testCode = "SQ-TEST-" + Date.now().toString(36).toUpperCase()
  const tweetText = `Testing SentinelTEMPO Agent Quest system 🔴⛓️ ${testCode} #SentinelTEMPO`

  console.log("Posting tweet:", tweetText)
  const result = await client.v2.tweet(tweetText)
  console.log("Tweet posted! ID:", result.data.id)
  console.log("URL:", `https://x.com/${me.data.username}/status/${result.data.id}`)
}

main().catch((err) => {
  console.error("Error:", err.data || err.message || err)
  process.exit(1)
})
