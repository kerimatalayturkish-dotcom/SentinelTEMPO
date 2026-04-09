const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN ?? ""

export interface TwitterUser {
  id: string
  username: string
  name: string
  followers_count: number
}

export async function lookupFollowers(handle: string): Promise<TwitterUser> {
  if (!BEARER_TOKEN) {
    throw new Error("TWITTER_BEARER_TOKEN is not configured")
  }

  const username = handle.replace(/^@/, "")
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  })

  if (res.status === 404) {
    throw new TwitterLookupError("Twitter account not found. Make sure your handle is correct.", 404)
  }

  if (res.status === 429) {
    throw new TwitterLookupError("Twitter API rate limit reached. Please try again in a few minutes.", 429)
  }

  if (!res.ok) {
    throw new TwitterLookupError(`Twitter API error (${res.status}). Please try again later.`, res.status)
  }

  const json = await res.json()

  if (!json.data) {
    throw new TwitterLookupError("Twitter account not found. Make sure your handle is correct.", 404)
  }

  return {
    id: json.data.id,
    username: json.data.username,
    name: json.data.name,
    followers_count: json.data.public_metrics?.followers_count ?? 0,
  }
}

export class TwitterLookupError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "TwitterLookupError"
    this.status = status
  }
}
