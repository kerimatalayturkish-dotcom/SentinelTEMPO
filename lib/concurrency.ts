import pLimit from "p-limit"

/**
 * Process-wide concurrency limiters.
 *
 * These replace strict per-IP rate limits on expensive operations
 * (Sharp composition, Irys uploads) with an internal queue so the
 * server can absorb bursts without OOMing or hitting Irys throttles.
 *
 * Tuning notes:
 *  - `sharpLimit`  — Sharp is thread-pool bound; 4 parallel composes
 *    is a safe default on a single Render instance.
 *  - `irysLimit`   — Irys devnet is tolerant but mainnet throttles
 *    per-wallet. 2 in-flight uploads keeps the queue moving while
 *    respecting their rate limits.
 */
export const sharpLimit = pLimit(4)
export const irysLimit = pLimit(2)
