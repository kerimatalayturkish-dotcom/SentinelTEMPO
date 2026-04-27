# SentinelTEMPO — Mainnet Cutover Checklist

**Date:** 2026-04-21
**Companion to:** [SECURITY-AUDIT.md](SECURITY-AUDIT.md), [THREAT-ACTORS.md](THREAT-ACTORS.md)

End-to-end runbook for moving from current testnet (chain 42069, supply 50, durations 1h/1h/10m) to Tempo Mainnet (chain 4217, supply target, durations 3h/3h/30m). **Do not skip steps.**

> **Stop.** Before running ANY step here, fix the CRITICAL findings flagged in the audit (F-01, F-02, F-03, F-04, F-08, F-13, F-14, F-25). The cutover assumes those are addressed.

Symbols:
- 🔒 = key custody / secret operation; do in cold/offline environment when noted.
- ⛓️ = on-chain transaction; record tx hash in deploy log.
- 📝 = documentation update; commit before next step.
- ⚠️ = irreversible.

---

## Phase 0 — Pre-flight

### 0.1 Lock the audit findings

- [ ] Re-audit each fixed finding with a unit test or manual reproduction.
- [ ] Tag the commit: `git tag pre-mainnet-audit-pass-1`.
- [ ] Confirm `pnpm hardhat test` passes (requires F-06, F-07 fixes — `MockPathUSD.sol` exists, tests reference contract constants dynamically).
- [ ] Confirm `pnpm build` succeeds with mainnet env vars (Phase 1).

### 0.2 Decide final mainnet parameters

Record in this checklist before proceeding:

| Parameter | Value (fill in) |
|---|---|
| `MAX_SUPPLY` | _____ (e.g. 10000) |
| `WL_CAP` | _____ (e.g. 2000) |
| `AGENT_CAP` | _____ (e.g. 3000) |
| `WL_DURATION` (seconds) | _____ (e.g. 10800 = 3h) |
| `AGENT_DURATION` (seconds) | _____ (e.g. 10800 = 3h) |
| `INTERVAL` (seconds) | _____ (e.g. 1800 = 30m) |
| `WL_PRICE` (pathUSD micro-units) | _____ (e.g. 1_000_000 = $1) |
| `HUMAN_PRICE` (pathUSD micro-units) | _____ (e.g. 3_000_000 = $3) |
| Agent charge in WL phase (`AGENT_CHARGE_WL`) | _____ (default `1.10`) |
| Agent charge in agent phase (`AGENT_CHARGE_PUBLIC`) | _____ (default `2.10`) |
| Payment token address (USDC mainnet `0x20C000000000000000000000b9537d11c60E8b50`?) | _____ |

### 0.3 Decide key-separation plan (F-01)

Generate four NEW keys, store as noted:

| Role | Key | Storage | Funded with |
|---|---|---|---|
| Owner | New EOA → transfer to Safe multisig | 🔒 Hardware wallets (2-of-3 minimum) | 0 (no fee, just signs) |
| Deployer | Throw-away EOA | 🔒 Cold; only used during deploy | Enough pathUSD for deploy gas (~$5) |
| Minter | New EOA | Server `.env.local`, `chmod 600` | 0 (needs only mint gas; pays via fee-payer) |
| Fee payer | New EOA | Server `.env.local` | 50–200 pathUSD (cap per week) |
| Irys funder | New EOA | Server `.env.local` | Funded on Irys mainnet (~50–200 pathUSD-equivalent) |

⚠️ **Do not reuse the testnet `SERVER_PRIVATE_KEY` for any role.**

### 0.4 Generate Safe multisig

- [ ] Open https://app.safe.global on Tempo mainnet.
- [ ] Create 2-of-3 Safe with three signer addresses (operator hardware wallet + two trusted others, or operator + cold backup + hot recovery).
- [ ] Record Safe address: ____________________
- [ ] Test a dummy `setMerkleRoot(0xdead)` simulation in Safe → confirm transaction queue works.

---

## Phase 1 — Code & contract changes

### 1.1 Apply Solidity changes (constants → constructor; if F-25 fix accepted)

Edit [contracts/contracts/SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol):

- [ ] Convert `MAX_SUPPLY`, `WL_CAP`, `AGENT_CAP`, `WL_DURATION`, `AGENT_DURATION`, `INTERVAL`, `WL_PRICE`, `HUMAN_PRICE` from `constant` to `immutable` (or keep `constant` and just update values — the env-driven path is preferred per user goal).
- [ ] Add to constructor:
  ```solidity
  constructor(
    address _paymentToken,
    address _treasury,
    bytes32 _merkleRoot,
    uint256 _maxSupply,
    uint256 _wlCap,
    uint256 _agentCap,
    uint256 _wlDuration,
    uint256 _agentDuration,
    uint256 _interval,
    uint256 _wlPrice,
    uint256 _humanPrice
  )
  ```
- [ ] Apply F-05: add `nonReentrant` (`import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"`) and reorder writes-before-`transferFrom`.
- [ ] Apply F-11: `require(bytes(uri).length <= 200, "uri too long")` in both human mint functions.
- [ ] Delete `AGENT_PRICE` constant (F-45).
- [ ] Update [contracts/test/SentinelTEMPO.test.ts](contracts/test/SentinelTEMPO.test.ts) to read constants from contract (F-06).
- [ ] Add [contracts/contracts/MockPathUSD.sol](contracts/contracts/) (F-07).
- [ ] Run `pnpm hardhat test` — all green.
- [ ] 📝 Update CLAUDE.md §2.1 to reflect new constructor signature.

### 1.2 Update [contracts/scripts/deploy.ts](contracts/scripts/deploy.ts)

- [ ] Read all 11 constructor args from env (`process.env.MAINNET_MAX_SUPPLY`, etc.).
- [ ] Pass actual `merkleRoot` (NOT `bytes32(0)`) — eliminates the post-deploy `setMerkleRoot` call AND fixes Sourcify verification gotcha (CLAUDE.md §2.10).

### 1.3 Update [contracts/scripts/set-phase.ts](contracts/scripts/set-phase.ts)

- [ ] Read constants from contract instead of hardcoded log strings (F-46).

### 1.4 Update [scripts/generate-merkle.ts](scripts/generate-merkle.ts) (F-15, F-16)

- [ ] Replace hand-rolled implementation with `@openzeppelin/merkle-tree`:
  ```ts
  import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
  const tree = StandardMerkleTree.of(addrs.map(a => [a]), ["address"])
  ```
- [ ] Update contract `mintWhitelist` and `mintForAgent` verify call to use double-hashed leaf:
  ```solidity
  bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
  ```
- [ ] Verify with a Hardhat test that proofs from new generator validate against new contract.

### 1.5 Fix the API/admin drift

- [ ] [app/api/admin/status/route.ts](app/api/admin/status/route.ts): read constants from contract (F-08).
- [ ] [app/api/nft/check-unique/route.ts](app/api/nft/check-unique/route.ts): add rate limit (F-09).
- [ ] [app/api/nft/prepare/route.ts](app/api/nft/prepare/route.ts): require wallet signature (F-10).
- [ ] [app/api/admin/auth/route.ts](app/api/admin/auth/route.ts): replace SHA-256 with argon2id + add rate limit (F-04).
- [ ] [components/MintButton.tsx](components/MintButton.tsx): remove hardcoded `gas: 21_000_000n` (F-18).
- [ ] [lib/rate-limit.ts](lib/rate-limit.ts): proxy-aware `getClientIp` (F-28).
- [ ] [lib/uniqueness.ts](lib/uniqueness.ts): add TTL on registered combos (F-29).
- [ ] [next.config.ts](next.config.ts):
  - Drop `*.ngrok-free.app` from production CSP (F-27).
  - Inject `NEXT_PUBLIC_TEMPO_RPC_URL` origin into `connect-src` (F-13).
  - Tighten `script-src` for production (F-26).
- [ ] [lib/chain.ts](lib/chain.ts): guard `webSocket` array (F-35); confirm `tempoChain` reads `4217` from env.
- [ ] [.env.example](.env.example): sync to current required vars (F-34).

### 1.6 mppx chain validation (F-14)

- [ ] Spin up a staging deploy on Tempo mainnet (4217).
- [ ] Submit a test agent mint via real `mppx` client.
- [ ] Confirm `tempo.charge` resolver picks up chain 4217 from `getClient`.
- [ ] Capture full request/response in a debug log; attach to commit.

If mppx fails on 4217 (unlikely; that's its native), file a bug upstream and consider a fallback path.

### 1.7 Quest stack handling (F-32)

- [ ] Decide: keep, gate via env, or remove from production build.
- [ ] If keeping: confirm `DATABASE_URL` is set in production env and DB is reachable.
- [ ] If gating: add `NEXT_PUBLIC_DISABLE_QUEST=true` check in each quest route.
- [ ] If removing: move `app/api/quest/` to `app/api/_disabled/quest/`.

### 1.8 Commit & tag

- [ ] All changes reviewed.
- [ ] `git tag mainnet-cutover-rc1`.
- [ ] Push to private repo (per user, repo stays private).

---

## Phase 2 — Whitelist generation

### 2.1 Finalize WL list

- [ ] Confirm `config/whitelist.json` is the final mainnet list (target ~2000 addresses).
- [ ] Validate every address with checksum (`viem.getAddress`) — script should reject malformed.

### 2.2 Generate Merkle tree

- [ ] `pnpm tsx scripts/generate-merkle.ts`
- [ ] Inspect `config/merkle-root.json`. Record root: `0x____________________`
- [ ] Inspect `config/merkle-proofs.json` size: ____ MB. If > 5 MB, consider serving from CDN (F-17).

### 2.3 Sanity check

- [ ] Pick 3 random WL addresses.
- [ ] Verify proof locally:
  ```ts
  import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
  // Reconstruct tree, get proof, verify
  ```
- [ ] All 3 verify ✓.

---

## Phase 3 — Mainnet env file

### 3.1 Create `.env.local` for production

⚠️ Never commit. Storage: production server only (Vercel env vars / `chmod 600` on VPS).

```bash
# === Chain (Tempo Mainnet) ===
NEXT_PUBLIC_TEMPO_CHAIN_ID=4217
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.tempo.xyz
NEXT_PUBLIC_CHAIN_NAME=Tempo Mainnet
NEXT_PUBLIC_EXPLORER_URL=https://explore.tempo.xyz

# === Token & contracts ===
NEXT_PUBLIC_PATHUSD_ADDRESS=0x20C000000000000000000000b9537d11c60E8b50
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=  # filled in after deploy

# === App ===
NEXT_PUBLIC_APP_URL=https://your-domain.tld

# === Server keys (Phase 0.3) ===
SERVER_PRIVATE_KEY=0x____  # MINTER role only
FEE_PAYER_KEY=0x____       # MPP gas sponsor
IRYS_PRIVATE_KEY=0x____    # Irys mainnet funder
NFT_TREASURY_WALLET=0x____ # Multisig or cold address

# === Irys ===
IRYS_RPC_URL=https://rpc.tempo.xyz   # or a paid Alchemy/Infura
IRYS_NETWORK=mainnet

# === Admin ===
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$argon2id$....   # generated locally with `argon2-cli` or Node script

# === Mainnet contract constructor params (read by deploy.ts) ===
MAINNET_MAX_SUPPLY=
MAINNET_WL_CAP=
MAINNET_AGENT_CAP=
MAINNET_WL_DURATION=10800
MAINNET_AGENT_DURATION=10800
MAINNET_INTERVAL=1800
MAINNET_WL_PRICE=1000000
MAINNET_HUMAN_PRICE=3000000
```

- [ ] All values set.
- [ ] Verify `pnpm build` succeeds with this env.
- [ ] Verify Next.js dev server starts (locally with mainnet env, but DON'T submit any tx).

---

## Phase 4 — Contract deploy

### 4.1 Pre-deploy checks (Hardhat dry-run)

- [ ] In `hardhat.config.ts`, confirm the `tempo` network entry is correct (chainId 4217, real RPC).
- [ ] `pnpm hardhat compile` — clean.
- [ ] `pnpm hardhat run --network tempo scripts/deploy.ts --dry-run` (or simulate via `eth_call`).

### 4.2 Fund deployer

- [ ] Send ~$10 worth of pathUSD to deployer address for gas.
- [ ] Verify balance on explorer.

### 4.3 Deploy

⛓️ ⚠️ **This is the irreversible step.**

- [ ] Set `DEPLOYER_KEY=0x...` in env (deployer key only, not server key).
- [ ] Run: `pnpm hardhat run --network tempo scripts/deploy.ts`
- [ ] Capture output:
  - Contract address: `0x____________________`
  - Tx hash: `0x____________________`
  - Block number: `_____`
- [ ] Update `.env.local` `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=`.

### 4.4 Verify on Sourcify

- [ ] `pnpm hardhat verify --network tempo <CONTRACT_ADDRESS> <constructor args...>`
- [ ] Pass the SAME 11 constructor args used in deploy (treasury, paymentToken, merkleRoot, supply consts, durations, prices).
- [ ] Confirm green checkmark on https://explore.tempo.xyz.

### 4.5 Set authorized minter

⛓️ Still acting as deployer (next step transfers ownership):

- [ ] `pnpm hardhat run --network tempo scripts/set-minter.ts`
  - Pass minter address (Server EOA from Phase 0.3).
- [ ] Verify event `MinterUpdated(<server>, true)` on explorer.

### 4.6 Transfer ownership to Safe multisig

⛓️ ⚠️ **Critical separation step.**

- [ ] Add a `transfer-ownership.ts` script (does `contract.transferOwnership(safeAddress)`).
- [ ] Run: `pnpm hardhat run --network tempo scripts/transfer-ownership.ts`
- [ ] Verify owner is now Safe address: `await contract.owner()`.

### 4.7 Smoke test from server

- [ ] `pnpm dev` on staging (NOT production yet) with mainnet env.
- [ ] Visit `/api/nft/status` → should return current contract state, phase = CLOSED.
- [ ] Visit `/admin` → log in with new password → dashboard shows correct supply numbers (0 / `MAX_SUPPLY`).

---

## Phase 5 — Pre-launch readiness

### 5.1 Fund operational wallets

- [ ] Fee payer: 50–200 pathUSD (covers MPP gas for first wave of agent mints).
- [ ] Irys funder: deposit on Irys mainnet via Irys CLI/API. Estimate: ~$0.10 per NFT (image+metadata) × supply target = budget.
- [ ] Server (minter) wallet: 0 pathUSD needed (gas paid by fee-payer in MPP), but verify it can sign by sending 1 wei from another wallet.

### 5.2 Frontend deploy

- [ ] Push to production hosting (Vercel / VPS) with `.env.local` from Phase 3.
- [ ] Verify production build: visit https://your-domain.tld.
- [ ] Test wallet connect → connects to chain 4217 (check chain ID badge).
- [ ] Test `/api/nft/status` → returns 200 with mainnet contract data.
- [ ] DevTools console: confirm no CSP violations (F-13 fix verified).

### 5.3 Monitoring setup

Per [THREAT-ACTORS.md §5](THREAT-ACTORS.md):

- [ ] Set up event listener for `TreasuryUpdated`, `MerkleRootUpdated`, `MinterUpdated`, `Paused`. Alert on any.
- [ ] Set up rate-limit log monitoring on `/api/admin/auth` and `/api/nft/prepare`.
- [ ] Set up Irys deposit balance check (cron, alert at 25%).
- [ ] Set up fee-payer balance check (cron, alert at 25%).
- [ ] Set up uptime monitor on `/api/nft/status`.

### 5.4 Communication

- [ ] Announce launch time in Discord/X.
- [ ] Publish FAQ: WL phase length, agent phase length, public phase, prices.
- [ ] Pin contract address & explorer link.

---

## Phase 6 — Launch

### 6.1 Final pre-flight (T-1 hour)

- [ ] Confirm contract phase is `CLOSED` (not yet started).
- [ ] Confirm fee-payer balance, Irys deposit, server wallet status.
- [ ] Confirm `/api/admin/status` shows correct numbers.
- [ ] Confirm `/api/nft/status` returns expected values.
- [ ] Test mint with one WL address on staging environment (if separate testnet contract still alive).

### 6.2 Start mint

⛓️ ⚠️ **Single-tx launch.**

This MUST be signed by the Safe multisig (since ownership was transferred in 4.6):

- [ ] Queue `startMint()` in Safe.
- [ ] Get co-signer approval.
- [ ] Execute. Capture tx hash + block number.
- [ ] Verify event `MintStarted(timestamp)` on explorer.

### 6.3 Post-launch monitoring (first 30 min)

- [ ] Watch `Transfer(0, ...)` events for first WL mints.
- [ ] Watch `/api/admin/status` for supply progression.
- [ ] Watch fee-payer balance (agent mints will start drawing it down).
- [ ] Watch Irys deposit (every prepare drains it).
- [ ] Watch error logs on `/api/nft/prepare`, `/api/nft/mint`.

### 6.4 Phase transition events

The contract auto-advances. No manual action needed. Watch for:

- [ ] `PhaseAdvanced(WHITELIST → WL_AGENT_INTERVAL)` — when WL ends (3h or cap).
- [ ] `PhaseAdvanced(WL_AGENT_INTERVAL → AGENT_PUBLIC)` — after 30m interval.
- [ ] `PhaseAdvanced(AGENT_PUBLIC → AGENT_HUMAN_INTERVAL)` — when agent ends.
- [ ] `PhaseAdvanced(AGENT_HUMAN_INTERVAL → HUMAN_PUBLIC)` — open phase begins.
- [ ] Final: supply reaches `MAX_SUPPLY` → mint closes naturally.

---

## Phase 7 — Rollback / emergency

### Scenarios

**Scenario A: Critical bug discovered post-launch**
1. Multisig signers gather urgently.
2. Queue `emergencyPause()` in Safe → execute.
3. Investigate. If unfixable: collection ships partial supply, refund process out-of-band.
4. To resume: queue `unpause()` in Safe → execute. Time deadlines auto-shift.

**Scenario B: Server compromise (minter key leak)**
1. Multisig immediately calls `setMinter(compromisedAddress, false)` to revoke.
2. Generate new minter key, update `.env.local`, redeploy server.
3. Multisig calls `setMinter(newAddress, true)`.
4. Resume agent mints.

**Scenario C: Treasury issue (e.g. Safe multisig key lost)**
1. Worst case: pathUSD continues flowing to old treasury address; can't recover signer.
2. Mitigation: BEFORE launch, ensure Safe has 3 signers and at least 2 are accessible.
3. If treasury key is compromised: multisig (owner) can call `setTreasury(newAddress)` to redirect future mints.

**Scenario D: Irys deposit drained mid-mint**
1. `/api/nft/prepare` will start failing with Irys errors → mint flow halts.
2. Operator funds Irys urgently.
3. Or: queue `emergencyPause()` to halt cleanly until refunded.

**Scenario E: RPC outage**
1. `/api/nft/status` and front-end calls fail.
2. Switch to backup RPC URL: update `NEXT_PUBLIC_TEMPO_RPC_URL` env, redeploy frontend.
3. Update CSP `connect-src` to allow new RPC origin.

---

## Phase 8 — Post-launch

### 8.1 Sweep

- [ ] All NFTs minted (or sold-out reached).
- [ ] Final treasury balance reconciled vs. expected (`(WL mints × 1) + (agent off-chain × 2.10) + (public × 3)`).
- [ ] Drain fee-payer remaining balance to operator cold wallet.
- [ ] Drain Irys remaining deposit if no further uploads expected.

### 8.2 Decommission server scope

- [ ] Multisig calls `setMinter(serverAddress, false)` → server can no longer mint.
- [ ] Server can still serve read-only `/api/nft/collection` etc.
- [ ] Rotate `SERVER_PRIVATE_KEY` post-mint (it's no longer privileged, but hygiene).

### 8.3 Long-tail support

- [ ] `/api/nft/collection/[tokenId]` keeps working (reads chain).
- [ ] `MetadataUpdated`-like events: contract has none today, so URIs are immutable post-mint. ✓
- [ ] Plan for future migration / wrapping: not needed for MVP.

### 8.4 Post-mortem

- [ ] Write a mint retro: how long did each phase take, agent vs human ratio, error rate, any aborted mints.
- [ ] Update `CLAUDE.md` §6 with lessons learned.
- [ ] Update this checklist with anything that was missing or wrong.

---

## Quick checklist (one-screen summary)

```
[ ] 0.1  Audit findings re-tested
[ ] 0.2  Mainnet params decided
[ ] 0.3  Four new keys generated
[ ] 0.4  Safe multisig created
[ ] 1.x  Code & contract changes (Solidity, scripts, API, CSP, env.example)
[ ] 1.6  mppx chain validation passed
[ ] 1.8  Tagged commit
[ ] 2.x  Merkle tree generated, root recorded
[ ] 3.1  Production .env.local complete
[ ] 4.x  Contract deployed, verified on Sourcify, ownership → multisig
[ ] 4.5  Minter set
[ ] 5.1  All wallets funded
[ ] 5.2  Frontend deployed
[ ] 5.3  Monitoring active
[ ] 6.2  startMint() executed (multisig)
[ ] 6.3  First mints observed cleanly
[ ] 7.x  Rollback plan rehearsed (paper-test)
[ ] 8.x  Post-launch sweep + post-mortem
```

---

*If anything in this checklist is unclear or contradicts current code, fix the checklist FIRST, then proceed. Do not deploy with open questions.*
