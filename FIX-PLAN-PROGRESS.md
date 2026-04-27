# SentinelTEMPO — Fix Plan Progress

_Last updated: 2026-04-22 (post-Phase-G)_

This document tracks the seven-phase refactor that took SentinelTEMPO from the "research-era" codebase to a launch-ready state. Source of truth: the contract + libs + API routes as they exist on disk today. Anything not listed under "Remaining" is live in `main` (modulo your uncommitted staging).

---

## Phase A — Contract, tests, scripts, Hardhat config ✅

**Contract rewrite — [contracts/contracts/SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol)**

- Constructor now takes a `Config` struct, so all phase/supply/price constants are deploy-time parameters instead of source-level magic numbers. Swapping testnet (50 / 10 / 20 / 1h / 1h / 10m) and mainnet (10 000 / 2 000 / 3 000 / 3h / 3h / 30m) no longer requires editing the contract.
- `treasury` is `immutable` — the old `setTreasury` owner function is gone.
- Added `mapping(bytes32 => bool) public usedTraitHash` and `mapping(uint256 => bytes32) public tokenTraitHash`, so uniqueness is enforced on-chain, not just in our in-memory registry.
- Every mint function now takes `(uri, traitHash)` (WL and agent flavours also take `proof`). Functions follow Checks-Effects-Interactions, are `nonReentrant`, and cap URIs at `MAX_URI_LENGTH = 200` bytes to prevent storage-bloat grief.
- WL merkle leaves are **double-hashed** (`keccak256(bytes.concat(keccak256(abi.encode(addr))))`), matching OpenZeppelin's `StandardMerkleTree`. No more ad-hoc `keccak256(abi.encodePacked(addr))`.
- `MAX_PAUSES = 5` circuit breaker on owner pauses.
- `AGENT_PRICE` deleted (dead code — agent payment flows through MPP, never the contract).
- Events added: `AgentMint(to, tokenId, traitHash)` + `TraitHashUsed`.
- `startMint()` **locks** the merkle root — no more mid-phase root rotation.

**Test harness**

- New [contracts/contracts/MockPathUSD.sol](contracts/contracts/MockPathUSD.sol) for tests.
- [contracts/test/shared/fixtures.ts](contracts/test/shared/fixtures.ts): OZ `StandardMerkleTree` + `DeployConfig` presets + `nextTraitHash` helper.
- [contracts/test/SentinelTEMPO.testnet.test.ts](contracts/test/SentinelTEMPO.testnet.test.ts): 46 tests covering every mint path, pause/unpause, phase transitions, traitHash reuse, revert cases, and URI length cap.
- [contracts/test/SentinelTEMPO.mainnet.test.ts](contracts/test/SentinelTEMPO.mainnet.test.ts): 6 smoke tests on the 10k-supply config.
- Full suite: **52 / 52 passing**.

**Deploy + admin scripts**

- [contracts/scripts/deploy.ts](contracts/scripts/deploy.ts): builds the 11-arg `Config` from env, rejects a zero merkle root at deploy time.
- [contracts/scripts/set-phase.ts](contracts/scripts/set-phase.ts): reads durations from the deployed contract for the log output.
- [contracts/hardhat.config.ts](contracts/hardhat.config.ts): only canonical networks (`moderato` 42431 + `tempo` 4217). The ad-hoc env-driven `current` network is gone.
- Added `@openzeppelin/merkle-tree` as a devDep.

---

## Phase B — Libs ✅

Eleven library files touched or created. All of them are the single source of truth for their concern.

- **[lib/chain.ts](lib/chain.ts)** — prices locked to `WL_PRICE = 1_150_000n` (1.15 pathUSD), `HUMAN_PRICE = 3_150_000n` (3.15), and agent MPP charges `AGENT_CHARGE_WL = '1.25'` / `AGENT_CHARGE_PUBLIC = '2.25'`. The old `AGENT_PRICE` / `AGENT_SURCHARGE` constants are gone. WebSocket RPC URL guard added.
- **[lib/contract.ts](lib/contract.ts)** — ABI rewritten to match the new contract. Adds `usedTraitHash`, `isTraitHashUsed`, `tokenTraitHash`, `pauseCount`, `MAX_PAUSES`, `WL_MAX_PER_WALLET`, `MAX_URI_LENGTH`, `treasury`, `paymentToken`, plus all immutable-config views and the new events. `setTreasury` removed.
- **[lib/env.ts](lib/env.ts)** — adds `ownerPrivateKey` (optional), `mppSecretKey`, `adminUsername`, `adminPasswordHash`, `jwtSecret`, `databaseUrl`. `getOptionalServerEnv()` lets the build succeed without runtime keys.
- **[lib/rate-limit.ts](lib/rate-limit.ts)** — IP resolution priority: `Render-Proxy-Forwarded-For` → `CF-Connecting-IP` → last-hop `X-Forwarded-For` → `X-Real-IP`. Fixes spoofing via the first XFF entry behind a Render proxy.
- **[lib/irys.ts](lib/irys.ts)** — lazy, memoised singleton uploader. Metadata type now accepts `traitHash`.
- **[lib/uniqueness.ts](lib/uniqueness.ts)** — 2-minute TTL cache (was unbounded); 16-byte `assignNumber`; `computeTraitHash` via `keccak256` instead of SHA-256; reads `tokenTraitHash` from chain instead of round-tripping through Irys; `isTraitHashUsedOnChain` for the authoritative "already minted" check.
- **[lib/traits.ts](lib/traits.ts)** — shared `computeTraitHash(selection)` with canonical `"layerId:optionId|…"` order, so server + client + contract all agree.
- **[lib/merkle.ts](lib/merkle.ts)** (NEW) — Postgres-backed proof lookup + `replaceMerkleTree(root, proofs)` atomic upsert. Replaces the on-disk JSON.
- **[lib/sig.ts](lib/sig.ts)** (NEW) — `verifyAddressSignature` + `buildMintChallenge(...)` canonical signed string.
- **[lib/mutex.ts](lib/mutex.ts)** (NEW) — per-recipient `async-mutex` + `withRecipientLock` helper.
- **[lib/concurrency.ts](lib/concurrency.ts)** (NEW) — `sharpLimit = 4`, `irysLimit = 2` (via `p-limit`). Prevents a flood of concurrent agents from starving the box.

**Postgres schema applied** (`merkle_proofs`, `merkle_meta`, `refund_queue` + indexes). Deps added: `argon2 0.44`, `async-mutex 0.5`, `jose 6.2.2`, `p-limit 7.3`.

---

## Phase C — Mint flow ✅

- **[scripts/generate-merkle.ts](scripts/generate-merkle.ts)** rewritten: OZ `StandardMerkleTree.of(addrs.map(a => [a]), ["address"])` → writes [config/merkle-root.json](config/merkle-root.json) **and** upserts proofs into Postgres via `replaceMerkleTree`. Run as `npm run generate-merkle` (tsx picks up `.env.local` via `--env-file`).
- **[app/api/nft/wl/check/route.ts](app/api/nft/wl/check/route.ts) + [app/api/nft/wl/proof/route.ts](app/api/nft/wl/proof/route.ts)** — now query Postgres via `lib/merkle`; proof route returns 404 when the address isn't on the list.
- **[app/api/nft/check-unique/route.ts](app/api/nft/check-unique/route.ts)** — 30/min per-IP rate limit + authoritative `isTraitHashUsedOnChain` check.
- **[app/api/nft/prepare/route.ts](app/api/nft/prepare/route.ts)** — body is now `{address, traitHash, nonce, signature, traits}`; verifies the wallet signature against `buildMintChallenge` before doing **any** compose or Irys work; server re-derives `computeTraitHash` and rejects a claimed-hash mismatch; wrapped in `sharpLimit` + `irysLimit`.
- **[app/api/nft/mint/route.ts](app/api/nft/mint/route.ts)** (agent MPP route) — new 4-arg `mintForAgent(to, proof, uri, traitHash)`; wrapped in `withRecipientLock` per recipient; MPP `externalId = keccak256("recipient|traitHash|phase")` for idempotency; `refund_queue` inserts on phase-drift, upload-fail, revert, and on-chain tx-reverted.
- **[app/api/nft/preview/route.ts](app/api/nft/preview/route.ts)** — wrapped in `sharpLimit`.
- **[app/api/nft/traits/route.ts](app/api/nft/traits/route.ts) + [app/api/nft/traits/[layerId]/route.ts](app/api/nft/traits/[layerId]/route.ts)** — `Cache-Control: public, max-age=3600, immutable`.
- **[components/MintButton.tsx](components/MintButton.tsx)** — added `useSignMessage` + `useChainId`; new `"signing"` MintStep; client-side `computeTraitHash` → sign challenge → `POST /api/nft/prepare` with `{address, traitHash, nonce, signature, traits}`; `writeContract` calls the new 3-arg `mintWhitelist(proof, uri, traitHash)` / `mintPublic(uri, traitHash)`; removed the hardcoded `gas: 21_000_000n`; price labels updated to 1.15 / 3.15.
- **Deletions**: `lib/whitelist.ts` + `config/merkle-proofs.json` — Postgres is the only source of truth now.

---

## Phase D — Admin ✅

- **[lib/auth.ts](lib/auth.ts)** (NEW) — argon2id verify, `constantTimeEqual` (SHA-256 + `timingSafeEqual`), `signAdminJwt` (jose HS256, `iss=sentinel-tempo-admin`, 8h expiry), `verifyAdminJwt`, `requireAdmin()` cookie + JWT reader. `JWT_SECRET` is enforced to be ≥ 32 characters at startup.
- **[app/api/admin/auth/route.ts](app/api/admin/auth/route.ts)** — POST is rate-limited 5 per 15 min per IP, validates body types + caps password at 512 bytes, and runs `constantTimeEqual(username)` **and** `argon2.verify(password)` on every request so failure timing doesn't leak which credential was wrong; issues an `httpOnly` + `sameSite=strict` cookie carrying a signed JWT; DELETE just clears the cookie (stateless — no more in-memory `globalThis.__adminTokens`).
- **[app/api/admin/status/route.ts](app/api/admin/status/route.ts)** — `requireAdmin()` gated. Returns contract state, all immutable constants, treasury + server pathUSD balances, refund queue counts, and timing info. Reads are parallel (`Promise.all`) to keep the admin dashboard snappy.
- **[app/admin/page.tsx](app/admin/page.tsx)** — `ContractStatus` interface extended; Timeline panel now shows pause count vs `MAX_PAUSES`; new Operations panel (treasury / server pathUSD, refund queue count); Contract panel shows treasury + server minter + merkle root; new Constants panel (all 8 immutable values).
- Fixed a leftover phase-B append bug in [lib/contract.ts](lib/contract.ts) (duplicate `SENTINEL_ABI` + `PATHUSD_ABI` blocks).

---

## Phase E — Infra ✅

- **[next.config.ts](next.config.ts)** rewritten:
  - CSP `connect-src` is built from `NEXT_PUBLIC_TEMPO_RPC_URL` + `NEXT_PUBLIC_TEMPO_WS_URL`, so swapping chains doesn't need a config diff.
  - ngrok entries in `connect-src` and `allowedDevOrigins` are only emitted when `NODE_ENV !== 'production'`. `NEXT_PUBLIC_DEV_ORIGIN` drives the dev-origin entry.
  - `Strict-Transport-Security` + `upgrade-insecure-requests` are production-only.
  - Added `base-uri 'self'` + `form-action 'self'`.
  - API CORS now sends `Vary: Origin`, `Access-Control-Max-Age: 600`, and allows `DELETE` alongside `GET / POST / OPTIONS`.
- **proxy.ts** deleted (was a no-op matcher-only file).
- **[lib/compose.ts](lib/compose.ts)** — `LAYERS_DIR` anchors on `fileURLToPath(import.meta.url)` instead of `process.cwd()`, so monorepo / `.next` build moves don't break it.
- **OPTIONS handlers (204)** appended to every POST route we own: [preview](app/api/nft/preview/route.ts), [mint](app/api/nft/mint/route.ts), [check-unique](app/api/nft/check-unique/route.ts), [prepare](app/api/nft/prepare/route.ts), [admin/auth](app/api/admin/auth/route.ts).
- **[.env.example](.env.example)** synced: role-separated `OWNER_PRIVATE_KEY` / `SERVER_PRIVATE_KEY` / `FEE_PAYER_KEY` / `IRYS_PRIVATE_KEY`, `NFT_TREASURY_WALLET`, `ADMIN_USERNAME`, argon2id `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `DATABASE_URL`, `MPP_SECRET_KEY`, `NEXT_PUBLIC_DEV_ORIGIN`. Each variable has an inline comment on how to generate it.
- **`@sentinel0-only` markers** added to the legacy quest/challenge modules that are no longer wired into the mint flow: [lib/quest.ts](lib/quest.ts), [lib/challenge.ts](lib/challenge.ts), [lib/twitter.ts](lib/twitter.ts), and all 7 `app/api/quest/**/route.ts`. [lib/db.ts](lib/db.ts) was **not** marked dead — it's live infra (the refund queue + merkle proofs use it).

**Verification at end of Phase E**: `npx tsc --noEmit` clean at source level (only stale `.next/dev/types` noise); `npx hardhat test` → 52 / 52 passing.

---

## Remaining work

### 1. Contract deployment (blocking launch)

Not yet done. Needs four separated keys provided via `.env.local`:

- `OWNER_PRIVATE_KEY` — deploys + runs admin scripts. Keep offline after launch.
- `SERVER_PRIVATE_KEY` — authorised minter for `mintForAgent`.
- `FEE_PAYER_KEY` — sponsors gas for MPP agent charges.
- `IRYS_PRIVATE_KEY` — funds image + metadata pinning.

Launch sequence once keys land:

1. Fund the owner address on the target network.
2. `npm run generate-merkle` to (re)publish the final whitelist root + proofs to Postgres.
3. `cd contracts && npx hardhat run scripts/deploy.ts --network <moderato|tempo>` — verify the zero-root guard fires correctly (it should reject a zero root).
4. `npx hardhat run scripts/set-merkle-root.ts --network <…>` — sets the root before `startMint()` locks it.
5. `npx hardhat run scripts/set-minter.ts --network <…>` — authorises `SERVER_PRIVATE_KEY` as a minter.
6. Fund the Irys node out-of-band (`irys.fund(...)`); the code does not auto-fund.
7. Smoke-test the app end-to-end against the deployed address (WL mint, agent mint, public mint).
8. `npx hardhat run scripts/set-phase.ts --network <…>` — fires `startMint()`. From this point the phase timeline advances autonomously.

### 2. Phase F — Admin UI for live ops ✅

Completed 2026-04-22. All four operations are wrapped in the admin dashboard so day-of-launch ops don't require dropping into Hardhat scripts.

- **F1 — Refund queue table + per-row Settle action.** New [app/api/admin/refunds/route.ts](app/api/admin/refunds/route.ts) (GET, `?filter=unsettled|settled|all`, admin-gated, `?limit` capped at 500) + [app/api/admin/refunds/settle/route.ts](app/api/admin/refunds/settle/route.ts) (POST `{id, settledTx?}`, idempotent via `COALESCE(settled_at, now())` so a double-click on Settle is harmless). Admin UI Refund Queue panel paginates the rows, lets the operator paste the off-chain settlement tx hash via `window.prompt`, and refreshes on the same 10s polling loop as the rest of the dashboard.
- **F2 — Pause / Unpause buttons + live `pauseCount` display.** New [app/api/admin/pause/route.ts](app/api/admin/pause/route.ts) (POST `{action: "pause" | "unpause"}`). Pre-flight reads `paused` + `pauseCount` + `MAX_PAUSES`; returns 409 on no-op, 503 if `OWNER_PRIVATE_KEY` isn't configured. Signs with viem `walletClient` using the owner key, waits for the receipt, returns `{ok, txHash, blockNumber}`. [app/api/admin/status/route.ts](app/api/admin/status/route.ts) now also returns `contract.ownerSigner` + `contract.ownerConfigured` so the UI can grey out the buttons when the key isn't loaded. Buttons gated by `window.confirm` with a warning that `MAX_PAUSES = 5` over the contract's lifetime.
- **F3 — Per-wallet mint-history lookup.** New [app/api/admin/wallet/route.ts](app/api/admin/wallet/route.ts) (GET `?address=`). Validates with viem `isAddress` + normalises via `getAddress`. Parallel reads of `wlMinted`, `agentMintCount`, `humanMintCount`, plus a `getLogs` Transfer scan (`from = ZERO`, `to = address`, 90k-block lookback). Block timestamps resolved in parallel via `getBlock` (deduped by `Map<bigint, number>`). Returns `{address, counters, mints[], lookbackFromBlock, lookbackToBlock}`. Admin Wallet History panel shows the 4 counter tiles + a mint table with token IDs, mint timestamps, and tx hash links.
- **F4 — Irys funded-balance read-out + top-up helper.** New helpers in [lib/irys.ts](lib/irys.ts): `getIrysStatus()` (uses `irys.getLoadedBalance()` + `utils.fromAtomic`), `fundIrys(amount)` (validates `utils.toAtomic`, calls `irys.fund(atomic)`), and `getIrysPrice(bytes)` (used by F4 + G2 to estimate runway). New [app/api/admin/irys/route.ts](app/api/admin/irys/route.ts) GET returns balance + 1 MiB price estimate + `estimatedMintsRemaining` (`balance / (price-per-MiB × 2)`). POST `{amount}` validates a positive decimal string and calls `fundIrys`. Admin Irys Uploader panel shows network, token, address, loaded balance, cost per 1 MiB, ≈ mints remaining, and a top-up form gated by `window.confirm` ("non-refundable except via Irys' withdraw flow").

### 3. Phase G — UX polish ✅

Completed 2026-04-22. Five user-facing improvements added one at a time per the plan.

- **G5 — Trait reorder.** Required layers (Background, Body) now float to the top of [components/TraitPicker.tsx](components/TraitPicker.tsx), with optional layers preserving their original order beneath. Implementation note: I deliberately did **not** reorder `config/traits.json` because the array order doubles as the compose-layer order — moving Body before Back would draw the cape/jetpack on top of the body silhouette. Picker now sorts independently of compose order via `[...layers.filter(required), ...layers.filter(!required)]`. Compose code unchanged.
- **G1 — Whitelist checker widget.** New [components/WhitelistCheckWidget.tsx](components/WhitelistCheckWidget.tsx) mounted on the landing page below `SupplyCounter`. Auto-checks the connected wallet on connect/change via `useAccount`, with a fallback text input for visitors who want to check a different address. Validates `0x… 40-hex`, calls the existing `/api/nft/wl/check` endpoint, renders ✓ / ✗ / error states with a Mint link on success. Distinct from the existing [components/WhitelistChecker.tsx](components/WhitelistChecker.tsx) (mint-page widget) so as not to break the mint flow.
- **G3 — Mint tx hash in metadata (Option B).** Postgres `mint_receipts` table added to [scripts/schema.sql](scripts/schema.sql) (`token_id PK, tx_hash, block_number, recipient, minted_at`). New [lib/receipts.ts](lib/receipts.ts) exports `recordMintReceipt`, `getMintReceipt`, `getReceiptsForRecipient`. Recording wired into:
  - [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) (agent path) — after `waitForTransactionReceipt`, decodes the `Transfer(from=0)` event for the actual on-chain tokenId, persists, and returns `onChainTokenId` in the response.
  - [app/api/nft/receipt/route.ts](app/api/nft/receipt/route.ts) (NEW, human path) — accepts only `{txHash}`, re-fetches the receipt from chain, decodes the `Transfer` event, persists. The client cannot inject anything; all data comes from the on-chain log. 30/min/IP rate limited.
  - [components/MintButton.tsx](components/MintButton.tsx) — fire-and-forget POST to `/api/nft/receipt` once `mintConfirmed`.
  - [app/api/nft/collection/[tokenId]/route.ts](app/api/nft/collection/[tokenId]/route.ts) — reads the receipts table first; falls back to the existing 90k-block log scan only if the row is missing. Response now includes `mintBlockNumber`, `mintRecipient`, `mintedAt`.
- **G4 — My Mints page + nav link.** New [app/api/nft/my-mints/route.ts](app/api/nft/my-mints/route.ts) — combines receipts table reads with a 90k-block `Transfer(to=address)` log backfill (opportunistically persisting newly-found rows so subsequent queries are zero-RPC). Fetches `tokenURI` + Irys metadata for up to 50 tokens in parallel. New [app/my-mints/page.tsx](app/my-mints/page.tsx) renders a responsive grid of cards (image, name, tokenId, tx hash → explorer link, link to detail page). [components/Header.tsx](components/Header.tsx) now adds the "My Mints" nav item conditionally on `useAccount().isConnected`. Chose conditional nav over RainbowKit dropdown injection because RainbowKit's connected-state menu doesn't support custom items cleanly.
- **G2 — Irys funding model documented.** Confirmed via Irys docs (`docs.irys.xyz/economics/economics-pricing` + `docs.irys.xyz/onchain-storage/getprice`) that there is no fixed `$/MB` rate — pricing is dynamic via `getPrice(numBytes)` and varies by funding token + network conditions. Conclusion documented in [CLAUDE.md](CLAUDE.md) §2.4: for the 50-token testnet a single upfront `irys.fund(...)` covers the whole drop; for a hypothetical 10k mainnet drop the operator should monitor runway via the new admin panel. We did not auto-fund inside the mint hot path on purpose — funding is an operational decision, not a per-request one. The runway gauge is delivered via the F4 helpers (`getIrysPrice` + the admin endpoint's `estimatedMintsRemaining`).

### 4. Documentation refresh

Low priority but worth a pass once we deploy:

- Update [CLAUDE.md](CLAUDE.md) §2 to reflect the final deployed constants (supply, prices, timings) and any chain-id decisions.
- Archive `DEPLOYMENT-GUIDE.md`, `TEMPO-*.md`, `OPENCLAW-RENDER-RESEARCH.md` under a `docs/research/` folder — they're historical, not operational.

---

## Answer to "does Phase F mean the contract is deployed?"

**No.** Phase F is a UI-only layer on top of the already-deployed contract and API. The actual deployment is a **separate prerequisite** (step 1 in _Remaining work_ above) and doesn't block Phase F conceptually — but in practice you'd want the contract live first so the admin buttons have something to talk to.

Once the contract is deployed and `setMerkleRoot` + `setMinter` have run, the contract is fully armed. `startMint()` is a single owner-only call — you can fire it at any time from either (a) the existing [contracts/scripts/set-phase.ts](contracts/scripts/set-phase.ts) script or (b) a Phase F "Start Mint" button if we wire one up. After `startMint()` the autonomous phase timeline takes over and no further owner action is required to reach the public phase.

So the dependency chain is:

```
deploy  →  setMerkleRoot  →  setMinter  →  (Phase F + G optional)  →  startMint
```

Phases F and G are strictly optional for launch — they only make the day-of-launch ops + visitor UX nicer. The minimum viable path to "mint is live" is deploy + set-merkle-root + set-minter + start-mint, using the existing Hardhat scripts.

---

## Verification snapshot at end of Phase G (2026-04-22)

- Source typecheck (`npx tsc --noEmit`): clean (only stale `.next/dev/types` noise).
- Contract suite (`cd contracts; npx hardhat test`): **52 / 52 passing**.
- New routes added in F + G: `/api/admin/refunds`, `/api/admin/refunds/settle`, `/api/admin/pause`, `/api/admin/wallet`, `/api/admin/irys`, `/api/nft/receipt`, `/api/nft/my-mints`. Pages: `/my-mints`. Components: `WhitelistCheckWidget`. Schema: `mint_receipts` table.
- DB migration: re-run [scripts/schema.sql](scripts/schema.sql) in Postgres before `pnpm dev` to create `mint_receipts`. The schema is idempotent (`CREATE TABLE IF NOT EXISTS`).
