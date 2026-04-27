# SentinelTEMPO — Threat Actors & Asset Model

**Date:** 2026-04-21
**Companion to:** [SECURITY-AUDIT.md](SECURITY-AUDIT.md)

This document maps **who can attack**, **what they want**, and **how they'd try**. It complements the per-finding audit by giving the system a single mental model: actors × assets × paths. Use it for triage decisions ("is this finding worth fixing before launch?") and for monitoring scope ("what should we alert on?").

---

## 1. Assets (what's worth protecting)

Ranked by impact-of-loss.

| ID | Asset | Where it lives | Loss impact |
|---|---|---|---|
| A1 | Treasury pathUSD balance | On-chain `treasury` address | Direct $ loss. Up to ~30k pathUSD over full mint at mainnet target. |
| A2 | NFT supply integrity (no unauthorized mints) | Contract `_mint` | Brand-fatal; entire collection devalued. |
| A3 | Server private key (`SERVER_PRIVATE_KEY`) | Server `.env.local` / OS keystore | Owner + minter + funder takeover (see F-01). |
| A4 | Owner key (currently = A3) | Same | All admin actions: setTreasury, setMerkleRoot, pause, setMinter. |
| A5 | Irys deposit balance | Irys-side, funded by `IRYS_PRIVATE_KEY` (often = A3) | Operational $ loss; mint UI blocks when drained. |
| A6 | Fee-payer balance (`FEE_PAYER_KEY`, often = A3) | EOA on Tempo | MPP charge gas drains; agent mints fail. |
| A7 | Merkle root integrity | On-chain `merkleRoot` + `config/merkle-proofs.json` | Unauthorized WL claims. |
| A8 | Admin session / dashboard | `globalThis.__adminTokens`, cookie | Operator visibility + emergency pause. |
| A9 | Uniqueness registry | `lib/uniqueness.ts` in-memory Map | Per-NFT serial number assignments; griefing target. |
| A10 | Reputation / launch trust | Off-chain (Discord, X) | Trust loss → fewer mints, secondary market damage. |
| A11 | User wallets connecting to dApp | Browser via wagmi | XSS / phishing via the frontend. |
| A12 | Source tree (private) | GitHub / local | Per user, repo is currently private and intended to remain so for Sentinel#0 logic. |

---

## 2. Actors

Ordered roughly by capability + intent.

### 2.1 Internal / privileged

| Actor | Capability | Trust assumption |
|---|---|---|
| **Operator (Yashar)** | Owns all keys, deploys, runs server. | Fully trusted. |
| **Server process** | Holds `SERVER_PRIVATE_KEY` etc. in memory. | Trusted as long as host is not compromised. |
| **Hosting provider** (Vercel / VPS) | Sees env vars, can read process memory. | Trusted; reasonable assumption for Tier-1 providers. |

### 2.2 External — paying users

| Actor | Capability | Intent |
|---|---|---|
| **Whitelisted human** | Has WL allocation, signs tx with own wallet, pays 1 pathUSD. | Mint their allocation; possibly grief uniqueness registry. |
| **Public human** | Open mint, pays 3 pathUSD, up to 5 NFTs/wallet. | Mint up to cap; possibly resell. |
| **AI agent (legit)** | Holds pathUSD, runs MPP client (`mppx`, `tempo request`, OpenClaw, etc.). | Mint via `/api/nft/mint` for owner / themselves. |

### 2.3 External — adversarial

| Actor | Capability | Intent |
|---|---|---|
| **Sybil minter** | Many wallets/IPs, no WL. | Bypass per-wallet caps; spam preview/prepare; consume Irys deposit. |
| **Frontrunning bot** | Reads pending tx, races on-chain ordering. | Mint rare combos by sniffing the prepare → mint window; not directly exploitable here because uniqueness is server-assigned at prepare time, but they could attempt to grief gas pricing. |
| **Griefer (no profit motive)** | Bots, distributed IPs. | Drain Irys deposit (F-10), exhaust uniqueness slots (F-29), exhaust RPC quota (F-09), CPU-DoS via preview (F-40). |
| **Brute-forcer** | Standard pen-tester or script kiddie. | Crack admin password (F-04). |
| **Web attacker** | XSS / CSRF expertise. | Inject script via reflected input → drain users' wallets (mitigated by CSP F-26 partially). |
| **Wallet phisher** | Spins up clone of dApp on lookalike domain. | Steal WL signatures or pathUSD approvals. (Off-scope but operationally relevant.) |
| **Compromised dependency** | npm supply chain attacker. | Inject malicious code into `mppx`, `wagmi`, `viem`, or transitive deps. |
| **State actor / advanced threat** | Targets the operator's machine via 0-day, social eng, supply chain. | Steal `SERVER_PRIVATE_KEY` → full takeover (A3). |

### 2.4 External — infrastructure providers (semi-trusted)

| Actor | Trust level | Risk |
|---|---|---|
| **Tempo RPC provider** | Mostly trusted | Could censor or replay txs (low risk; multiple endpoints available). |
| **Irys network** | Mostly trusted | Could lose data (devnet only); pricing changes; AR network downtime. |
| **MPP / mppx infrastructure** | Mostly trusted | Library bug → silent payment validation flaw (F-14). |
| **DNS / TLS provider** | Trusted | DNS hijack → phishing surface. |
| **Wallet providers (MetaMask, OKX)** | Trusted by user, not by us | Sign requests user explicitly approves. |

---

## 3. Attack trees

For each major attack goal, the steps an adversary would take, and which findings block (or fail to block) them.

### 3.1 Goal: Drain treasury

**Path A — Owner key compromise:**
1. Attacker compromises `SERVER_PRIVATE_KEY` (host attack, env leak, supply chain).
2. Calls `setTreasury(attackerAddress)`.
3. Waits for next legitimate mint → payment lands at attacker.
4. **Blocking:** F-01, F-02, F-22 fixes (multisig owner).
5. **Detection:** monitor `TreasuryUpdated` event with alert.

**Path B — Re-entrancy via malicious paymentToken:**
1. Operator at deploy passes attacker-controlled token as `paymentToken`.
2. Attacker re-enters `mintWhitelist` from token's `transferFrom` hook before state writes.
3. Mints multiple NFTs while paying once.
4. **Blocking today:** Token is `immutable`, set to known pathUSD at deploy. Operator vigilance required.
5. **Defense in depth:** F-05 fix (`nonReentrant` + reorder writes).

**Path C — Mint flow exploitation:**
1. Hard. Contract has `transferFrom` returning bool checked. No path to mint without paying except `mintForAgent` (which requires authorized minter).
2. **Blocking:** Standard ERC-721 + onlyMinter modifier. No known path.

### 3.2 Goal: Mint NFTs for free

**Path A — Compromise authorized minter (`SERVER_PRIVATE_KEY`):**
- Attacker calls `mintForAgent(attacker, [], anyURI)` in AGENT_PUBLIC phase.
- No payment required — `mintForAgent` doesn't pull pathUSD.
- Up to AGENT_CAP NFTs free.
- **Blocking:** F-01 (key separation), F-22 (multisig owner who can revoke minter).
- **Detection:** monitor `Transfer(0, <attacker>, ...)` events vs MPP receipts; flag mismatches.

**Path B — Replay attack on MPP:**
- mppx uses `assertHashUnused` on tx hash. Each tx hash unique on-chain. Replay would require crafting a same-hash tx.
- **Blocking:** Standard EVM nonce + mppx's hash check.
- F-19 (no `externalId`) doesn't help replay-prevention but does help retry-deduplication.

**Path C — Unauthorized direct call to `mintForAgent`:**
- `onlyMinter` modifier enforces. Untrusted callers revert.
- **Blocking:** Contract.

### 3.3 Goal: Drain operator's Irys deposit

**Path A — Spam `/api/nft/prepare`:**
1. Rotate `X-Forwarded-For` header (F-28) to bypass per-IP rate limit.
2. Each request → 2 paid Irys uploads.
3. At 5/min × 1000 spoofed IPs = 5000 uploads/min.
4. Operator's deposit drains in hours.
5. **Blocking:** F-10 (require wallet signature before Irys spend) + F-28 (proper IP detection).

**Path B — Front-end hijack:**
1. Attacker compromises a dependency or CDN, modifies frontend to call `/api/nft/prepare` in a loop.
2. **Blocking:** Server-side rate limit + signature requirement (F-10).

### 3.4 Goal: Grief mint launch (no profit, just damage)

**Path A — Lock uniqueness slots:**
1. Spam `/api/nft/prepare` with valid combos (F-10 / F-29).
2. Each prepare permanently registers combo+number until restart.
3. Real users can't pick unique combos.
4. **Blocking:** F-29 (TTL on registry entries).

**Path B — RPC quota exhaustion:**
1. Spam `/api/nft/check-unique` (F-09) — each call hits RPC.
2. Spam `/api/nft/status` (rate-limited but spoofable via F-28).
3. Operator's RPC quota burns; mint UI displays errors.
4. **Blocking:** F-09 rate limit + F-28 IP fix.

**Path C — Pause attack:**
1. Compromise owner key → call `emergencyPause`.
2. Mint frozen indefinitely (F-21).
3. **Blocking:** F-22 (multisig) + F-21 (max-pause cap).

### 3.5 Goal: Steal user funds via XSS

**Path A — Inject script via reflected user input:**
1. Find a route that reflects user input into HTML without escaping.
2. Currently: no obvious vector — all rendered values go through React's auto-escaping.
3. CSP allows `'unsafe-inline'` (F-26), so injected `<script>` would run if it gets into the DOM.
4. **Blocking:** F-26 fix (drop `unsafe-inline`, use nonces).

**Path B — Stale ngrok in production CSP (F-27):**
1. Attacker registers any `*.ngrok-free.app` subdomain.
2. Hosts malicious script.
3. If they can get the user to load a page that includes it (very narrow), CSP allows it.
4. **Blocking:** F-27 fix (drop ngrok from prod CSP).

**Path C — Compromised npm dep:**
1. `wagmi`, `viem`, `@rainbow-me/rainbowkit`, or transitive dep gets a malicious update.
2. Pulled at next `pnpm install`.
3. Drains every connecting wallet.
4. **Blocking:** Lockfile pinning + audit on every install + Dependabot review.

### 3.6 Goal: Take over admin dashboard

**Path A — Online password brute-force (F-04):**
1. Hit `/api/admin/auth` thousands of times/sec.
2. No rate limit → 1B attempts/day feasible.
3. Weak password (8 chars) cracked in seconds.
4. **Blocking:** F-04 fix (argon2id + rate limit).

**Path B — Offline crack if hash leaks:**
1. Operator pastes `ADMIN_PASSWORD_HASH` into Discord/log/PR.
2. Attacker brute-forces SHA-256 on GPU at 10 GH/s.
3. 8-char password cracked in 3 minutes.
4. **Blocking:** F-04 (argon2id).

**Path C — Session hijack:**
1. CSRF: cookie is `SameSite=strict`, mitigates.
2. XSS: see 3.5; CSP has gaps (F-26).
3. Cookie is `httpOnly`, so direct JS read is blocked.
4. **Blocking:** F-26 + sound CSP.

### 3.7 Goal: Censor / replace WL members

**Path A — Owner key compromise:**
1. Attacker calls `setMerkleRoot(newRoot)` containing only attacker addresses.
2. Mints WL allocation cheaply.
3. **Blocking:** F-03 fix (root immutable after `startMint`, or multisig).
4. **Detection:** monitor `MerkleRootUpdated` event.

### 3.8 Goal: Make agent pay without minting

(Reverse — adversary IS the operator, victim is the agent.)

**Path A — Operator runs phase shift mid-charge:**
1. Operator calls `emergencyPause` right after agent's payment hits but before handler completes mint.
2. Phase re-check fails (F-12) → 409 → no NFT, no refund.
3. **Mitigation:** Documented refund process + monitor for paid-no-mint events + F-12 fix.

**Path B — mppx chain mismatch (F-14):**
1. Operator deploys to chain 42069.
2. mppx internal client uses `viem/chains.tempo` (4217).
3. Agent payment validated against wrong chain → may succeed silently OR fail post-payment.
4. **Mitigation:** F-14 fix (verify mppx supports the actual chain).

---

## 4. Trust boundaries

```
+-----------------+
|  User Browser   |   ← attacker territory; assume hostile input
+--------+--------+
         |
         | HTTPS, CSP, CORS
         v
+--------+--------+
|  Next.js Server |   ← TRUSTED zone (holds keys)
|  (process)      |
+---+-----+---+---+
    |     |   |
    |     |   +---- Irys (semi-trusted, paid uploads)
    |     |
    |     +-------- Tempo RPC (semi-trusted, signed tx submission)
    |
    +-------------- Tempo Contract (TRUSTED logic, immutable post-deploy)
```

**Critical trust transitions:**
- Browser → Server: every input is hostile (validated in API routes).
- Server → Contract: server signs with `SERVER_PRIVATE_KEY` (highest-value action).
- Server → Irys: server pays from `IRYS_PRIVATE_KEY` (financial action; rate-limit must be tight).
- Contract → external token: `transferFrom` to immutable token only (safe assumption today; F-05 hardens it).

---

## 5. Monitoring & alerting (recommended)

For mainnet, set up alerts on:

| Event | Severity | Why |
|---|---|---|
| `TreasuryUpdated` | CRITICAL | A2/A4 — only happens during attacks or planned migration. |
| `MerkleRootUpdated` after `startMint()` | CRITICAL | A7 — should never happen post-launch unless planned. |
| `MinterUpdated(_, true)` for unknown address | CRITICAL | A2 — unauthorized minter grants free-mint capability. |
| `Paused` | HIGH | A2/A8 — operator action or attacker-via-key. |
| Failed `/api/admin/auth` rate > 5/min | HIGH | F-04 brute-force in progress. |
| `/api/nft/prepare` rate > 30/min global | HIGH | F-10 Irys-drain attack. |
| Irys deposit balance < 25% of monthly burn | MEDIUM | A5 — drain or normal usage; investigate. |
| MPP charge succeeded but mint reverted | MEDIUM | F-12 — paid-not-minted; refund queue. |
| `/api/admin/status` 401 rate > 10/min | LOW | Probing admin surface. |
| Server wallet balance < 10 pathUSD | MEDIUM | Operational; can't pay gas. |

---

## 6. Out of scope for this model

Documented for transparency; not addressed here:

- **User wallet security** (private key custody on user's device).
- **Wallet provider bugs** (MetaMask / OKX implementation flaws).
- **DNS hijacking** (operator should use registry lock / DNSSEC).
- **Physical compromise** of operator machine.
- **Legal / regulatory** (KYC, tax, securities classification).
- **Secondary market** (OpenSea-style platforms, royalty enforcement).
- **OpenClaw deployment** (separate project; OpenClaw agents only need to be valid MPP clients).

---

## 7. Quick lookup: actor → most relevant findings

| Actor | Findings to fix first |
|---|---|
| Operator key compromise | F-01, F-02, F-03, F-22 |
| Sybil / griefer | F-10, F-28, F-29, F-09 |
| Brute-forcer (admin) | F-04, F-23 |
| Web attacker (XSS) | F-26, F-27 |
| Compromised dep | F-31, F-32 (reduce surface) |
| AI agent (loss prevention) | F-12, F-14, F-19 |
| Operator confusion (self-DoS) | F-08, F-25, F-46 |

---

*Use this doc with [SECURITY-AUDIT.md](SECURITY-AUDIT.md) and [MAINNET-CUTOVER-CHECKLIST.md](MAINNET-CUTOVER-CHECKLIST.md). Update when new actors / assets / paths emerge.*
