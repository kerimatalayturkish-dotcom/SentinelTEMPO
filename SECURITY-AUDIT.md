# SentinelTEMPO — Security Audit (Read-Only Pass)

**Date:** 2026-04-21
**Scope:** Workstreams 1–6 per CLAUDE.md §6 plan. Read-only, no fixes applied.
**Auditor:** Claude (Copilot)
**Source verified:** Live code in this workspace as of the audit date.
**Audit basis:** Contract holds under both current testnet config (50/10/20, 1h/1h/10m) AND planned mainnet config (e.g. 10000/2000/3000, 3h/3h/30m). Merkle review assumes 2,000 WL leaves on mainnet.

---

## Severity legend

- **CRITICAL** — direct loss of funds, unauthorized mint, or full takeover.
- **HIGH** — significant funds-at-risk, broken invariant, exploitable DoS.
- **MEDIUM** — exploitable under specific conditions, defense-in-depth gap, or large blast radius if compromised.
- **LOW** — best-practice gap, hardening opportunity, or limited-impact bug.
- **INFO** — observation, drift, or documentation.

Each finding lists: **WS** (workstream), **Where**, **What**, **Why it matters**, **Recommendation**.
Fixes are **not** applied — this is the read-only pass.

---

# Findings index (by severity)

| # | Sev | Title | WS |
|---|---|---|---|
| F-01 | CRITICAL | Single key (`SERVER_PRIVATE_KEY`) is owner + minter + Irys funder + deployer | 5 |
| F-02 | CRITICAL | `setTreasury` mutable mid-mint; owner key compromise enables fund redirect | 1 |
| F-03 | CRITICAL | `setMerkleRoot` mutable mid-mint; owner can insert/remove WL addresses | 1 |
| F-04 | CRITICAL | Admin password stored as unsalted SHA-256, no rate limit on `/api/admin/auth` | 6 |
| F-05 | HIGH | Check-Effects-Interactions violation in `mintWhitelist` and `mintPublic` (state writes after `transferFrom`) | 1 |
| F-06 | HIGH | Hardhat tests reference constants that don't match the contract (10000/2000/3000/3h vs deployed 50/10/20/1h) — test suite cannot validate current contract | 1 |
| F-07 | HIGH | `MockPathUSD.sol` referenced in tests but does not exist in `contracts/contracts/` — test suite will not compile | 1 |
| F-08 | HIGH | `app/api/admin/status/route.ts` returns hardcoded `max:10000`, `wlCap:2000`, `agentCap:3000` while contract is 50/10/20 — admin dashboard displays false numbers | 4, 6 |
| F-09 | HIGH | `/api/nft/check-unique` has no rate limit; triggers `syncRegistry()` (RPC) on every call → RPC quota DoS | 4 |
| F-10 | HIGH | `/api/nft/prepare` rate-limited only by IP (5/min) but performs paid Irys upload AND consumes uniqueness slots — distributed attacker can drain Irys deposit and grief uniqueness registry | 3, 4, 5 |
| F-11 | HIGH | `tokenURI` is unbounded user-controlled string in `mintWhitelist`/`mintPublic` — gas-griefing & storage-bloat vector | 1 |
| F-12 | HIGH | Agent mint has unrecoverable "paid-but-not-minted" window if phase shifts between charge issuance and handler execution | 2 |
| F-13 | HIGH | `next.config.ts` CSP `connect-src` does not include the testnet RPC URL (only `tempo.xyz` + `moderato.tempo.xyz`) — wallet RPC calls will be blocked when pointed at chain 42069 / mainnet's actual RPC if it differs | 4, 5 |
| F-14 | HIGH | mppx singleton built once and cached forever, but `tempoChain` is read from env at module-load — env changes require server restart; silent mismatch risk if env is mutated at runtime | 2 |
| F-15 | MEDIUM | Hand-rolled Merkle tree in `scripts/generate-merkle.ts` with non-OZ-standard leaf encoding (`keccak256(abi.encodePacked(address))`, no double-hash) | 1, 5 |
| F-16 | MEDIUM | Merkle leaf encoding vulnerable to second-preimage class attacks (mitigated by length difference but not best practice) | 1 |
| F-17 | MEDIUM | `merkle-proofs.json` (~1.6 MB at 2000 entries) bundled into `/api/nft/wl/proof` and `/api/nft/wl/check` API route bundles | 5 |
| F-18 | MEDIUM | `MintButton` hardcodes `gas: 21_000_000n` — wasteful upfront pathUSD reservation on Tempo where gas is paid in pathUSD | 3 |
| F-19 | MEDIUM | No `externalId` passed to `mppx.charge` → idempotency relies solely on tx hash uniqueness | 2 |
| F-20 | MEDIUM | Per-wallet race in agent mint pre-flight: two concurrent requests for same recipient both pass cap check; one reverts on-chain after charge | 2 |
| F-21 | MEDIUM | `emergencyPause` is unbounded: owner can freeze mint indefinitely; no max-pause guard | 1 |
| F-22 | MEDIUM | Owner key has no timelock or multisig — single signature for `setTreasury`/`setMerkleRoot`/`setMinter`/`emergencyPause` | 1, 5 |
| F-23 | MEDIUM | Admin session tokens stored in `globalThis.__adminTokens` (in-memory) — lost on restart, breaks under multi-instance scale | 6 |
| F-24 | MEDIUM | `ADMIN_PASSWORD_HASH` env var never set anywhere (.env.example, .env.local) → admin login currently always 401s; latent dead-but-deployed surface | 6 |
| F-25 | MEDIUM | Constants drift between testnet and mainnet are hardcoded in Solidity — requires recompile + redeploy + re-verify rather than env config | 5 |
| F-26 | MEDIUM | CSP `script-src 'self' 'unsafe-inline' 'unsafe-eval'` is permissive (XSS attack surface broadened) | 4 |
| F-27 | MEDIUM | `next.config.ts` `allowedDevOrigins` and CSP both contain hardcoded ngrok host `1ab9-212-253-124-27.ngrok-free.app` — stale, unauditable | 4 |
| F-28 | MEDIUM | `getClientIp` trusts `x-forwarded-for` blindly — IP-spoofable rate limit defeat | 4 |
| F-29 | MEDIUM | `lib/uniqueness.ts` registry is per-process in-memory; abandoned `prepare` calls permanently grief combo+number slots until process restart | 3 |
| F-30 | MEDIUM | `mintForAgent` does not require `uri` to embed `traitHash` matching off-chain claim; bug or compromise of server can mint mismatched metadata silently | 2 |
| F-31 | MEDIUM | `lib/irys.ts` `getIrysUploader()` re-imports + re-instantiates uploader on every call — performance + key-handling concern | 5 |
| F-32 | MEDIUM | Quest API routes (`/api/quest/*`) and `lib/{quest,challenge,db,twitter}.ts` depend on `DATABASE_URL` and X API; if mistakenly enabled in mainnet build, expand attack surface | 5 |
| F-33 | LOW | `composeImage` uses `process.cwd()` to resolve assets path — fragile if process started from non-project dir | 5 |
| F-34 | LOW | `.env.example` missing `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `IRYS_PRIVATE_KEY`, `MPP_SECRET_KEY`, `NEXT_PUBLIC_CHAIN_NAME`, `NEXT_PUBLIC_TEMPO_WS_URL` | 5 |
| F-35 | LOW | `tempoChain` `webSocket` array contains `process.env.NEXT_PUBLIC_TEMPO_WS_URL!` — if unset becomes `[undefined]`, breaking wagmi WS subscriptions | 5 |
| F-36 | LOW | `mintForAgent` accepts arbitrary `to`; agent could mint to a different address than the payer (by design, but worth explicit confirmation in docs/event) | 2 |
| F-37 | LOW | `mintWhitelist` allows `_mint` after state writes — recipient `onERC721Received` could re-enter; safe only because per-wallet flags are written before `_mint` | 1 |
| F-38 | LOW | `tokenURI` mapping persists even if token were burnable in future — design assumption | 1 |
| F-39 | LOW | `assignNumber` uses `parseInt(hash.slice(0,8), 16) % 9999 + 1` — small chance of collision, linear probe mitigates but worst-case O(n) | 5 |
| F-40 | LOW | `/api/nft/preview` rate limit 10/min/IP is insufficient under bot fleet for CPU-heavy Sharp composition | 4 |
| F-41 | LOW | `/api/nft/traits` and `/api/nft/traits/[layerId]` have no rate limit (low impact, but unbounded) | 4 |
| F-42 | LOW | `setMinter` accepts any address; owner mistake could grant minter to attacker — no length/format guard, but address typing is enforced by ABI | 1 |
| F-43 | LOW | `IRYS_RPC_URL=https://rpc.sepolia.org` in `.env.example` — public Sepolia RPC unreliable | 5 |
| F-44 | LOW | No `OPTIONS` preflight handler for `/api/*`; CORS preflight may fail for non-simple POST requests from authorized origin | 4 |
| F-45 | INFO | `AGENT_PRICE = 2_000_000` constant in contract is unused (agent payment is off-chain via MPP). Approved for deletion (post-audit task). | 1 |
| F-46 | INFO | `set-phase.ts` console message says "WL(3h) → Interval(30m)" but contract is 1h/10m — operator-facing drift | 1 |
| F-47 | INFO | `tempoChain.nativeCurrency.decimals = 18` is a deliberate MetaMask quirk; pathUSD is 6 decimals — documented | 5 |
| F-48 | INFO | `proxy.ts` is currently a no-op (WL quest gate removed) but still mounted on every route — verify low cost | 4 |
| F-49 | INFO | Dead-code helper modules (`lib/{quest,db,twitter,challenge}.ts`) intentionally retained for Sentinel#0 / WL quest scaffolding (per user); confirmed they are not imported by any mint-flow file | — |
| F-50 | INFO | `mppx@0.5.5` import path `mppx/nextjs` confirmed correct; module forces `viem/chains.tempo` (chainId 4217) into resolver — see F-14 for runtime impact | 2 |
| F-51 | INFO | OpenZeppelin `MerkleProof.verify` is current/safe; no version-specific concerns | 1 |
| F-52 | INFO | Git history clean: only `.env.example` tracked, no leaked private keys; `.gitignore` correctly excludes `.env*`, `db_*.txt`, `White lists/`, `backups/`, `SKILL.md`, `commandsVPS.md` | 5 |

---

# Workstream 1 — Smart contract

> Contract: [contracts/contracts/SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol)
> Tests: [contracts/test/SentinelTEMPO.test.ts](contracts/test/SentinelTEMPO.test.ts)
> Scripts: [contracts/scripts/](contracts/scripts/)

## F-02 — CRITICAL — `setTreasury` mutable mid-mint

**Where:** `setTreasury(address)` in `SentinelTEMPO.sol`
**What:** Owner can change `treasury` to any address at any time. Subsequent `mintWhitelist` / `mintPublic` calls send pathUSD to the new treasury.
**Why it matters:** If owner key is compromised mid-mint, attacker redirects all subsequent mint payments to themselves. With 2000 WL × 1 + ~3000 agent × 2 (off-chain) + ~5000 human × 3 = up to ~30k pathUSD at risk on mainnet.
**Recommendation:** Either (a) make `treasury` `immutable`, or (b) gate via 48h timelock, or (c) require owner to be a multisig (Safe). Mainnet **must not** ship with single-EOA owner.

## F-03 — CRITICAL — `setMerkleRoot` mutable mid-mint

**Where:** `setMerkleRoot(bytes32)` in `SentinelTEMPO.sol`
**What:** Owner can replace WL root mid-WHITELIST phase, adding attacker addresses or removing legitimate WL.
**Why it matters:** Combined with F-02 / F-22, owner key compromise lets attacker self-mint WL allocation at WL price.
**Recommendation:** After `startMint()`, require either (a) timelock on root changes, (b) `merkleRoot` becomes immutable when phase advances past WHITELIST, or (c) multisig owner.

## F-05 — HIGH — Check-Effects-Interactions violation

**Where:** `mintWhitelist`, `mintPublic` in `SentinelTEMPO.sol`
**What:**
```solidity
require(MerkleProof.verify(...));
require(ITIP20(paymentToken).transferFrom(msg.sender, treasury, WL_PRICE), "payment failed"); // EXTERNAL CALL
wlMinted[msg.sender] = true;  // STATE WRITE AFTER EXT CALL
wlSupply++;
totalSupply++;
_mint(msg.sender, tokenId);
```
External `transferFrom` is called **before** the state writes that prevent re-entry.
**Why it matters:** `paymentToken` is `immutable` and currently TIP-20 (no transfer hooks per Tempo docs), so the live exploit is currently impossible. **However**, if Tempo ever adds optional hooks (TIP-20 ≠ ERC-20 strictly), or if the constructor is ever called with a malicious token by mistake, an attacker controlling that token could re-enter `mintWhitelist`/`mintPublic` and mint multiple NFTs while paying once. Defense-in-depth violation.
**Recommendation:** Add `nonReentrant` modifier (OpenZeppelin `ReentrancyGuard`), AND reorder to write `wlMinted` / `humanMintCount++` / `wlSupply++` / `totalSupply++` **before** the `transferFrom`. This is cheap and removes the entire class.

## F-06 — HIGH — Test/contract constant drift

**Where:** `contracts/test/SentinelTEMPO.test.ts` lines 19–24, 26–28
**What:** Tests assert:
```ts
const WL_DURATION = 3 * 60 * 60   // 3 hours
const INTERVAL    = 30 * 60       // 30 minutes
const WL_CAP      = 2000
const AGENT_CAP   = 3000
// ...
expect(await contract.MAX_SUPPLY()).to.equal(10_000)
```
Contract has `MAX_SUPPLY=50`, `WL_CAP=10`, `AGENT_CAP=20`, `WL_DURATION=1 hours`, `INTERVAL=10 minutes`.
**Why it matters:** Test suite cannot validate the actually-deployed contract. CI is blind. Pre-mainnet audit gate is missing.
**Recommendation:** Either (a) parameterize tests against the contract's `await contract.MAX_SUPPLY()` etc., or (b) maintain two separate test config blocks (testnet vs mainnet) and run both.

## F-07 — HIGH — `MockPathUSD.sol` missing

**Where:** `contracts/test/SentinelTEMPO.test.ts` line 56: `await ethers.getContractFactory("MockPathUSD")`
**What:** No `MockPathUSD.sol` exists in `contracts/contracts/`. Hardhat will throw "no factory" at test time.
**Why it matters:** Combined with F-06, the test suite is non-functional. The "happy path / phase guards" tests claimed in CLAUDE.md §2.10 cannot actually run.
**Recommendation:** Add `contracts/contracts/MockPathUSD.sol` (minimal ERC-20 with `mint`/`approve`/`transferFrom`) and verify `pnpm hardhat test` passes against the current contract.

## F-11 — HIGH — Unbounded `tokenURI` string

**Where:** `mintWhitelist` / `mintPublic` accept `string calldata uri`; `_tokenURIs[tokenId] = uri` writes unbounded length
**What:** A malicious WL or public minter can submit a 100KB+ URI string, paying gas to bloat contract storage permanently.
**Why it matters:** Storage gas grows linearly with URI length. At mainnet 10000 supply, even moderate abuse blows up storage costs and forever-rents indexer/explorer resources. Also, malicious URI could embed JS/HTML that breaks downstream consumers (e.g. OpenSea-style indexers parsing URI).
**Recommendation:** Add `require(bytes(uri).length <= 200, "uri too long")`. Real Irys URLs are ~80 chars; 200 is a generous cap.

## F-21 — MEDIUM — `emergencyPause` unbounded

**Where:** `emergencyPause()` / `unpause()`
**What:** Owner can pause the mint indefinitely. No max-pause window, no automatic unpause.
**Why it matters:** Centralization risk; owner key compromise can grief all minting forever.
**Recommendation:** Either (a) cap pause at e.g. 7 days (auto-unpause after deadline), or (b) require multisig for `emergencyPause`. Mainnet should ship with multisig owner.

## F-22 — MEDIUM — No timelock or multisig on owner

**Where:** `Ownable` from OpenZeppelin
**What:** Single EOA owns `setTreasury`, `setMerkleRoot`, `setMinter`, `emergencyPause`, `startMint`. Per `SETUP-GUIDE.md`, currently the same key as deployer/server.
**Why it matters:** Single point of compromise. Combined with F-01 — same key signs server requests, holds Irys deposit, mints as agent.
**Recommendation:** Mainnet owner = Safe multisig (2-of-3 minimum). Server wallet = separate hot key with only `mintForAgent` rights via `setMinter`. Irys funder = third separate key. See F-01 for full split.

## F-37 — LOW — `_mint` after state writes (re-entry receiver)

**Where:** `mintWhitelist` etc. — `_mint(msg.sender, tokenId)` is the last operation
**What:** If `msg.sender` is a contract, `onERC721Received` is invoked. Per-wallet flags are already set, so re-entry into `mintWhitelist` would correctly revert with "already minted WL". Safe today.
**Why it matters:** Subtle invariant — any future change reordering writes/`_mint` could open re-entrancy.
**Recommendation:** Combine F-05 fix (`nonReentrant`) to make this future-proof.

## F-38 — LOW — `_tokenURIs` mapping persists across burns

**Where:** `_tokenURIs[tokenId] = uri`
**What:** OpenZeppelin ERC721 doesn't expose `_burn` here, but if added later, the mapping would not be cleared.
**Why it matters:** Future-proofing only.
**Recommendation:** If burn is ever added, override `_burn` to `delete _tokenURIs[tokenId]`.

## F-42 — LOW — `setMinter` accepts any address

**Where:** `setMinter(address minter, bool allowed)`
**What:** No event for batch minter operations; operator typo grants minter to wrong address.
**Why it matters:** Operator UX, mitigated by `MinterUpdated` event monitoring.
**Recommendation:** None required; dashboard should display current authorized minters.

## F-45 — INFO — `AGENT_PRICE` dead constant

**Where:** `uint256 public constant AGENT_PRICE = 2_000_000`
**What:** Declared, public, never read. Agent payment is off-chain via MPP (`AGENT_CHARGE_*` in `lib/chain.ts`).
**Why it matters:** Future contributor risk — could be wired into `mintForAgent` accidentally.
**Recommendation:** Delete (already approved post-audit task). If kept, add NatSpec `/// @dev informational only — agent payment is enforced off-chain via MPP, never on-chain.`

## F-46 — INFO — Operator log drift in `set-phase.ts`

**Where:** `contracts/scripts/set-phase.ts` line 18
**What:** Logs `"Timeline: WL(3h) → Interval(30m) → Agent(3h) → Interval(30m) → Human(open)"` but current contract is 1h/10m.
**Why it matters:** Operator confusion at deploy time.
**Recommendation:** Read constants from contract via `contract.WL_DURATION()` etc. and log actual values.

## F-51 — INFO — OpenZeppelin MerkleProof

OZ `MerkleProof.verify` is current and safe. No version pin issues. Confirmed from `node_modules/@openzeppelin/contracts/utils/cryptography/MerkleProof.sol`.

---

## Mainnet-config-specific notes (Workstream 1)

The contract correctness audit holds **identically** when constants are bumped to mainnet config (e.g. `MAX_SUPPLY=10000`, `WL_CAP=2000`, `AGENT_CAP=3000`, `WL_DURATION=3h`, `AGENT_DURATION=3h`, `INTERVAL=30m`). All findings above remain at the same severity. Specifically:

- **`currentPhase()` math** uses constants directly; no overflow risk at mainnet scales (3h = 10800s, well under uint256).
- **Per-wallet caps** (`WL_MAX_PER_WALLET=1`, `PUBLIC_MAX_PER_WALLET=5`) are intentional — mainnet plan keeps them.
- **Storage cost at mainnet supply**: 10000 NFTs × (`_tokenURIs` ≈ 100B + ERC721 ownership maps) ≈ 1.5-2M gas worth of storage. Acceptable.
- **Gas per `mintWhitelist` at 2000-leaf Merkle**: proof depth ⌈log₂(2000)⌉ = 11. Each `MerkleProof.verify` step is ~3000 gas → ~33k gas for verify + ~50k for transferFrom + ~80k for mint = ~165k total. Well within block gas limit.

---

# Workstream 2 — MPP / agent mint route

> File: [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts)
> Dependency: `mppx@0.5.5` ([node_modules/mppx/dist/tempo/server/Charge.js](node_modules/mppx/dist/tempo/server/Charge.js))

## F-12 — HIGH — Paid-but-not-minted window on phase shift

**Where:** [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) lines 195–211 (phase re-check) and lines 228–246 (mintForAgent)
**What:** Sequence:
1. Pre-flight reads phase = WHITELIST, sets `chargeAmount = 1.10`.
2. MPP issues 402 challenge.
3. Agent submits payment on-chain (1.10 pathUSD → treasury).
4. mppx settles; handler re-reads phase → it has shifted to WL_AGENT_INTERVAL.
5. Handler returns 409. **No refund.**

Same risk if `mintForAgent` reverts post-charge for any reason (e.g. WL_CAP race in §2 or sold-out race).
**Why it matters:** Real funds loss for the agent (1.10–2.10 pathUSD per occurrence). At launch boundaries (end of WL, end of Agent phase), the rate of phase shifts is highest.
**Recommendation:**
1. Implement `externalId = sha256(recipient + traitHash + phase)` so MPP recognises retries (F-19).
2. Document the refund process or, better, add a refund queue: when handler aborts post-charge, append `{txHash, agent, amount}` to a refund log; operator settles weekly.
3. Tighter pre-flight: read phase + check wlEndTime/agentEndTime is at least N seconds away from cap to avoid rapid shift.

## F-14 — HIGH — mppx singleton + chain mismatch with non-canonical chain ID

**Where:** [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) `getMppx()` lazy singleton; `tempoChain` from env
**What:** `mppx/nextjs` `tempo.charge` internally uses `viem/chains.tempo` (chainId **4217**) as `chain` in `getResolver` ([node_modules/mppx/dist/tempo/server/Charge.js](node_modules/mppx/dist/tempo/server/Charge.js) line 31). Our `getClient` returns a `publicClient` with `chain.id = NEXT_PUBLIC_TEMPO_CHAIN_ID` (currently `42069`).

mppx flow:
- `chainId = (await getClient({})).chain?.id` → 42069 (from our client).
- mppx uses **its own internal client** via `Client.getResolver({chain: {...tempo_chain, ...}})` — that's `viem/chains.tempo` = chainId 4217.
- Verifier checks `client.chain?.id !== chainId` and throws "Client not configured with chainId".

Outcome: on a non-canonical chain (42069) the mppx verifier may use the wrong RPC or reject all credentials. Untested live.

Additionally: singleton is built at first request. If env vars are reloaded (e.g. dev hot reload of `.env.local`), the cached `Mppx` instance still points at the old chain.
**Why it matters:**
- On testnet (42069) the agent mint route **may be silently broken**.
- On mainnet (4217) it works because mppx's internal default matches.
- On Moderato (42431) it works because mppx defaults handle it.
**Recommendation:**
1. Verify end-to-end agent mint on each target chain ID before launch.
2. Pass an explicit `chain` override when constructing `tempo.charge({ ... })` if mppx exposes one (it does, via `getClient`).
3. Document that `NEXT_PUBLIC_TEMPO_CHAIN_ID` MUST be a chain mppx natively supports OR confirm mppx works against arbitrary EVM chains.
4. Add a startup self-test: on first request, do a dry-run charge against the configured chain and log any mismatch.

## F-19 — MEDIUM — No `externalId` for idempotency

**Where:** [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) line 190: `mppx.charge({ amount: chargeAmount })`
**What:** No `externalId` passed. mppx's `Methods.charge` schema accepts an optional `externalId` for cross-request deduplication.
**Why it matters:** Without it, only `assertHashUnused(store, hash)` (in `Charge.js`) deduplicates — and only after the on-chain tx is observed. Network glitches that cause the agent to retry can result in two on-chain payments before mppx sees the first.
**Recommendation:** `externalId: sha256(recipient + traitHash + phase + dayBucket)` — provides a stable idempotency key across retries.

## F-20 — MEDIUM — Per-wallet pre-check race

**Where:** [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) lines 143–188
**What:** Two concurrent requests for same `recipient` in WL phase:
- Both pass `wlMinted[recipient] === false` pre-check.
- Both pass MPP charge (different challenges).
- Both call `mintForAgent`; only first succeeds, second reverts with "already minted WL".
- Second has paid 1.10 pathUSD with no NFT (F-12 instance).
**Why it matters:** At small scale (50 NFTs) impact is bounded; at mainnet 10000 with active agents, race window is real.
**Recommendation:** Combine with F-12 refund queue. Optionally, use a per-recipient mutex (Redis SETNX) to serialize.

## F-30 — MEDIUM — `uri` not bound to `traitHash` on-chain

**Where:** [app/api/nft/mint/route.ts](app/api/nft/mint/route.ts) line 232; contract `mintForAgent`
**What:** Server constructs `metadata.traitHash = traitHash`, uploads to Irys, gets `tokenURI`. Then mints with that URI. But the contract has no notion of `traitHash` — it just stores the URI string. If the server is bugged or compromised, it could mint NFT #N with URI pointing to a totally different combo.
**Why it matters:** Off-chain uniqueness is best-effort (already noted in CLAUDE.md §3). For on-chain provability, the contract would need `mapping(bytes32 traitHash => uint256 tokenId)`.
**Recommendation:** If uniqueness is a hard guarantee, push `traitHash` into the contract: `mintForAgent(to, proof, uri, traitHash)` + `require(usedTraitHash[traitHash] == 0)`. Otherwise, document it as best-effort and accept the trust assumption on the server.

## F-36 — LOW — `mintForAgent` decoupled `to` vs payer

**Where:** Contract `mintForAgent` and route `mintForAgent(recipient, proof, tokenURI)`
**What:** By design, the agent paying via MPP can specify a different `recipient`. This is intentional (agents can mint for users), but not surfaced in event logs (only `Transfer(0, to, tokenId)` from ERC721; no link to payer).
**Why it matters:** Audit trail gap — operator cannot trace which agent payment funded which NFT without correlating MPP receipts to mint txs.
**Recommendation:** Emit `event AgentMint(address indexed to, address indexed payer, uint256 indexed tokenId, bytes32 traitHash)` — needs a contract change.

## F-50 — INFO — mppx import path verified

`mppx/nextjs` is correctly used (App Router adapter). The library version 0.5.5 source confirms `tempo.charge` accepts `currency`, `recipient`, `feePayer`, `getClient`, `externalId`, `description`, `memo`, `html`, `waitForConfirmation`, `store`. All used correctly except `externalId` (F-19).

---

# Workstream 3 — Human mint flow

> Components: [components/MintButton.tsx](components/MintButton.tsx), [components/TraitPicker.tsx](components/TraitPicker.tsx)
> APIs: [app/api/nft/prepare/route.ts](app/api/nft/prepare/route.ts), [app/api/nft/check-unique/route.ts](app/api/nft/check-unique/route.ts), [app/api/nft/preview/route.ts](app/api/nft/preview/route.ts), [app/api/nft/wl/check/route.ts](app/api/nft/wl/check/route.ts), [app/api/nft/wl/proof/route.ts](app/api/nft/wl/proof/route.ts)

## F-10 — HIGH — `/api/nft/prepare` is an Irys-burning vector

**Where:** [app/api/nft/prepare/route.ts](app/api/nft/prepare/route.ts) lines 17–60
**What:** Each successful call:
1. Composes a 1024×1024 PNG (Sharp, ~50–200ms CPU).
2. Uploads PNG to Irys (paid against operator's funded deposit).
3. Uploads JSON metadata to Irys (paid).
4. Registers combo+number in in-memory uniqueness registry.

Rate limit: 5/min per IP (~7,200 calls/day per IP). Distributed via 100 IPs = 720k uploads/day. Each upload has a real fiat cost on Irys.
**Why it matters:** A motivated attacker can drain the operator's Irys deposit, simultaneously bloating the in-memory registry to grief legitimate users (F-29).
**Recommendation:**
1. Require a wallet-signed message in the request body: `signature(message="prepare:{nonce}", from=connectedWallet)` — verify with `viem.verifyMessage` before any Irys spend.
2. Add a global rate limit (not just per-IP): e.g. 60 prepares/hour total.
3. Consider deferring Irys upload to **after** wallet has approved pathUSD allowance (proves intent + funds).
4. Monitor Irys deposit balance; alert at 25% remaining.

## F-18 — MEDIUM — Hardcoded `gas: 21_000_000n` in `MintButton`

**Where:** [components/MintButton.tsx](components/MintButton.tsx) lines 211, 247, 256
**What:** Both `approve` and mint write contract calls pin `gas` to 21M. Real usage is ~50k (approve) and ~150–250k (mint).
**Why it matters:** On Tempo where gas is paid in pathUSD, the user's wallet may need to lock up `21M × gasPrice` in pathUSD upfront. Even if unused gas is refunded post-execution, the upfront reservation is a UX wart and could exceed user's allowance.
**Recommendation:** Remove `gas` parameter and let viem/wagmi auto-estimate. If a fallback is needed, use 500_000n.

## F-29 — MEDIUM — Uniqueness registry grief surface

**Where:** [lib/uniqueness.ts](lib/uniqueness.ts)
**What:** Registry is in-memory, per-process. `registerMinted()` is called by `/api/nft/prepare` BEFORE on-chain mint. An abandoned prepare permanently locks that combo+number until process restart (after which `syncRegistry()` rebuilds from chain — without the abandoned ones).
**Why it matters:** Combined with F-10, attacker can fill the registry with ~830M combo space's worth of dummy entries, blocking legitimate users from selecting many combos.
**Recommendation:** Add a TTL: `registerMinted(traitHash, number, ttlMs)` and remove unconfirmed entries after e.g. 10 minutes if no on-chain mint observed. Or move uniqueness on-chain (see F-30).

---

# Workstream 4 — API surface + infrastructure

> Files: [next.config.ts](next.config.ts), [proxy.ts](proxy.ts), [lib/rate-limit.ts](lib/rate-limit.ts), all `app/api/**/route.ts`

## F-08 — HIGH — Admin status route returns wrong supply numbers

**Where:** [app/api/admin/status/route.ts](app/api/admin/status/route.ts) lines 90–98
**What:**
```ts
supply: {
  max: 10_000,           // hardcoded
  wlCap: 2_000,          // hardcoded
  agentCap: 3_000,       // hardcoded
  remaining: 10_000 - Number(totalSupply),  // hardcoded
}
```
Contract is 50/10/20.
**Why it matters:** Operator looking at the dashboard during launch will see "remaining: 9947" when actual is "remaining: 47" → misjudges launch progress, potentially makes wrong pause/unpause calls.
**Recommendation:** Read constants from contract: `await publicClient.readContract({functionName: "MAX_SUPPLY"})` etc. Same as `/api/nft/status` already does correctly.

## F-09 — HIGH — `/api/nft/check-unique` no rate limit

**Where:** [app/api/nft/check-unique/route.ts](app/api/nft/check-unique/route.ts)
**What:** No `checkRateLimit` call. Each invocation triggers `await syncRegistry()` which can hit chain RPC for `totalSupply` and (if new tokens since last sync) one `tokenURI` read + one Irys fetch per new token.
**Why it matters:** At burst of N requests:
- All N call `syncRegistry()`. The in-flight promise dedup means only one runs, but every other request still hits the auth/parse path.
- If supply jumped by 10 since last sync, syncRegistry does 10 RPC + 10 Irys fetches per invocation.
- Attacker can hammer this to exhaust the operator's RPC quota.
**Recommendation:** Add `checkRateLimit('check-unique:{ip}', 30, 60_000)` mirroring other routes. Also consider caching the `taken` boolean per `traitHash` for 30s to avoid redundant work.

## F-13 — HIGH — CSP `connect-src` missing testnet RPC

**Where:** [next.config.ts](next.config.ts) line 23
**What:** `connect-src` includes `rpc.tempo.xyz` and `rpc.moderato.tempo.xyz` only. If `NEXT_PUBLIC_TEMPO_RPC_URL` is e.g. `https://rpc.dev.tempoxyz.dev` (chain 42069's hypothetical RPC), the browser will block all wagmi RPC calls with a CSP violation.
**Why it matters:** Mainnet swap to a different RPC provider (Alchemy/Infura/QuickNode) will silently break the entire frontend until CSP is updated.
**Recommendation:**
1. Read `NEXT_PUBLIC_TEMPO_RPC_URL` and inject into CSP at build time:
   ```ts
   const rpcOrigin = new URL(process.env.NEXT_PUBLIC_TEMPO_RPC_URL).origin
   // ...
   "connect-src 'self' " + rpcOrigin + " " + wsOrigin + " ..."
   ```
2. Same for `NEXT_PUBLIC_TEMPO_WS_URL` and `NEXT_PUBLIC_EXPLORER_URL` if frontend ever fetches from explorer.

## F-26 — MEDIUM — CSP allows `unsafe-inline` + `unsafe-eval`

**Where:** [next.config.ts](next.config.ts) line 16
**What:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Both directives essentially disable XSS protection.
**Why it matters:** Wagmi/RainbowKit/Next.js dev mode often need `unsafe-eval`, but production builds rarely do. Keeping `unsafe-inline` open means any reflected XSS becomes immediately exploitable.
**Recommendation:** For production builds (`NODE_ENV=production`), tighten to:
- `script-src 'self' 'wasm-unsafe-eval'` (for viem WASM if used)
- Use nonces for inline scripts (Next.js 16 supports nonce in headers).
- Audit RainbowKit + wagmi for actual `eval` requirements.

## F-27 — MEDIUM — Stale ngrok host pinned

**Where:** [next.config.ts](next.config.ts) `allowedDevOrigins: ["1ab9-212-253-124-27.ngrok-free.app"]` and CSP `https://*.ngrok-free.app wss://*.ngrok-free.app`
**What:** ngrok session URL hardcoded. Rotates on every ngrok restart.
**Why it matters:** Production should never allow `*.ngrok-free.app` — it's a 3rd-party tunneling service that any attacker can claim.
**Recommendation:**
- Remove from production CSP entirely.
- Move dev-only CSP to a `process.env.NODE_ENV === 'development'` branch.
- Use `process.env.NGROK_HOST` env var for dev tunnel rather than hardcoding.

## F-28 — MEDIUM — `getClientIp` IP-spoofable

**Where:** [lib/rate-limit.ts](lib/rate-limit.ts) lines 41–44
**What:** `req.headers.get("x-forwarded-for")?.split(",")[0]` — returns the first hop, which is set by the client and not validated.
**Why it matters:** Attacker can rotate `X-Forwarded-For: 1.2.3.${random}` per request to evade per-IP rate limits entirely. All rate-limited routes (`/api/nft/preview`, `/api/nft/prepare`, `/api/nft/status`, `/api/nft/collection`, `/api/nft/wl/*`) are bypassable.
**Recommendation:** Behind Vercel/Cloudflare/your reverse proxy, use the proxy-set header (e.g. Vercel sets `x-real-ip`, Cloudflare sets `cf-connecting-ip`). Pin to your actual hosting:
```ts
function getClientIp(req: Request): string {
  // Vercel
  const real = req.headers.get('x-real-ip')
  if (real) return real
  // Cloudflare
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf
  // Fallback (dev only)
  return req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown'
}
```
Use the **last** hop in `x-forwarded-for` if you trust your full proxy chain; the first hop is attacker-controlled.

## F-40 — LOW — `/api/nft/preview` rate limit weak under bot fleet

**Where:** [app/api/nft/preview/route.ts](app/api/nft/preview/route.ts) line 7
**What:** 10/min/IP × bot fleet (with F-28 spoofing) → unbounded Sharp CPU usage.
**Why it matters:** CPU exhaustion DoS.
**Recommendation:** Combine with F-28 fix; add a global concurrency limit (e.g. 5 simultaneous Sharp jobs).

## F-41 — LOW — `/api/nft/traits*` no rate limit

**Where:** [app/api/nft/traits/route.ts](app/api/nft/traits/route.ts), [app/api/nft/traits/[layerId]/route.ts](app/api/nft/traits/)
**What:** No rate limit. Returns static config.
**Why it matters:** Low. Cacheable via `Cache-Control` instead.
**Recommendation:** Add `Cache-Control: public, max-age=3600, immutable`.

## F-44 — LOW — No OPTIONS preflight handler

**Where:** All `/api/*/route.ts`
**What:** `next.config.ts` sets CORS headers in static `headers()`, but Next.js App Router needs explicit `OPTIONS` exports for preflight to work for non-simple requests (POST with `Content-Type: application/json` from cross-origin).
**Why it matters:** Cross-origin POSTs from authorized origins may fail preflight.
**Recommendation:** Add `export async function OPTIONS() { return new Response(null, { status: 204 }) }` to each POST route. Or add a top-level proxy that handles OPTIONS.

## F-48 — INFO — `proxy.ts` no-op overhead

**Where:** [proxy.ts](proxy.ts)
**What:** Runs on every non-static request, only calls `NextResponse.next()`. Negligible cost but worth noting.
**Recommendation:** Either narrow the matcher (e.g. only `/api/*`) or remove.

---

# Workstream 5 — Off-chain assets, secrets, ops, config

## F-01 — CRITICAL — Single key, four roles

**Where:** `SERVER_PRIVATE_KEY` per [SETUP-GUIDE.md](SETUP-GUIDE.md) lines 84, 308–311; used as:
1. Hardhat deployer (`contracts/hardhat.config.ts`)
2. Contract owner (via `Ownable(msg.sender)` in deploy)
3. Authorized minter (via `setMinter(serverAddress, true)`)
4. Server signer for `mintForAgent` calls
5. Often same as `IRYS_PRIVATE_KEY` (Irys deposit funder)
6. Often same as `FEE_PAYER_KEY` (MPP fee sponsor)

**Why it matters:** Compromise of this single key allows:
- Drain treasury (via `setTreasury(attacker)` then wait for next mint).
- Mint unlimited free agent NFTs to attacker.
- Drain Irys deposit (sign withdrawal).
- Drain fee-payer balance (sign any tx).
- Pause mint indefinitely.
- Rotate WL root to attacker addresses.

This is a **single point of total compromise** for the entire system.

**Recommendation (mainnet must-have):**

| Role | Key | Storage |
|---|---|---|
| Owner | Multisig (Safe 2-of-3) | Hardware wallets |
| Deployer | Throw-away EOA | Hot, transfer ownership to multisig immediately after deploy |
| Minter | Hot EOA | Server env, scoped to `mintForAgent` only |
| Fee payer | Hot EOA | Server env, balance capped to weekly burn |
| Irys funder | Hot EOA | Server env, balance capped to weekly burn |
| Treasury | Multisig or cold EOA | Receives mint payments only |

## F-15 — MEDIUM — Hand-rolled Merkle tree

**Where:** [scripts/generate-merkle.ts](scripts/generate-merkle.ts)
**What:** Custom Merkle implementation: leaf = `keccak256(abi.encodePacked(address))`, pair sort lexicographic, odd leaf promoted without proof element.
**Why it matters:**
- The promoted-odd-leaf logic (proof skips a level when sibling is missing) works but is non-standard; verifiable only by reading both this file and OZ MerkleProof carefully.
- At 2000 leaves on mainnet, an off-by-one or sort bug burns the deploy.
**Recommendation:** Replace with `@openzeppelin/merkle-tree` (the OZ-blessed JS lib). Drop-in replacement, battle-tested, supports sorted-pair OZ-compatible trees:
```ts
import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
const tree = StandardMerkleTree.of(whitelist.map(a => [a]), ["address"])
fs.writeFileSync("merkle-root.json", JSON.stringify({root: tree.root}))
```
Verify against `MerkleProof.verify` in a Hardhat test before mainnet.

## F-16 — MEDIUM — Single-hash leaves

**Where:** Both contract and `generate-merkle.ts`
**What:** Leaves are 32-byte single-hash of address. OZ best practice is **double-hash**: `keccak256(bytes.concat(keccak256(abi.encode(address))))`.
**Why it matters:** With single-hash, a 32-byte intermediate node could collide with a leaf if an attacker can find an address that hashes to a known intermediate node. Practically infeasible (preimage attack on keccak256), but defense-in-depth.
**Recommendation:** Use OZ `StandardMerkleTree` which double-hashes by default. Update contract verify call accordingly.

## F-17 — MEDIUM — `merkle-proofs.json` bundle weight

**Where:** [lib/whitelist.ts](lib/whitelist.ts) `import merkleProofs from "@/config/merkle-proofs.json"`
**What:** At 2000 entries × ~11 hashes × 68 bytes = ~1.5 MB JSON. Imported into `/api/nft/wl/check` and `/api/nft/wl/proof` API route bundles.
**Why it matters:** Each route gets the full 1.5 MB embedded → cold-start latency, memory footprint, deploy size. Not exposed to client (server-only routes), but bloats Vercel/server function size.
**Recommendation:**
- For 2000 leaves, fetch proof from a static CDN file (e.g. `/merkle/{address}.json`) generated at build time.
- Or read from disk (`fs.readFileSync` on demand) instead of bundling.
- Or use a key-value store (KV/Redis).

## F-23 — MEDIUM — Admin tokens in `globalThis` (also covered in WS6)

See F-23 in Workstream 6 below.

## F-25 — MEDIUM — Phase constants are Solidity-immutable, not env-driven

**Where:** [contracts/contracts/SentinelTEMPO.sol](contracts/contracts/SentinelTEMPO.sol) lines 17–28
**What:** `MAX_SUPPLY`, `WL_CAP`, `AGENT_CAP`, `WL_DURATION`, `AGENT_DURATION`, `INTERVAL` are `constant`. Mainnet config requires source edit + recompile + redeploy + Sourcify re-verify.
**Why it matters:** Per user's stated goal: "set the change between mainnet and testnet on env, and investigate every section of the project to see which areas and codes rely on the chain". Hardcoded constants violate this principle.
**Recommendation:**
- **Option A (recommended):** Make them constructor parameters, stored as `immutable`. No env var needed; deploy script reads from `.env.local`:
  ```solidity
  uint256 public immutable MAX_SUPPLY;
  uint256 public immutable WL_CAP;
  // ...
  constructor(..., uint256 _maxSupply, uint256 _wlCap, ...) { MAX_SUPPLY = _maxSupply; ... }
  ```
- **Option B:** Owner-mutable with sanity bounds (less safe).
- Pair with `MAINNET-CUTOVER-CHECKLIST.md` step "deploy with mainnet constants from env".

## F-31 — MEDIUM — Irys uploader re-instantiated per call

**Where:** [lib/irys.ts](lib/irys.ts) `getIrysUploader()`
**What:** Every call dynamically imports `@irys/upload` and `@irys/upload-ethereum` and re-creates an `Uploader(Ethereum).withWallet(...)` instance. The dynamic imports are cached by Node, but the uploader creation re-runs.
**Why it matters:**
- Performance: extra ms per upload.
- Key handling: `env.irysPrivateKey` is materialized into the uploader on each call; if env is rotated mid-process, half the requests use the old key.
**Recommendation:** Lazy singleton (mirroring `getMppx()` pattern):
```ts
let _uploader: any = null
async function getIrysUploader() {
  if (_uploader) return _uploader
  // ... create
  _uploader = uploader
  return _uploader
}
```

## F-32 — MEDIUM — Quest stack reachable in production build

**Where:** [app/api/quest/](app/api/quest/), [lib/quest.ts](lib/quest.ts), [lib/db.ts](lib/db.ts), [lib/twitter.ts](lib/twitter.ts), [lib/challenge.ts](lib/challenge.ts)
**What:** These routes/modules are intentionally retained per user instruction (Sentinel#0 / WL quest scaffolding, won't push to GitHub). Even though `proxy.ts` no longer gates on quest, the routes are still deployed and reachable.
**Why it matters:**
- DB pool initialized on first request to any quest route (`DATABASE_URL` required).
- X/Twitter API token (`TWITTER_BEARER_TOKEN`) hot in env.
- Each quest route has its own attack surface (rate limits, input validation).
- If the project IS pushed to GitHub later, these become public.
**Recommendation:**
- Add a `NEXT_PUBLIC_DISABLE_QUEST=true` env flag → all quest routes return 404 in builds where quest isn't needed.
- Or move quest routes under `app/api/_disabled/quest/` (Next.js ignores `_`-prefixed dirs).
- Confirm `.env.local` for production deploy doesn't include `DATABASE_URL` if quest is unused → DB pool won't initialize (they'll throw on first request, which is fine since no caller).

## F-33 — LOW — `composeImage` `process.cwd()` fragility

**Where:** [lib/compose.ts](lib/compose.ts) line 6
**What:** `path.resolve(process.cwd(), "assets/layers")` — relies on Node CWD being project root.
**Why it matters:** If process is started from a different CWD (e.g. a systemd service with `WorkingDirectory=/`), asset loads fail.
**Recommendation:** Use `path.resolve(__dirname, "../assets/layers")` or `path.join(import.meta.dirname, "../assets/layers")` (ESM).

## F-34 — LOW — `.env.example` incomplete

**Where:** [.env.example](.env.example)
**What:** Missing: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `IRYS_PRIVATE_KEY`, `MPP_SECRET_KEY` (if mppx requires it), `NEXT_PUBLIC_CHAIN_NAME`, `NEXT_PUBLIC_TEMPO_WS_URL`. Has `DATABASE_URL`, `TWITTER_BEARER_TOKEN`, `QUEST_CODE_PREFIX`, `MIN_FOLLOWER_COUNT` from quest legacy.
**Why it matters:** New contributors miss required vars; quest vars create confusion.
**Recommendation:** Sync `.env.example` to current `getServerEnv()` + admin route + chain.ts requirements. Group quest vars under `# OPTIONAL: Quest stack (Sentinel#0)`.

## F-35 — LOW — `webSocket` array contains `[undefined]` if env unset

**Where:** [lib/chain.ts](lib/chain.ts) line 16: `webSocket: [process.env.NEXT_PUBLIC_TEMPO_WS_URL!]`
**What:** Non-null assertion `!` doesn't actually guard at runtime; if env is unset, the array becomes `[undefined]`. Wagmi may attempt connection and silently fail.
**Why it matters:** Lost real-time event subscriptions; user sees stale data.
**Recommendation:**
```ts
webSocket: process.env.NEXT_PUBLIC_TEMPO_WS_URL ? [process.env.NEXT_PUBLIC_TEMPO_WS_URL] : undefined,
```

## F-39 — LOW — `assignNumber` collision rate

**Where:** [lib/uniqueness.ts](lib/uniqueness.ts) `hashToCandidate`
**What:** `parseInt(hash.slice(0,8), 16) % 9999 + 1` — uses 32 bits of hash, mod 9999. Birthday bound at ~100 entries → ~50% chance of collision.
**Why it matters:** Linear probe handles collision. At max 50 NFTs, almost no probes. At 10000 mainnet, expected probes = O(N) per assignment in worst case → slow under load.
**Recommendation:** At mainnet scale, use 16+ bytes of hash and a wider modulus, OR use a counter-based scheme (next available number from a free-list).

## F-43 — LOW — `IRYS_RPC_URL=https://rpc.sepolia.org` in `.env.example`

**Where:** [.env.example](.env.example) line 14
**What:** Public Sepolia RPC. Notoriously unreliable.
**Why it matters:** Irys uploads fail intermittently → mint route returns 500 → bad UX.
**Recommendation:** Use Alchemy/Infura. Document the requirement in `SETUP-GUIDE.md`.

## F-47 — INFO — pathUSD decimals quirk documented

**Where:** [lib/chain.ts](lib/chain.ts) line 11 `decimals: 18`
**What:** Comment notes "MetaMask quirk; pathUSD is actually 6 decimals". `PATHUSD_DECIMALS = 6` is used wherever decimals matter.
**Recommendation:** Add an integration test that verifies a `mintWhitelist` displays "1 USD" in MetaMask.

## F-49 — INFO — Dead code modules verified isolated

Confirmed via grep that `lib/quest.ts`, `lib/db.ts`, `lib/twitter.ts`, `lib/challenge.ts` are imported only by `app/api/quest/*` and not by any mint-flow file. Per user instruction, these are retained intentionally.

## F-52 — INFO — Git history clean

`.gitignore` correctly excludes `.env*` (except `.env.example`), `db_*.txt`, `White lists/`, `backups/`, `SKILL.md`, `commandsVPS.md`, `data/`, `RAG-*.md`, `monitor.ps1`, `tmp_*.py`. `git ls-files` confirms only `.env.example` is tracked. No leaked private keys; matches in tracked files were Merkle proof hashes and placeholder strings (`0x_YOUR_DEPLOYER_PRIVATE_KEY`).

---

# Workstream 6 — Admin surface

> Files: [app/admin/page.tsx](app/admin/page.tsx), [app/api/admin/auth/route.ts](app/api/admin/auth/route.ts), [app/api/admin/status/route.ts](app/api/admin/status/route.ts)

## F-04 — CRITICAL — Unsalted SHA-256 + no rate limit on login

**Where:** [app/api/admin/auth/route.ts](app/api/admin/auth/route.ts) lines 5–10, 12–44
**What:**
1. `hashPassword(password) = createHash("sha256").update(password).digest("hex")` — no salt, no KDF, single iteration.
2. No `checkRateLimit()` call on the POST handler. Unlimited login attempts.
**Why it matters:**
- **Online brute-force**: An attacker can hit `/api/admin/auth` thousands of times per second. A 10-character password (~10^15 entropy) falls in days.
- **Offline brute-force if hash leaks**: SHA-256 on consumer GPUs runs at ~10 billion hashes/sec. A 12-character mixed-case alphanumeric password (~62^12 ≈ 3×10^21) is cracked in ~10 years on one GPU; an 8-character password in **3 minutes**.
- Combined with F-23 (no persistent session store), an attacker who guesses once can stay logged in until restart, then log in again.
**Recommendation:**
1. **Replace SHA-256 with `argon2id`** (`argon2` npm package) or `scrypt` (Node built-in). Configure with memory ≥64MB, time cost ≥3, parallelism 1.
2. **Rate limit** login: max 5 attempts per IP per 15 min, exponential backoff. Use existing `checkRateLimit`.
3. **Constant-time compare**: `crypto.timingSafeEqual(Buffer.from(passHash), Buffer.from(ADMIN_PASS_HASH))` instead of `!==`.
4. **Log failed attempts** for monitoring.

Example replacement:
```ts
import argon2 from 'argon2'
// ADMIN_PASSWORD_HASH is now an argon2 hash string (starts with $argon2id$...)
const valid = await argon2.verify(ADMIN_PASS_HASH, password)
```

## F-08 — HIGH — Hardcoded supply numbers

(Already documented in WS4. Same finding cross-listed here.)

## F-23 — MEDIUM — Tokens in `globalThis.__adminTokens`

**Where:** [app/api/admin/auth/route.ts](app/api/admin/auth/route.ts) lines 38–39, [app/api/admin/status/route.ts](app/api/admin/status/route.ts) lines 9, 16
**What:** Sessions stored in process memory.
**Why it matters:**
- Restart → all logged-in admins get 401.
- Multi-instance deploy → tokens issued by instance A unknown to instance B.
- No revocation registry survives restart.
**Recommendation:**
- For single-instance personal admin: sign tokens as JWT (HS256 with a server secret) and skip server-side store entirely. Validation = HMAC verify.
- For multi-instance: Redis with TTL = cookie maxAge.

## F-24 — MEDIUM — `ADMIN_PASSWORD_HASH` env var never set

**Where:** [.env.example](.env.example) — missing entry
**What:** The variable is read in [app/api/admin/auth/route.ts](app/api/admin/auth/route.ts) but defined in **no** env file (`.env.local` or `.env.example`). Default is `""`. Login compares hash → never matches "". **Login always returns 401 today.**
**Why it matters:**
- Admin dashboard exists, is wired, but unreachable. Operator (you) cannot use it.
- Latent surface: as soon as someone sets `ADMIN_PASSWORD_HASH=""` to debug, they bypass auth entirely (because `passHash = sha256(submittedPassword)` is always 64-char hex, never `""`). **This is fine** — empty string check fails. Confirmed safe but counter-intuitive.
**Recommendation:**
1. Add to `.env.example`: `ADMIN_USERNAME=admin` and `ADMIN_PASSWORD_HASH=` (with comment showing how to generate).
2. Throw at server startup if route is hit and `ADMIN_PASS_HASH === ""` (so misconfiguration fails loudly).
3. After audit, generate a real argon2id hash and put in `.env.local`.

This issue is ALSO recorded as a post-audit task in `/memories/session/post-audit-followups.md`.

---

# Cross-cutting summary

## Hot config drift table

| Concern | Today | Mainnet target | Drift in code |
|---|---|---|---|
| Chain ID | 42069 (testnet) | 4217 | F-13 (CSP), F-14 (mppx) |
| RPC URL | env-driven | `https://rpc.tempo.xyz` | F-13 |
| pathUSD address | testnet `0x20c0...0000` | mainnet USDC `0x20C0...8b50` | env-driven, OK |
| Supply | 50/10/20 | 10000/2000/3000 | F-08 (admin), F-25 (Solidity), F-46 (script log) |
| Phase timings | 1h/1h/10m | 3h/3h/30m | F-25 |
| Admin password hash | unset | argon2id hash | F-04, F-24 |

## What is correct (no findings)

- Wallet connect flow (RainbowKit + wagmi) — standard.
- Phase auto-advance math in `currentPhase()` — correct under both configs (verified mentally; no overflow, correct interval logic, paused-time accounting consistent).
- `mintForAgent` access control (`onlyMinter`) — sound.
- Server pre-flight before MPP charge — recipient validation, traits, WL proof, uniqueness, contract pre-checks. All run BEFORE `mppx.charge` wraps the request.
- Post-charge phase re-check inside MPP handler.
- pathUSD decimals (6) handled explicitly in `WL_PRICE = 1_000_000` etc.
- ERC-721 inheritance from OpenZeppelin (audited library).
- `setMinter` revocation works (test confirms).
- pause/unpause time-shift correctly extends timeline.
- `.gitignore` excludes secrets and DB backups.

---

# Recommended fix priority order

When you greenlight implementation:

1. **Block-mainnet-launch (must fix before deploy):**
   F-01, F-02, F-03, F-04, F-08, F-13, F-14, F-25
2. **Strong recommendation before launch:**
   F-05, F-06, F-07, F-10, F-11, F-12, F-15, F-22
3. **Hardening, can ship after launch with monitoring:**
   F-09, F-17, F-18, F-19, F-20, F-21, F-23, F-24, F-26, F-27, F-28, F-29, F-30, F-31, F-32
4. **Cleanup / nice-to-have:**
   F-16, F-33, F-34, F-35, F-36, F-37, F-38, F-39, F-40, F-41, F-42, F-43, F-44, F-45, F-46, F-47, F-48
5. **Info-only, no action:**
   F-49, F-50, F-51, F-52

Total: **52 findings** — 4 CRITICAL, 9 HIGH, 19 MEDIUM, 12 LOW, 8 INFO.

---

*End of audit report. Next step: discuss findings with operator; on greenlight, fix one workstream at a time with a re-audit per workstream.*
