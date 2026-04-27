@AGENTS.md

> **Living doc.** This is the contract between Claude and Yashar. Every decision, rename, or scope change we make should land here so we stay on the same truth. Facts below were verified directly against source on 2026-04-21 — do not trust older research notes in the repo (`DEPLOYMENT-GUIDE.md`, `TEMPO-*.md`, `OPENCLAW-RENDER-RESEARCH.md`) without re-checking.

---

## 1. What this project is

**SentinelTEMPO** — a Next.js 16.2.2 NFT minting dApp for a 50-token ERC-721 collection on the **Tempo** blockchain. Three audiences mint via three paths:

1. **Whitelisted humans** — connect a wallet, pay 1 pathUSD, mint directly on-chain (Merkle-proof gated).
2. **AI agents** — hit `POST /api/nft/mint` with pathUSD via the **MPP** HTTP 402 flow; the server mints on their behalf.
3. **Public humans** — wallet connect, pay 3 pathUSD in the open phase.

The collection uses **7 trait layers** composed with Sharp into a 1024×1024 PNG, stored forever on **Irys**, with the metadata JSON's Irys URL stored as the `tokenURI` on-chain. An autonomous on-chain phase timeline (started once via `startMint()`) gates who can mint when.

---

## 2. Ground-truth facts (verified 2026-04-21)

### 2.1 Contract (`contracts/contracts/SentinelTEMPO.sol`)

Solidity `^0.8.28`, `ERC721` + `Ownable` from OpenZeppelin, `MerkleProof` for WL verification.

**Supply / pricing (contract constants):**

| Constant | Value |
|---|---|
| `MAX_SUPPLY` | 50 |
| `WL_CAP` | 10 |
| `AGENT_CAP` | 20 |
| `WL_PRICE` | 1_000_000 (= 1 pathUSD, 6 decimals) |
| `AGENT_PRICE` | 2_000_000 (= 2 pathUSD) |
| `HUMAN_PRICE` | 3_000_000 (= 3 pathUSD) |
| `WL_MAX_PER_WALLET` | 1 |
| `PUBLIC_MAX_PER_WALLET` | 5 |
| `WL_DURATION` | **1 hour** (testnet) → **3 hours** (mainnet plan) |
| `AGENT_DURATION` | **1 hour** (testnet) → **3 hours** (mainnet plan) |
| `INTERVAL` | **10 minutes** (testnet) → **30 minutes** (mainnet plan) |

> **Current testnet contract uses 1h / 1h / 10m** for fast iteration. The **mainnet deployment will use 3h / 3h / 30m** — we change these constants in [SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol) before the mainnet deploy and re-compile/re-deploy. `DEPLOYMENT-GUIDE.md`'s 3h/3h/30m numbers are the intended mainnet timing, not the current on-chain state.

**Phase state machine** (`enum Phase`): `CLOSED(0) → WHITELIST(1) → WL_AGENT_INTERVAL(2) → AGENT_PUBLIC(3) → AGENT_HUMAN_INTERVAL(4) → HUMAN_PUBLIC(5)`. Computed purely from `block.timestamp - totalPausedDuration` relative to `mintStartTime`, supply caps, and recorded `wlEndTime` / `agentEndTime`. `HUMAN_PUBLIC` is open-ended until sold out.

**Mint entry points:**
- `mintWhitelist(bytes32[] proof, string uri) → uint256` — human WL path. Requires current phase = WHITELIST, merkle-verifies `keccak256(abi.encodePacked(msg.sender))`, pulls `WL_PRICE` in pathUSD via `transferFrom(msg.sender, treasury, ...)`, 1-per-wallet.
- `mintPublic(string uri) → uint256` — human public path. Requires `HUMAN_PUBLIC`, pulls `HUMAN_PRICE`, up to 5/wallet.
- `mintForAgent(address to, bytes32[] proof, string uri) → uint256` — called by authorised minter (server wallet). Works in both `WHITELIST` (proof required, 1/wallet) and `AGENT_PUBLIC` (no proof, 5/wallet). **The contract itself does NOT pull pathUSD on agent mints** — payment is handled upstream by the MPP 402 flow (agent transfers pathUSD to treasury as a side payment).

**Internal bookkeeping:** per-wallet mappings (`wlMinted`, `agentMintCount`, `humanMintCount`), per-token URI map `_tokenURIs`, authorised minter set `minters`. `_recordWlEnd()` / `_recordAgentEnd()` are called at the start of each mint so phase transitions are sticky once triggered by supply-cap or time-out.

**Owner-only controls:** `startMint`, `emergencyPause`, `unpause`, `setMerkleRoot`, `setMinter`, `setTreasury`. Merkle root and treasury are mutable without redeployment.

**Events:** `MintStarted`, `PhaseAdvanced`, `Paused`, `Unpaused`, `MerkleRootUpdated`, `MinterUpdated`, `TreasuryUpdated`.

**Payment token interface** is `ITIP20` (only `transferFrom` + `balanceOf` — we deliberately do NOT rely on full ERC-20 / TIP-20 extensions inside the contract).

### 2.2 Tempo network

**Official Tempo chains** (per `docs.tempo.xyz/quickstart/connection-details` and `viem/chains/definitions/tempo*.ts`):

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Mainnet | **4217** | `https://rpc.tempo.xyz` | `https://explore.tempo.xyz` |
| Testnet (Moderato) | **42431** | `https://rpc.moderato.tempo.xyz` | `https://explore.moderato.tempo.xyz` |
| Testnet (Andantino) | 42429 | `https://rpc.testnet.tempo.xyz` | `https://explore.testnet.tempo.xyz` |
| Devnet | 31318 | `https://rpc.devnet.tempoxyz.dev` | `https://explore.devnet.tempo.xyz` |
| Localnet | 1337 | `http://localhost:8545` | — |

No native gas token. All fees paid in TIP-20 stablecoins. Fully EVM-compatible (Osaka hard fork). ~0.5s block time, deterministic finality (Simplex BFT).

**What we actually use on this project (per Yashar, 2026-04-21):**
- **Now (testing):** chain ID `42069` and whatever RPC/explorer/env we point the app at. `42069` is NOT one of the canonical Tempo chain IDs listed above — treat it as the private/ad-hoc testnet target for our current development cycle. The canonical chain + RPC get wired via `NEXT_PUBLIC_TEMPO_*` env vars in [lib/chain.ts](lib/chain.ts).
- **Go-live (mainnet):** chain ID `4217`, RPC `https://rpc.tempo.xyz`. Flip env vars, change contract timing constants (§2.1), re-deploy, re-verify on Sourcify.

> ⚠️ Watch-out: `contracts/hardhat.config.ts` has its `moderato` network hardcoded to chainId `42431`. If we're actually deploying to a `42069` testnet, **either** we need to update the hardhat config to match, **or** we're deploying via a different network entry. Flag to reconcile before the next deploy.

**pathUSD address gotcha.** The hardcoded `0x20c0000000000000000000000000000000000000` is the **testnet** pathUSD. Per `node_modules/mppx/dist/tempo/internal/defaults.js`, mppx's built-in defaults set:
- `4217` (mainnet) default currency → USDC `0x20C000000000000000000000b9537d11c60E8b50`
- `42431` (testnet) default currency → pathUSD `0x20c0000000000000000000000000000000000000`

Our contract takes `paymentToken` as a constructor arg, and the app reads `NEXT_PUBLIC_PATHUSD_ADDRESS` from env, so we *can* configure either. But when we move to mainnet we need to consciously pick the token address and make sure contract constructor, env var, and mppx `currency` agree.

`viem` ships built-in chain definitions at `viem/chains/{tempo,tempoModerato,tempoAndantino,tempoDevnet,tempoLocalnet}`, but [lib/chain.ts](lib/chain.ts) defines its own chain via `defineChain` so a single codebase can swap networks through env vars. It sets `nativeCurrency.decimals = 18` (MetaMask quirk; pathUSD is actually 6 decimals — handled explicitly in `PATHUSD_DECIMALS = 6`).

### 2.3 MPP — Machine Payments Protocol

HTTP 402 flow co-designed by Tempo and Stripe. Client requests → server responds `402` with `WWW-Authenticate: Payment` challenge → client fulfils payment (on-chain pathUSD transfer) → client retries with `Authorization: Payment <credential>` → server settles and responds 200 with `Payment-Receipt`.

**npm package is `mppx` (v0.5.5).** This project imports from the `mppx/nextjs` subpath export (NOT `mppx/server`). Confirmed at [node_modules/mppx/package.json](node_modules/mppx/package.json) — both subpaths exist; `./nextjs` is the App Router middleware adapter and is what `app/api/nft/mint/route.ts` uses.

```ts
// app/api/nft/mint/route.ts — current shape (post-2026-04-21 fixes)
import { Mppx, tempo } from "mppx/nextjs"
const mppx = Mppx.create({
  methods: [tempo.charge({
    currency: PATHUSD_ADDRESS,
    recipient: treasury,
    feePayer,
    // chainId flows from publicClient.chain.id (NEXT_PUBLIC_TEMPO_CHAIN_ID).
    // No hardcoded testnet flag.
    getClient: async () => publicClient,
  })],
})
// ...
const handler = mppx.charge({ amount: chargeAmount })(async () => { /* mint work */ })
return handler(request)
```

Two payment intents: `charge` (one-shot, ~500ms) and `session` (off-chain vouchers for streaming). This project only uses **charge**.

### 2.4 Irys

Two-step permanent upload per NFT: PNG image first, then JSON metadata that embeds the image gateway URL. Returned URLs become the NFT's `tokenURI`. Gateway pattern used in [lib/irys.ts](lib/irys.ts):

- Devnet: `https://devnet.irys.xyz/<txId>`
- Mainnet: `https://gateway.irys.xyz/<txId>`

Devnet data is ephemeral (~60 days per Irys conventions; not re-verified this session — treat as approximate). Config lives in server env (`IRYS_PRIVATE_KEY`, `IRYS_RPC_URL`, `IRYS_NETWORK`); devnet path sets `.withRpc(rpc).devnet()` on the uploader.

**Funding is separate from wallet balance** — the Irys node needs its own deposit (`irys.fund(...)`). The code does not auto-fund; operator must top up out-of-band.

**Funding strategy (G2 — verified 2026-04-22 by [scripts/irys-probe.ts](scripts/irys-probe.ts)).** Irys does not publish a fixed `$/MB` rate; pricing is dynamic via `getPrice(numBytes)` and depends on the funding token + current network conditions (per `docs.irys.xyz/economics/economics-pricing` + `docs.irys.xyz/onchain-storage/getprice`).

**Funding token ≠ pathUSD.** Irys storage is paid in whichever chain/token the uploader is configured against, **not** in the contract's pathUSD. On our current devnet config (`IRYS_NETWORK=devnet`, `@irys/upload-ethereum`) the funding token is **Sepolia ETH** — confirmed live: `token: "ethereum"`, uploader address `0x0be3b0a137edb64f5ce91d4f8722f7bfefe26b87`. For mainnet we'll point the uploader at an Irys node that accepts whatever funding token we choose (ETH, MATIC, etc.) and pre-fund it once.

**Empirical numbers (probe, 10 random composes):** real PNG sizes 37–181 KiB with **median ~115 KiB** — about **9× smaller** than the 1 MiB upper bound assumed in earlier notes. Per-mint cost (image + ~1 KiB metadata) at devnet rates: **~1.4 µETH at median, ~1.8 µETH at max**. Current loaded balance ~0.005 ETH covers ≈ 2,700–3,600 mints — i.e., the **50-token testnet is funded ~50× over** with no further action, and we'd need to fund roughly an order of magnitude more for a 10k-token mainnet drop.

**Admin gauge.** `/api/admin/irys` GET surfaces `getIrysStatus()` plus an estimate computed against **200 KiB image + 1 KiB metadata** (the empirical p95+ upper bound, not the old 1 MiB strawman). The dashboard's "≈ Mints Remaining" therefore reflects reality, not a 9× pessimistic divisor. Operator funds via the same panel (POST `{amount}`) or directly through the Irys SDK; auto-funding from the mint hot path was deliberately not wired in — funding is an operational decision, and silent top-ups would obscure spend visibility.

### 2.5 Next.js 16.2.2 — this is NOT the Next.js in your training data

Per [AGENTS.md](AGENTS.md), conventions differ. The on-disk docs live at `node_modules/next/dist/docs/` — always consult before writing framework code.

Concrete deltas we've already hit:

- **`middleware.ts` is deprecated and renamed to `proxy.ts`.** This project uses [proxy.ts](proxy.ts) at the project root with an exported `proxy(request)` function and `config.matcher`. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`. Currently a no-op (matcher excludes `_next/static`, `_next/image`, `favicon.ico`) — "WL quest gate removed for mint phase".
- **New hints like `unstable_instant`** appear in the docs' AI-agent notes; don't assume classic Next.js instant-navigation behavior.

When in doubt, read the doc for the file/API you're touching before writing code.

### 2.6 App structure (verified file-by-file)

**Pages** (`app/`):
- [app/layout.tsx](app/layout.tsx) — root layout; loads Geist + `Press_Start_2P` pixel font (CSS var `--font-pixel`); wraps everything in `Providers`; renders `Header`, `Footer`, `MusicPlayer`.
- [app/providers.tsx](app/providers.tsx) — wagmi + RainbowKit + React Query; Tempo chain via [lib/chain.ts](lib/chain.ts); OKX / MetaMask / WalletConnect; dark theme (red accent `#ff2d2d`).
- [app/page.tsx](app/page.tsx) — landing: hero + phase/supply widgets + pricing tiers + how-it-works + CTAs.
- [app/mint/page.tsx](app/mint/page.tsx) — two-column UI: WhitelistChecker + TraitPicker + RandomizeButton / NFTPreview + MintButton. Debounced uniqueness check (300ms) to `/api/nft/check-unique`.
- [app/collection/page.tsx](app/collection/page.tsx) — grid wrapper around `CollectionGrid`.
- [app/collection/[tokenId]/page.tsx](app/collection/[tokenId]/page.tsx) — detail page; fetches `/api/nft/collection/[tokenId]`.
- [app/admin/page.tsx](app/admin/page.tsx) — login form + dashboard (phase, supply, countdown, timers); polls `/api/admin/status` every 10s while authed.
- [app/skill/page.tsx](app/skill/page.tsx) — reads `SKILL.md` server-side and dumps it in a `<pre>` block for agents to consume.

**Components** (`components/`): `Header`, `Footer`, `WalletConnect`, `CircuitBackground`, `SupplyCounter`, `PhaseIndicator`, `WhitelistChecker`, `TraitPicker`, `RandomizeButton`, `NFTPreview`, `MintButton`, `CollectionGrid`, `MusicPlayer`, plus shadcn-style primitives in `components/ui/` (button, card, badge, separator, skeleton).

`MintButton` is the orchestration hotspot: reads `currentPhase` → fetches WL proof from `/api/nft/wl/proof` → calls `/api/nft/prepare` (compose + Irys + register) → checks pathUSD allowance → `approve` if needed → then `writeContract` with `mintWhitelist(proof, uri)` or `mintPublic(uri)` depending on phase.

### 2.7 API routes (`app/api/**/route.ts`)

| Route | Method | Rate limit | Behaviour |
|---|---|---|---|
| `/api/nft/traits` | GET | — | Full trait catalog from `config/traits.json`. |
| `/api/nft/traits/[layerId]` | GET | — | Single layer definition. |
| `/api/nft/check-unique` | POST | — | **Read-only.** Syncs registry → hashes traits → returns `{ unique, number, name, traitHash }`. |
| `/api/nft/preview` | POST | 10/min/IP | Returns composed **PNG binary** (not JSON). |
| `/api/nft/prepare` | POST | 5/min/IP | Compose + upload image + upload metadata. **Registers the combo in the in-memory uniqueness registry immediately** (before the on-chain mint), which prevents races between concurrent human mints. |
| `/api/nft/mint` | POST | — (MPP gates) | Agent mint. Pre-flight: phase check → recipient / trait / merkle / uniqueness validation → contract pre-checks (`totalSupply`, per-wallet cap). Then HTTP 402 flow via `mppx/nextjs`; inside the charge handler: phase re-check → compose + Irys → `mintForAgent(to, proof, uri)` → wait receipt → register. Only active in `WHITELIST` and `AGENT_PUBLIC` phases. Charge amount: **1.10 pathUSD in WL, 2.10 in agent public** (+0.10 surcharge over human price, constants in [lib/chain.ts](lib/chain.ts)). |
| `/api/nft/status` | GET | 30/min/IP | Aggregates `phaseInfo`, supplies, prices, per-wallet limits. |
| `/api/nft/collection` | GET | 20/min/IP | Paginated list (`?page`, `?limit`, max 50). |
| `/api/nft/collection/[tokenId]` | GET | 30/min/IP | Detail + `mintTxHash` resolved from Transfer events (90k-block lookback). |
| `/api/nft/wl/check` | GET | 20/min/IP | `{ address, whitelisted }` from `config/merkle-proofs.json`. |
| `/api/nft/wl/proof` | GET | 20/min/IP | `{ address, proof }` or 404. |
| `/api/admin/auth` | POST/DELETE | — | Login: SHA256-compares `password` against `ADMIN_PASSWORD_HASH` env var; sets `admin_session` cookie (httpOnly, 8h) and stores the token in an in-memory `globalThis.__adminTokens` Set. DELETE clears it. |
| `/api/admin/status` | GET | — | Requires valid `admin_session` cookie. Returns full contract state for the admin dashboard. |

**Uniqueness model ([lib/uniqueness.ts](lib/uniqueness.ts))**: in-memory `Map<traitHash, number>` + `Map<number, traitHash>`. `hashTraits` = SHA-256 of sorted `key:value` pairs. `assignNumber` derives a candidate from the first 4 bytes of the hash mod 9999 + 1, linear-probes on collision. `syncRegistry()` fetches new `tokenURI`s since last sync, pulls their Irys JSON, and imports their `traitHash` + extracted `#NNNN` into the local map. Sync is deduped by a single in-flight promise. **Server restart wipes the map — the next sync rebuilds it from chain.**

### 2.8 Libraries (`lib/`)

- [lib/chain.ts](lib/chain.ts) — viem `defineChain(tempoChain)` from env; `Phase` enum matching the contract.
- [lib/contract.ts](lib/contract.ts) — hand-written `SENTINEL_ABI` (mint, phase, supply, per-wallet, timing, owner controls) and minimal `PATHUSD_ABI` (approve, balanceOf, allowance).
- [lib/env.ts](lib/env.ts) — `getServerEnv()` requires: `SERVER_PRIVATE_KEY`, `FEE_PAYER_KEY`, `NFT_TREASURY_WALLET`, `IRYS_PRIVATE_KEY`, `IRYS_RPC_URL`. `IRYS_NETWORK` defaults to `devnet`. Missing any → throw.
- [lib/traits.ts](lib/traits.ts) — catalog helpers + `validateTraits` (required-layer / unknown-layer / unknown-option checks).
- [lib/compose.ts](lib/compose.ts) — Sharp: first layer = base, resizes each overlay to 1024×1024 before composite, returns PNG buffer. Layer order comes from `traitsConfig.layers` iteration order.
- [lib/irys.ts](lib/irys.ts) — dynamic imports (`@irys/upload`, `@irys/upload-ethereum`). Devnet path calls `.withRpc(rpcUrl).devnet()`. `uploadImage` and `uploadMetadata` both tag `App-Name: SentinelTEMPO`.
- [lib/uniqueness.ts](lib/uniqueness.ts) — see §2.7.
- [lib/whitelist.ts](lib/whitelist.ts) — lowercase-keyed lookup into `config/merkle-proofs.json`.
- [lib/rate-limit.ts](lib/rate-limit.ts) — in-memory `Map<key, {count, resetAt}>` sliding window; cleanup every 100 calls.
- [lib/db.ts](lib/db.ts), [lib/quest.ts](lib/quest.ts), [lib/challenge.ts](lib/challenge.ts), [lib/twitter.ts](lib/twitter.ts) — Postgres pool + quest/challenge helpers + X/Twitter API client. **Not wired into the main mint flow** — carryover from a previous quest-gated phase. `proxy.ts` comment confirms the WL quest gate was removed.

### 2.9 Config (`config/`)

- `traits.json` — layers (each with `id`, `name`, `order`, `required`, `options[]` of `{id, name, file}`).
- `whitelist.json` — array of WL addresses (input to merkle generator).
- `merkle-root.json` — `{ root: "0x..." }` written by `scripts/generate-merkle.ts`.
- `merkle-proofs.json` — `{ "0xaddress": ["0xproof", ...] }` written by the same script; consumed by both the API (`/api/nft/wl/*`) and server mint (`lib/whitelist.ts`).

Merkle tree: OpenZeppelin-compatible — leaves = `keccak256(abi.encodePacked(address))`, pairs sorted before hashing, odd leaf promoted.

### 2.10 Contracts pipeline (`contracts/`)

- [contracts/hardhat.config.ts](contracts/hardhat.config.ts) — Solidity 0.8.28, `evmVersion: "cancun"`, optimizer 200 runs. Loads `.env.local` from project root. Sourcify enabled. Networks:
  - `current` — env-driven from `NEXT_PUBLIC_TEMPO_CHAIN_ID` + `NEXT_PUBLIC_TEMPO_RPC_URL`. Only added when both vars are present. Use this for the ad-hoc 42069 testnet (or whatever the app is currently pointing at). The env block it reads is the same one the Next.js app uses.
  - `moderato` — canonical Tempo Moderato testnet, chainId 42431.
  - `tempo` — canonical Tempo mainnet, chainId 4217.
- `scripts/deploy.ts` — deploys with constructor `(pathUSD, treasury, bytes32(0))`. Zero-root placeholder is intentional — real root is set via `set-merkle-root.ts` afterwards. This also means **Sourcify verification must pass the same zero root as constructor arg**.
- `scripts/set-merkle-root.ts` — calls `setMerkleRoot(root)` from `config/merkle-root.json`.
- `scripts/set-minter.ts` — calls `setMinter(serverAddress, true)` so the server wallet can invoke `mintForAgent`.
- `scripts/set-phase.ts` — calls `startMint()`. This is the one and only "go live" switch; the autonomous timeline starts counting from `block.timestamp`.
- `scripts/emergency-pause.ts` — calls `emergencyPause()`. There is no "advance to public phase" script because the contract self-advances (see §2.1 and §5.1). This is the sole owner-driven phase control: an emergency brake. Paired with `unpause.ts`. (Renamed from the old `set-phase-public.ts` on 2026-04-21 for honesty — the old name implied a phase advance it never did.)
- `scripts/unpause.ts` — calls `unpause()`; all phase deadlines shift by the paused duration.
- `test/SentinelTEMPO.test.ts` — Hardhat test suite (deployment state, `startMint` happy path / guards, WL mint with proof / double-mint block / non-WL reject, plus more).

### 2.11 Root files

- [package.json](package.json) — name `sentinel-tempo`. Scripts: `dev`, `build`, `start`, `lint`, `generate-merkle`. No test script at the root (contract tests run via Hardhat).
- [next.config.ts](next.config.ts) — strict CSP (Irys + Arweave img, Tempo RPC + ngrok + Twitter + Irys connect); CORS on `/api/*` pinned to `NEXT_PUBLIC_APP_URL`; `X-Frame-Options: DENY`; `poweredByHeader: false`; `allowedDevOrigins` carries an ngrok host.
- [proxy.ts](proxy.ts) — see §2.5.

---

## 3. Operational truths

- **Not yet deployed at the time of writing.** Git status shows the whole repo is dirty — many files staged for change, untracked `app/admin/`, `app/api/admin/`, `app/api/nft/check-unique/`, `app/skill/`. Treat every deployment claim in `DEPLOYMENT-GUIDE.md` as historical until we re-run the pipeline.
- **The server wallet is a single point of failure.** It owns the contract, funds Irys, and is the authorised minter. `SERVER_PRIVATE_KEY` and `IRYS_PRIVATE_KEY` are currently the same key by convention.
- **Uniqueness is best-effort, not on-chain.** The `traitHash` is embedded in Irys metadata but the contract does not enforce it. Two agents who race past our in-memory registry (e.g. across a server restart, before sync completes) could both mint the same combo. If uniqueness ever becomes load-bearing, we need to push it on-chain (`mapping(bytes32 => bool) usedTraitHash` + a param to the mint functions).
- **Rate limiting is per-process in-memory.** Fine for a single Next.js instance; breaks under horizontal scaling. Swap to Redis or similar before going multi-instance.
- **Admin auth has no login rate limit** and keeps tokens in `globalThis` (lost on restart). Acceptable for a personal admin UI on a small launch; not acceptable if we expose it more broadly.

---

## 4. Dev quickstart (what actually works today)

1. `.env.local` at project root (see §2.8 `getServerEnv()` plus `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS`, `NEXT_PUBLIC_PATHUSD_ADDRESS`, `NEXT_PUBLIC_TEMPO_*`, `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_APP_URL`, plus `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` for `/admin`, plus `MPP_SECRET_KEY` if MPP signing requires it in the installed `mppx` version — current 0.5.5 config in the code does not explicitly use it, so verify at runtime).
2. `pnpm install` / `npm install`.
3. `npx tsx scripts/generate-merkle.ts` whenever `config/whitelist.json` changes.
4. From `contracts/`: `npx hardhat run scripts/deploy.ts --network current`, then `set-merkle-root.ts`, `set-minter.ts`. (Swap `current` for `moderato` or `tempo` when targeting a canonical network.)
5. `npm run dev` on the app; when ready to go live, `npx hardhat run scripts/set-phase.ts --network current` to fire `startMint()`.

---

## 5. Known gaps, drift, and open questions

### 5.1 Phase auto-advance — contract is already doing the right thing

`currentPhase()` in [SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol) computes the current phase purely from `block.timestamp - totalPausedDuration`, `mintStartTime`, recorded end times, and supply counters. `_recordWlEnd()` / `_recordAgentEnd()` run at the start of every mint and write `wlEndTime` / `agentEndTime` once the cap or the deadline is crossed. **No owner action is needed to "go public"** — advancing from WL → interval → agent → interval → public is fully time-/supply-driven.

Implication: we do **not** need a `set-phase-public` script. Done on 2026-04-21: the misleading [contracts/scripts/set-phase-public.ts](contracts/scripts/) was renamed to [contracts/scripts/emergency-pause.ts](contracts/scripts/emergency-pause.ts). The file still calls `emergencyPause()` and is paired with `unpause.ts`; no contract behaviour changed.

Edge to remember: if nobody mints right at a boundary, the recorded end time stays 0 and `currentPhase()` computes the fallback (`effectiveWlEnd` / `effectiveAgentEnd`). The first mint after the boundary lazily records the real end time. This is fine for front-end display and for mint decisions; just means `wlEndTime == 0` is not the same as "WL still in progress" — you have to combine it with `currentPhase()`.

### 5.2 MPP agent-mint flow — review of [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts)

Verified against the `mppx@0.5.5` sources in `node_modules/mppx/dist/` and `mpp.dev/protocol`.

**What's correct (baseline):**
- Uses the right subpath export: `import { Mppx, tempo } from "mppx/nextjs"`. Confirmed at `node_modules/mppx/package.json` — the `./nextjs` export is the App Router adapter. MPP-research notes in the repo that say `mppx/server` are wrong for this handler.
- The `tempo.charge({...})` parameters (`currency`, `recipient`, `feePayer`) are valid per `node_modules/mppx/dist/tempo/server/Charge.js` and the `Methods.charge` Zod schema.
- The fee-payer pattern is right: `feePayer: privateKeyToAccount(env.feePayerKey)` means the server sponsors gas so agents don't need Tempo gas tokens.
- Body parse uses `request.clone().text()` so the stream isn't consumed before mppx re-reads the request — correct for Next.js App Router.

**Fixes applied 2026-04-21** (all in [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) unless noted):

1. ✅ **Hardcoded `testnet: true` removed.** Replaced with `getClient: async () => publicClient`, so MPP derives the chainId from our viem client's `chain.id`, which in turn comes from `NEXT_PUBLIC_TEMPO_CHAIN_ID`. Same code now works on 42069 testnet, 42431 Moderato, and 4217 mainnet without touching the route.
2. ✅ **Validation moved before the MPP wrapper.** Recipient format, `validateTraits`, WL merkle-proof lookup, `syncRegistry` + `isComboTaken`, plus the new contract pre-checks (fix 5) all run before `mppx.charge({...})(handler)`. Rejected requests now return 400/403/409 without capturing payment.
3. ✅ **Post-charge phase re-check.** Inside the MPP handler, before any Irys or on-chain work, the route re-reads `currentPhase()` and bails with 409 if it shifted from the phase the charge was priced against. Prevents the route from burning Irys storage + agent payment on a mint that would revert.
5. ✅ **Contract pre-checks before charge.** Parallel reads of `totalSupply`, `MAX_SUPPLY`, and either `wlMinted[to]` (WHITELIST) or `agentMintCount[to]` (AGENT_PUBLIC). Returns 409 before payment if sold out or per-wallet cap reached. (The narrow per-wallet race between two concurrent requests still exists and would still leak a charge — acceptable for a 50-token launch.)
6. ✅ **`Mppx.create` hoisted to module scope via lazy singleton (`getMppx()`).** One MPP method and one viem client now persist across requests. Lazy init means missing env vars still don't crash at build time.
7. ✅ **Agent charge amounts centralised** in [lib/chain.ts](lib/chain.ts): `AGENT_CHARGE_WL = '1.10'`, `AGENT_CHARGE_PUBLIC = '2.10'`, plus `AGENT_SURCHARGE = '0.10'` for documentation. The mint route imports these instead of the old string literals. **Note:** the contract's `AGENT_PRICE = 2_000_000` is dead code for `mintForAgent` — agent payment flows entirely through MPP to treasury, never through the contract.

**Still open:**

4. ⏳ **No `externalId` passed to MPP charge.** Without a deterministic idempotency key, retries of a 200 response rely solely on `assertHashUnused` on the transaction hash. A `externalId: sha256(body + phase)` would give a cleaner idempotency barrier. Not shipped in the 2026-04-21 pass — low enough priority to defer.

**Known remaining edges** (not bugs — just limits of the design):
- Per-wallet race: two agents hitting `/api/nft/mint` for the same recipient in the same instant can both pass the pre-check; one will revert at `mintForAgent`, and that one has already paid. Acceptable at 50-token scale.
- Pre-check reads + on-chain state reads add ~3 RPC round-trips per request. Fine for a personal launch; if we scale, worth multicall-ing.
- Uniqueness is still in-memory (see §3). A server restart + a racing agent can still double-mint a combo. On-chain `mapping(bytes32 => bool) usedTraitHash` is the real fix if this matters.

### 5.3 Other drift & gaps

- **Docs drift** — `DEPLOYMENT-GUIDE.md` phase durations (3h/3h/30m) reflect the intended mainnet timing, not the current on-chain (1h/1h/10m testnet). Don't rely on the guide for current state; re-check the contract source.
- **Chain ID drift** — `TEMPO-NFT-RESEARCH.md` says mainnet 42069. The canonical Tempo mainnet is 4217 per viem + Tempo docs. Our project uses 42069 only as the current testnet per Yashar (see §2.2); it's not an official Tempo chain ID. Hardhat now has a `current` network driven by the same env as the app (see §2.10), so deploys no longer need a code change to target 42069.
- **Hardcoded ngrok origin** in [next.config.ts](next.config.ts) `allowedDevOrigins`. Will rot.
- **`lib/quest.ts` / `lib/challenge.ts` / `lib/db.ts` / `lib/twitter.ts`** are dead code in the current mint flow. Keep or prune?
- **`contracts/test/` coverage** — we've confirmed happy-path + guard tests exist, but haven't audited coverage of phase transitions under pause or the edge where WL caps out exactly at the deadline. Worth a full read before audit.
- **OpenClaw integration** — `OPENCLAW-RENDER-RESEARCH.md` is unrelated to the mint contract. It documents deploying an OpenClaw Gateway to Render. If we want to let an OpenClaw-hosted agent call `/api/nft/mint`, the only surface area that matters is the MPP 402 flow on the agent side (agent needs a Tempo wallet with pathUSD + the `mppx` or `tempo request` client). No changes needed in NFTagent itself.

---

## 6. How we update this file

- **Whenever we change scope, rename something, ship, or learn a new truth about the stack, edit the relevant section here in the same PR.**
- If the contract constants change, update §2.1.
- If an API route changes shape, update §2.7's table.
- If a doc drifts again, note it in §5 rather than silently fixing the stale doc.
- Keep §2 factual (verified against source/network), keep §3–§5 editorial, keep §1 short.
- New "project" memories go into `C:\Users\yasha\.claude\projects\c--Users-yasha-vsCode-NFTagent\memory\` via MEMORY.md, not here. This file is the shared map; memory is my persistent scratch.
