interface RateEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateEntry>()

let callCount = 0
function cleanup() {
  callCount++
  if (callCount % 100 === 0) {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  cleanup()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

export function rateLimitResponse(retryAfterMs: number) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    }
  )
}
