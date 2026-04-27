import { http } from "viem"

/**
 * Returns the RPC URL to use for SERVER-SIDE viem clients.
 *
 * Order of preference:
 *   1. MINT_RPC_URL (server-only, e.g. Alchemy / QuickNode private endpoint)
 *   2. NEXT_PUBLIC_TEMPO_RPC_URL (public Tempo RPC, shared with browser)
 *
 * The public Tempo RPC aggressively rate-limits at the project level. Under
 * load (an agent mint = ~6 contract reads + mppx's getTransactionReceipt),
 * we hit `-32005 "Request exceeds defined limit"` and mppx fails to verify
 * the on-chain payment AFTER funds have been captured — agent retries,
 * pays again, repeats. A private RPC eliminates the throttle.
 *
 * NEVER use this for the browser-facing `tempoChain.rpcUrls.default`. That
 * URL ends up embedded in the HTML and is fine to be public; this one is
 * gated by an API key and must stay server-side.
 */
export function getServerRpcUrl(): string {
  return (
    process.env.MINT_RPC_URL ||
    process.env.NEXT_PUBLIC_TEMPO_RPC_URL ||
    (() => {
      throw new Error(
        "Neither MINT_RPC_URL nor NEXT_PUBLIC_TEMPO_RPC_URL is set",
      )
    })()
  )
}

/**
 * viem http transport for server-side clients with retry+backoff on
 * transient errors (rate limits, network blips). Defaults to 4 retries
 * with exponential backoff (150ms, 300ms, 600ms, 1.2s).
 */
export function serverHttp() {
  return http(getServerRpcUrl(), {
    retryCount: 4,
    retryDelay: 150,
    timeout: 30_000,
  })
}
