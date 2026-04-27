# SentinelTEMPO — Smart Contract Deployment & Infrastructure Guide

A complete reference for deploying, configuring, and operating the SentinelTEMPO NFT collection on Tempo blockchain, including Irys permanent storage, MPP agent payments, Merkle whitelist, and contract verification.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Environment](#2-prerequisites--environment)
3. [Step-by-Step Deployment](#3-step-by-step-deployment)
4. [Irys — Permanent Data Storage](#4-irys--permanent-data-storage)
5. [MPP — Machine Payments Protocol](#5-mpp--machine-payments-protocol)
6. [Human Mint vs AI Agent Mint](#6-human-mint-vs-ai-agent-mint)
7. [Sourcify — Contract Verification](#7-sourcify--contract-verification)
8. [Whitelist Management (No Redeployment)](#8-whitelist-management-no-redeployment)
9. [Phase Timeline](#9-phase-timeline)
10. [Cost Estimates](#10-cost-estimates)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

The system involves **three chains/networks** working together:

```
┌─────────────────────────────────────────────────────────┐
│                    TEMPO CHAIN (Moderato)                │
│  NFT Contract: ERC-721 with on-chain phase system       │
│  - Stores ownership (who owns token #X)                 │
│  - Stores tokenURI (pointer to Irys metadata)           │
│  - Handles payments in pathUSD                          │
│  - Merkle-based whitelist verification                  │
└───────────────────────────┬─────────────────────────────┘
                            │ tokenURI points to ↓
┌─────────────────────────────────────────────────────────┐
│                    IRYS CHAIN (Datachain)                │
│  Permanent decentralized storage                        │
│  - Stores NFT images (PNG) — one-time payment, forever  │
│  - Stores NFT metadata (JSON) — one-time payment        │
│  - Each upload gets a unique transaction ID              │
│  - Accessible via gateway: https://gateway.irys.xyz/ID  │
└─────────────────────────────────────────────────────────┘
                            │ funded via ↓
┌─────────────────────────────────────────────────────────┐
│                  ETHEREUM (Sepolia Testnet)              │
│  Irys devnet node funded with Sepolia ETH               │
│  - Server wallet deposits ETH into Irys node balance    │
│  - That balance pays for data uploads                   │
└─────────────────────────────────────────────────────────┘
```

### Key Wallets

| Role | Address | Purpose |
|---|---|---|
| Server / Deployer / Irys | `0x0Be3b0A137EDb64F5Ce91D4f8722F7BfeFe26b87` | Deploys contract, uploads to Irys, calls `mintForAgent` |
| Fee Payer (MPP) | `0x546DEd146813cb5dC7E7F8590f8729518017b05D` | Sponsors gas for MPP payment transactions |
| Treasury | `0x27d231B931476E799e7DD9977511239490693150` | Receives mint revenue |

---

## 2. Prerequisites & Environment

### Required `.env.local` Variables

```env
# ─── Tempo Network ───
NEXT_PUBLIC_TEMPO_CHAIN_ID=42431
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.moderato.tempo.xyz
NEXT_PUBLIC_EXPLORER_URL=https://explore.testnet.tempo.xyz
NEXT_PUBLIC_CHAIN_NAME=Tempo Moderato

# ─── Addresses (updated after each deployment) ───
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x<NEW_CONTRACT_ADDRESS>
NEXT_PUBLIC_PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# ─── Server Wallet (NEVER prefix with NEXT_PUBLIC_) ───
SERVER_PRIVATE_KEY=0x<DEPLOYER_PRIVATE_KEY>
FEE_PAYER_KEY=0x<FEE_PAYER_PRIVATE_KEY>
MPP_SECRET_KEY=<RANDOM_32_BYTE_HEX>

# ─── Treasury ───
NFT_TREASURY_WALLET=0x27d231B931476E799e7DD9977511239490693150

# ─── Irys ───
IRYS_PRIVATE_KEY=0x<SAME_AS_SERVER_PRIVATE_KEY>
IRYS_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
IRYS_NETWORK=devnet

# ─── App ───
NEXT_PUBLIC_APP_URL=https://<YOUR_NGROK_URL>.ngrok-free.app
```

### About `MPP_SECRET_KEY`

**What:** A random 32-byte hex string used by `Mppx.create()` for HMAC challenge signing during the 402 payment flow.

**Why:** When an AI agent calls a paid endpoint (e.g., `/api/nft/mint`), the server first returns an HTTP 402 with a signed challenge. The `MPP_SECRET_KEY` is used to generate and verify that challenge, ensuring the payment request is authentic and hasn't been tampered with. It is NOT a wallet key — just a server-side secret.

**Generate one:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Step-by-Step Deployment

### Step 1 — Deploy the Contract

```powershell
cd contracts
npx hardhat run scripts/deploy.ts --network moderato
```

**What it does:**
- Deploys `SentinelTEMPO.sol` with constructor args: `pathUSD` address, `treasury` wallet, and a placeholder zero Merkle root
- The deployer wallet (`SERVER_PRIVATE_KEY`) becomes the contract `owner`

**Output:**
```
Deploying with: 0x0Be3b0A137EDb64F5Ce91D4f8722F7BfeFe26b87
SentinelTEMPO deployed to: 0xNEW_ADDRESS
```

**After:** Update `.env.local` with the new `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS`.

### Step 2 — Generate Merkle Root

```powershell
cd ..   # back to project root
npx tsx scripts/generate-merkle.ts
```

**What it does:**
- Reads `config/whitelist.json` (array of whitelisted addresses)
- Hashes each address: `keccak256(abi.encodePacked(address))`
- Builds a sorted binary Merkle tree (OpenZeppelin-compatible)
- Saves root to `config/merkle-root.json`
- Saves per-address proofs to `config/merkle-proofs.json`

### Step 3 — Set Merkle Root on Contract

```powershell
cd contracts
$env:NEXT_PUBLIC_NFT_CONTRACT_ADDRESS="0xNEW_ADDRESS"
npx hardhat run scripts/set-merkle-root.ts --network moderato
```

**What it does:**
- Calls `setMerkleRoot(root)` on the contract
- Only the contract owner can call this
- Can be called again anytime to update the whitelist (no redeployment needed)

### Step 4 — Authorize Server as Minter

```powershell
$env:NEXT_PUBLIC_NFT_CONTRACT_ADDRESS="0xNEW_ADDRESS"
npx hardhat run scripts/set-minter.ts --network moderato
```

**What it does:**
- Calls `setMinter(serverAddress, true)` on the contract
- Grants the server wallet permission to call `mintForAgent()`
- Without this, agent mints will revert with "not authorized"

### Step 5 — Verify on Sourcify (see Section 7)

```powershell
npx hardhat verify --network moderato 0xNEW_ADDRESS "0x20c0000000000000000000000000000000000000" "0x27d231B931476E799e7DD9977511239490693150" "0x0000000000000000000000000000000000000000000000000000000000000000"
```

### Step 6 — Update SKILL.md

Update the NFT Contract address in `SKILL.md` so AI agents use the correct contract.

### Step 7 — Restart Dev Server + Start Mint

```powershell
# Restart dev server to pick up new env
pnpm run dev

# When ready to go live:
cd contracts
$env:NEXT_PUBLIC_NFT_CONTRACT_ADDRESS="0xNEW_ADDRESS"
npx hardhat run scripts/set-phase.ts --network moderato
```

This calls `startMint()` — the on-chain autonomous timeline begins:
`WL(3h) → Interval(30m) → Agent(3h) → Interval(30m) → Human(open)`

---

## 4. Irys — Permanent Data Storage

### What is Irys?

Irys is a **Layer 1 blockchain** (sometimes called a "datachain") purpose-built for permanent data storage. It evolved from Bundlr Network and runs on top of Arweave's storage infrastructure but with its own consensus, execution engine (IrysVM), and native token (IRYS).

### Why Irys for NFTs?

- **One-time payment** — pay once, data stored forever. No monthly fees, no renewals.
- **Permanent & decentralized** — miners continuously prove they still have your data. If they don't, they get slashed.
- **Gateway access** — anyone can retrieve data via `https://gateway.irys.xyz/<txId>` (mainnet) or `https://devnet.irys.xyz/<txId>` (devnet).
- **Cheap** — ~$0.005-0.015 per file on mainnet. For a 10K collection: ~$100-300 total, one-time.

### How Data Gets Stored

1. **Upload** → Data goes to a Bundler (aggregates multiple uploads into one bundle transaction)
2. **Submit Ledger** → Miners receive the data, generate cryptographic **ingress proofs** confirming receipt
3. **Publish Ledger** → Once enough ingress proofs are collected, data is promoted to permanent storage. Its Merkle root is recorded.
4. **Ongoing verification** → Miners are periodically challenged with random sampling to prove they still have the data. Data is packed with **Matrix Packing** to prevent faking.

### The Irys-NFT Connection

```
TEMPO CONTRACT                           IRYS
┌───────────────────┐                    ┌─────────────────────────────┐
│ Token #7          │                    │ TX: ABC123...               │
│   owner: 0xUser   │                    │   data: metadata.json       │
│   tokenURI: ─────────────────────────→ │   { "image": "irys/XYZ..." │
│                   │                    │     "name": "Sentinel #7"   │
└───────────────────┘                    │     "attributes": [...] }   │
                                         └──────────────┬──────────────┘
                                                        │ image points to ↓
                                         ┌─────────────────────────────┐
                                         │ TX: XYZ789...               │
                                         │   data: image.png           │
                                         └─────────────────────────────┘
```

Each NFT results in **2 Irys uploads**: the composed PNG image, then the ERC-721 metadata JSON (which references the image URL). The metadata JSON's Irys URL becomes the `tokenURI` stored in the contract.

### Irys Node Funding — CRITICAL

**Having ETH in your wallet is NOT the same as having Irys node balance.**

You must explicitly fund the Irys node by depositing ETH into it. Without this, uploads will fail with "Not enough balance for transaction."

```typescript
// Fund the Irys node (one-time, or top up as needed)
const irys = await getIrysUploader()
await irys.fund(irys.utils.toAtomic(0.005)) // deposit 0.005 ETH
```

Or via CLI:
```bash
npx irys fund 5000000000000000 -n devnet -t ethereum -w $PRIVATE_KEY --provider-url https://ethereum-sepolia-rpc.publicnode.com
```

**Devnet vs Mainnet:**

| | Devnet | Mainnet |
|---|---|---|
| Gateway | `https://devnet.irys.xyz/<txId>` | `https://gateway.irys.xyz/<txId>` |
| Payment | Free Sepolia ETH (faucet) | Real ETH (or SOL, MATIC, etc.) |
| Retention | ~60 days then deleted | Permanent forever |
| Config | Requires `.withRpc(url).devnet()` | Default (no extra config) |
| Env | `IRYS_NETWORK=devnet` | `IRYS_NETWORK=mainnet` |

### Library Analogy

Think of Irys as a **permanent library**:
- Books (images + metadata) are written once and shelved forever
- The library card catalog (Tempo contract) tracks who owns which book
- When a book changes hands (NFT sold), only the catalog entry updates — the book stays on the same shelf

---

## 5. MPP — Machine Payments Protocol

### What is MPP?

MPP (Machine Payments Protocol) lets AI agents pay for API calls automatically using pathUSD on Tempo. It follows an HTTP 402 (Payment Required) flow.

### How the 402 Flow Works

```
AI Agent                         Server                         Tempo Chain
   │                               │                               │
   │──── POST /api/nft/mint ──────→│                               │
   │                               │                               │
   │←──── HTTP 402 ───────────────│                               │
   │      WWW-Authenticate:        │                               │
   │      (signed challenge)       │                               │
   │                               │                               │
   │──── pathUSD transfer ────────────────────────────────────────→│
   │      (agent pays server)      │                               │
   │                               │                               │
   │──── POST /api/nft/mint ──────→│                               │
   │      Authorization: (proof)   │                               │
   │                               │──── verify payment ──────────→│
   │                               │←─── confirmed ───────────────│
   │                               │                               │
   │                               │──── mintForAgent() ──────────→│
   │                               │←─── tokenId + receipt ───────│
   │                               │                               │
   │←──── 200 OK (NFT data) ─────│                               │
```

### Why `MPP_SECRET_KEY` is Required

The server uses `MPP_SECRET_KEY` to:
1. **Sign** the 402 challenge (HMAC) so the agent knows it's from the real server
2. **Verify** the agent's authorization header on the retry request

Without it, `Mppx.create()` throws an error. It's not a blockchain key — just a server-side secret for request signing.

### Agent Setup

Each AI agent needs:
1. Its own wallet with pathUSD balance on Tempo
2. `MPPX_PRIVATE_KEY` environment variable set
3. Use `npx mppx` instead of `curl` for paid endpoints

```bash
# Agent calls mint (mppx handles the 402 flow automatically)
npx mppx -s -r https://rpc.moderato.tempo.xyz -X POST \
  -H "Content-Type: application/json" \
  -d @mint-body.json \
  https://YOUR_URL/api/nft/mint
```

---

## 6. Human Mint vs AI Agent Mint

### Human Mint (Direct On-Chain)

```
Human Wallet ──── mintWhitelist(proof[], tokenURI) ──── NFT Contract
                         (1 transaction)
```

- Human connects wallet (MetaMask, OKX) via the frontend
- Frontend composes image, uploads to Irys, builds metadata
- Human signs one transaction that includes payment + mint
- Explorer shows: `mintWhitelist(bytes32[], string)` with decoded Irys URL

### AI Agent Mint (MPP — 2 Transactions)

```
Agent Wallet ──── pathUSD transfer ──── pathUSD Contract (payment)    TX 1
Server Wallet ── mintForAgent(to, proof, uri) ── NFT Contract (mint)  TX 2
```

- Agent calls `/api/nft/mint` with trait selections + recipient address
- MPP handles payment: agent sends pathUSD to treasury (TX 1)
- Server composes image, uploads to Irys, builds metadata
- Server calls `mintForAgent(recipient, proof, tokenURI)` (TX 2)
- Explorer shows both TXs — the Irys link is in TX 2's decoded input data

### Side-by-Side Comparison

| | Human Mint | AI Agent Mint |
|---|---|---|
| **# of TXs on-chain** | 1 | 2 (payment + mint) |
| **Who pays** | Human wallet → contract | Agent wallet → pathUSD (TX 1) |
| **Who mints** | Human wallet → contract | Server wallet → contract (TX 2) |
| **Contract function** | `mintWhitelist(proof[], tokenURI)` | `mintForAgent(address, proof[], tokenURI)` |
| **Irys link visible in** | TX input data (decoded) | TX 2 input data (decoded after Sourcify verification) |
| **Price (WL)** | 1.00 pathUSD | 1.10 pathUSD (+$0.10 agent surcharge) |
| **Price (Public)** | 3.00 pathUSD | 2.10 pathUSD |

---

## 7. Sourcify — Contract Verification

### The Problem

Without verification, the Tempo explorer shows raw hex data for function calls:
```
0x40640778000000000000000000000000d6eb3c...
```

With verification, the explorer decodes it into readable format:
```
mintForAgent(address to, bytes32[] proof, string uri)
  to: 0xD6EB3C05...
  proof: [0x611147..., ...]
  uri: https://devnet.irys.xyz/HyTT5icn4eswMpW4gVawuGCsbzp5q8YvZykMFbwGuTwn
```

### What is Sourcify?

Sourcify is a **decentralized contract verification registry**. When you verify a contract, Sourcify stores the source code + ABI + compiler settings, and any explorer that integrates with Sourcify can decode transactions.

The Tempo explorer pulls ABI data from Sourcify. Without it, custom functions like `mintForAgent` (which don't exist in any public signature database) show as raw hex.

### How to Verify

**1. Enable Sourcify in `hardhat.config.ts`:**

```typescript
const config: HardhatUserConfig = {
  // ... solidity, networks config ...
  sourcify: {
    enabled: true,
  },
}
```

**2. Run the verify command:**

The constructor takes a single `Config` struct (tuple), so we pass args via a JS file:

```js
// contracts/scripts/constructor-args.cjs — keep in sync with what was deployed
module.exports = [
  {
    paymentToken:  process.env.NEXT_PUBLIC_PATHUSD_ADDRESS,
    treasury:      process.env.NFT_TREASURY_WALLET,
    merkleRoot:    process.env.MINT_MERKLE_ROOT,
    maxSupply:     50,
    wlCap:         10,
    agentCap:      20,
    wlDuration:    3600,
    agentDuration: 3600,
    interval:      600,
    wlPrice:       1150000,   // 1.15 pathUSD
    humanPrice:    3150000,   // 3.15 pathUSD
  },
]
```

```powershell
cd contracts
npx hardhat verify --network moderato `
  0xNEW_CONTRACT_ADDRESS `
  --constructor-args scripts/constructor-args.cjs
```

Every value in the args file MUST match the values fed into `scripts/deploy.ts` at the moment of deployment (read from `MINT_*` env vars). If they differ, Sourcify rejects the verification.

**3. Expected output:**

```
Successfully verified contract SentinelTEMPO on Sourcify.
https://repo.sourcify.dev/contracts/full_match/42431/0xNEW_ADDRESS/
```

The Etherscan error that follows is expected and harmless — Tempo isn't an Etherscan chain.

**4. Verify it works:**

Check any transaction on the explorer — function names, parameters, and Irys URLs should now be decoded instead of raw hex.

### Important Notes

- Verify **once per deployment** — Sourcify stores it permanently
- The constructor args file MUST be in sync with the live `deploy.ts` config; we keep `contracts/scripts/constructor-args.cjs` updated whenever prices/caps/timings change
- Run verification **immediately after deploy** so the first test transactions are decoded from the start (matches how mainnet will operate)
- Verification takes effect retroactively — even transactions made before verification will be decoded

### Pre-launch checklist (testnet AND mainnet — keep them identical)

Run in this exact order. Testnet is supposed to mirror mainnet exactly so we never hit a surprise on launch day.

```powershell
# 1. Confirm price/cap/timing env vars match what you intend to launch:
#    MINT_WL_PRICE_BASE_UNITS, MINT_HUMAN_PRICE_BASE_UNITS,
#    MINT_WL_CAP, MINT_AGENT_CAP, MINT_MAX_SUPPLY,
#    MINT_WL_DURATION_SECONDS, MINT_AGENT_DURATION_SECONDS, MINT_INTERVAL_SECONDS,
#    MINT_MERKLE_ROOT (matches config/merkle-root.json)
cd contracts

# 2. Deploy
npx hardhat run scripts/deploy.ts --network moderato   # or --network tempo for mainnet
# → copy the printed address into NEXT_PUBLIC_NFT_CONTRACT_ADDRESS in .env.local

# 3. Authorise the server wallet as minter
npx hardhat run scripts/set-minter.ts --network moderato

# 4. Update scripts/constructor-args.cjs with the exact values used (prices/caps/timings)
#    then verify on Sourcify BEFORE startMint so the first user-visible txs are decoded
npx hardhat verify --network moderato 0xNEW_ADDRESS --constructor-args scripts/constructor-args.cjs

# 5. Start the autonomous phase timeline (point of no return for that contract)
npx hardhat run scripts/set-phase.ts --network moderato
```

Any change to `MINT_*` env vars between deploys means the previous `constructor-args.cjs` is wrong — update it before re-verifying.

---

## 8. Whitelist Management (No Redeployment)

Adding/removing addresses from the whitelist does **NOT** require deploying a new contract. The contract has a `setMerkleRoot()` function that the owner can call anytime.

### To Add a New Address

**1. Edit `config/whitelist.json`:**
```json
[
  "0xExistingAddress1",
  "0xExistingAddress2",
  "0xNEW_ADDRESS_TO_ADD"
]
```

**2. Regenerate the Merkle root:**
```powershell
npx tsx scripts/generate-merkle.ts
```

**3. Set the new root on the contract:**
```powershell
cd contracts
$env:NEXT_PUBLIC_NFT_CONTRACT_ADDRESS="0xCONTRACT_ADDRESS"
npx hardhat run scripts/set-merkle-root.ts --network moderato
```

That's it. The new address is immediately whitelisted.

---

## 9. Phase Timeline

The contract uses a fully autonomous on-chain phase system. Once `startMint()` is called, phases advance automatically based on time:

```
CLOSED → WHITELIST (3h) → WL_AGENT_INTERVAL (30m) → AGENT_PUBLIC (3h) → AGENT_HUMAN_INTERVAL (30m) → HUMAN_PUBLIC (open-ended)
```

| Phase | Who can mint | Duration | Price |
|---|---|---|---|
| `CLOSED` | Nobody | Until `startMint()` is called | — |
| `WHITELIST` | WL addresses (human + agent) | 3 hours | 1.00 / 1.10 pathUSD |
| `WL_AGENT_INTERVAL` | Nobody (cooldown) | 30 minutes | — |
| `AGENT_PUBLIC` | AI agents only (via server) | 3 hours | 2.10 pathUSD |
| `AGENT_HUMAN_INTERVAL` | Nobody (cooldown) | 30 minutes | — |
| `HUMAN_PUBLIC` | Humans only (wallet connect) | Until sold out | 3.00 pathUSD |

### Supply Caps

| | Cap |
|---|---|
| WL Mint | 10 |
| Agent Mint | 20 |
| Total Supply | 50 |
| Per-wallet (WL) | 1 |
| Per-wallet (Public) | 5 |

---

## 10. Cost Estimates

### Irys Storage (One-Time, Permanent)

| | Per Mint (2 uploads) | 50 Supply | 10K Supply |
|---|---|---|---|
| Best case | ~$0.01 | ~$0.50 | ~$100 |
| Worst case | ~$0.03 | ~$1.50 | ~$300 |

### Tempo Gas (Per Transaction)

Negligible on Tempo — gas costs are extremely low by design (payments-optimized chain).

### Comparison with Alternatives

| Solution | Payment Model | 10K Collection Cost |
|---|---|---|
| **Irys** | One-time | $100-300 total, forever |
| IPFS + Pinata | Monthly ($20-100+) | $240-1200/year, recurring |
| On-chain (base64) | Gas at mint | Very expensive for images |
| AWS S3 | Monthly | ~$5/month, centralized, no permanence |

---

## 11. Troubleshooting

### "Not enough balance for transaction" (Irys)

**Cause:** Irys node isn't funded. Having ETH in your wallet ≠ Irys node balance.

**Fix:** Fund the Irys node explicitly:
```typescript
const irys = await getIrysUploader()
await irys.fund(irys.utils.toAtomic(0.005)) // 0.005 ETH
```

### "MPP_SECRET_KEY is required"

**Cause:** `Mppx.create()` requires this env var for HMAC challenge signing.

**Fix:** Generate and add to `.env.local`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Agent mint reverts with "already minted WL"

**Cause:** The wallet already used its 1 WL mint allowance per the contract's `wlMintedCount` mapping.

**Fix:** Wait for `AGENT_PUBLIC` phase, or use a different recipient address.

### Explorer shows raw hex instead of decoded data

**Cause:** Contract not verified on Sourcify.

**Fix:** Run the verify command (see Section 7).

### "not authorized" revert on mintForAgent

**Cause:** Server wallet hasn't been granted minter role.

**Fix:** Run `set-minter.ts` (Step 4 of deployment).

---

## Quick Reference — Full Deployment Checklist

```
□ 1. Deploy contract          → npx hardhat run scripts/deploy.ts --network moderato
□ 2. Update .env.local        → NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0xNEW
□ 3. Generate Merkle root     → npx tsx scripts/generate-merkle.ts
□ 4. Set Merkle root          → npx hardhat run scripts/set-merkle-root.ts --network moderato
□ 5. Set minter               → npx hardhat run scripts/set-minter.ts --network moderato
□ 6. Verify on Sourcify       → npx hardhat verify --network moderato 0xNEW "pathUSD" "treasury" "0x00..00"
□ 7. Update SKILL.md          → New contract address
□ 8. Fund Irys node           → If fresh wallet, deposit ETH into Irys node
□ 9. Restart dev server       → pnpm run dev
□ 10. Start mint              → npx hardhat run scripts/set-phase.ts --network moderato
```
