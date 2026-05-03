/**
 * SSRF-safe fetcher for NFT tokenURI metadata.
 *
 * Defense in depth: although our server is the only authorised minter and
 * therefore controls every tokenURI it writes on-chain, we still validate
 * any URL we follow before the fetch. If the contract owner key is ever
 * compromised, or a future code path lets an external party pick a URI,
 * this prevents the server from probing internal hosts (file://, http://,
 * private RFC1918 ranges via DNS rebinding-resistant hosts) or from
 * hanging on a slow endpoint.
 *
 * Allowlist matches the CSP `connect-src` Irys gateways + Arweave.
 */

const ALLOWED_HOSTS = new Set<string>([
  "gateway.irys.xyz",
  "devnet.irys.xyz",
  "uploader.irys.xyz",
  "arweave.net",
])

const FETCH_TIMEOUT_MS = 5_000
const MAX_BYTES = 256 * 1024 // 256 KiB cap; metadata JSON is ~1 KiB in practice

export type TokenMetadata = {
  name?: string
  description?: string
  image?: string
  attributes?: Array<{ trait_type: string; value: string }>
  [k: string]: unknown
}

function isAllowedUrl(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 2048) return false
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
}

/**
 * Fetch + JSON-parse a tokenURI. Returns `null` on any failure (bad URL,
 * disallowed host, non-2xx, timeout, body too large, invalid JSON).
 * Never throws.
 */
export async function safeFetchTokenMetadata(
  uri: unknown,
  opts: { revalidate?: number } = {},
): Promise<TokenMetadata | null> {
  if (!isAllowedUrl(uri)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(uri, {
      signal: controller.signal,
      // Cache as the caller asks (defaults to 1h to match prior behaviour).
      next: { revalidate: opts.revalidate ?? 3600 },
      // Follow redirects, but defensively re-validate the final URL host
      // below. Irys gateways routinely 302-redirect between gateway.irys.xyz
      // and uploader.irys.xyz, so refusing redirects breaks metadata loads.
      redirect: "follow",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null

    // Defense-in-depth: confirm the URL we ended up at is still allowlisted
    // (in case the redirect chain pointed off-allowlist).
    if (!isAllowedUrl(res.url)) return null

    // Cap response body size.
    const contentLength = Number(res.headers.get("content-length") || "0")
    if (contentLength && contentLength > MAX_BYTES) return null

    const text = await res.text()
    if (text.length > MAX_BYTES) return null

    try {
      return JSON.parse(text) as TokenMetadata
    } catch {
      return null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
