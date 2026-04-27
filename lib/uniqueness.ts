import { createPublicClient, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "./chain"
import { SENTINEL_ABI } from "./contract"
import { computeTraitHash } from "./traits"
import type { TraitSelection } from "./traits"

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(),
})

// ─── Registry ──────────────────────────────────────────────────────
// Two-way map: traitHash (bytes32 hex) ↔ 4-digit number (1..9999).
// Used only as a hint for the friendly `#NNNN` number — uniqueness
// itself is enforced on-chain by `usedTraitHash` in the contract.
const hashToNumber = new Map<string, number>()
const numberToHash = new Map<number, string>()

// ─── Cache TTL ─────────────────────────────────────────────────────
// The local registry can go stale between syncs (a mint that happened
// elsewhere won't be reflected). We re-sync if more than 2 minutes
// have passed since the last successful sync.
const SYNC_TTL_MS = 2 * 60 * 1000
let lastSyncedSupply = 0
let lastSyncAt = 0
let syncing: Promise<void> | null = null

// Re-export for callers that already import hashTraits from here.
export function hashTraits(traits: TraitSelection): `0x${string}` {
  return computeTraitHash(traits)
}

/**
 * Derive a candidate 4-digit number (1..9999) from a traitHash.
 * Uses the first 16 bytes (128 bits) of the hash for a wider input
 * range than the previous 4-byte slice, so probing is rare.
 */
function hashToCandidate(traitHash: string): number {
  const hex = traitHash.startsWith("0x") ? traitHash.slice(2) : traitHash
  const slice = hex.slice(0, 32) // 16 bytes
  const num = BigInt("0x" + slice)
  return Number(num % 9999n) + 1
}

/** Find a unique 4-digit number for a trait combo (linear probe on collision). */
export function assignNumber(traitHash: string): number {
  const existing = hashToNumber.get(traitHash)
  if (existing !== undefined) return existing

  let candidate = hashToCandidate(traitHash)
  while (numberToHash.has(candidate)) {
    candidate = (candidate % 9999) + 1
  }
  return candidate
}

/** Local-cache check. NOT authoritative — always combine with on-chain `isTraitHashUsedOnChain`. */
export function isComboTaken(traitHash: string): boolean {
  return hashToNumber.has(traitHash)
}

/** Register a minted combo in the in-memory registry. */
export function registerMinted(traitHash: string, number: number) {
  hashToNumber.set(traitHash, number)
  numberToHash.set(number, traitHash)
}

/** Format a 4-digit number with leading zeros. */
export function formatNumber(n: number): string {
  return String(n).padStart(4, "0")
}

/**
 * Authoritative uniqueness check — reads `usedTraitHash[traitHash]` from the
 * contract. Returns true iff the contract has already recorded this hash.
 */
export async function isTraitHashUsedOnChain(
  traitHash: `0x${string}`,
): Promise<boolean> {
  const slot = (await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "usedTraitHash",
    args: [traitHash],
  })) as bigint
  return slot !== 0n
}

/**
 * Sync the local registry from on-chain metadata.
 * Only fetches new tokens since the last successful sync AND skips entirely
 * if the cache TTL hasn't expired. Safe to call repeatedly and concurrently.
 */
export async function syncRegistry(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncAt < SYNC_TTL_MS) return
  if (syncing) return syncing
  syncing = _doSync()
  try {
    await syncing
  } finally {
    syncing = null
  }
}

async function _doSync() {
  const supply = Number(
    await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "totalSupply",
    }),
  )

  if (supply <= lastSyncedSupply) {
    lastSyncAt = Date.now()
    return
  }

  for (let i = lastSyncedSupply; i < supply; i++) {
    try {
      // On-chain traitHash is the authoritative source — avoids a second
      // HTTP round-trip to Irys for every token.
      const traitHash = (await publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: SENTINEL_ABI,
        functionName: "tokenTraitHash",
        args: [BigInt(i)],
      })) as `0x${string}`

      if (!traitHash || traitHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        continue
      }

      // Best-effort: read tokenURI to extract the friendly number.
      let num: number
      try {
        const uri = (await publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "tokenURI",
          args: [BigInt(i)],
        })) as string

        const res = await fetch(uri)
        if (res.ok) {
          const metadata = await res.json()
          const match = metadata.name?.match(/#(\d+)/)
          num = match ? parseInt(match[1], 10) : assignNumber(traitHash)
        } else {
          num = assignNumber(traitHash)
        }
      } catch {
        num = assignNumber(traitHash)
      }

      registerMinted(traitHash, num)
    } catch (e) {
      console.error(`Failed to sync token ${i}:`, e)
    }
  }

  lastSyncedSupply = supply
  lastSyncAt = Date.now()
}
