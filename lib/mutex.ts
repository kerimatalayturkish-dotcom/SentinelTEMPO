import { Mutex } from "async-mutex"

/**
 * Per-recipient async mutex registry.
 *
 * Two agents racing on /api/nft/mint for the SAME recipient would pass the
 * off-chain pre-checks concurrently, both pay via MPP, but only one could
 * succeed on-chain — the loser would have paid for nothing. Serialising
 * by recipient closes that window.
 *
 * Keys are lowercased addresses. Entries are kept for the lifetime of the
 * process; at 50 supply the map is bounded anyway.
 */
const mutexes = new Map<string, Mutex>()

function keyFor(address: string): string {
  return address.toLowerCase()
}

/** Acquire (create if needed) the mutex for this recipient. */
export function getRecipientMutex(address: string): Mutex {
  const key = keyFor(address)
  let m = mutexes.get(key)
  if (!m) {
    m = new Mutex()
    mutexes.set(key, m)
  }
  return m
}

/**
 * Convenience helper: runs `fn` under the recipient's mutex.
 * Releases the lock even if `fn` throws.
 */
export async function withRecipientLock<T>(
  address: string,
  fn: () => Promise<T>,
): Promise<T> {
  const mutex = getRecipientMutex(address)
  return mutex.runExclusive(fn)
}
