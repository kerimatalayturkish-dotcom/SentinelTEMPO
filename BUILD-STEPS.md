# SentinelTEMPO — Step-by-Step Build Plan

> Target: Testnet (Moderato) first — mainnet switch is one `.env` change  
> Date: April 2, 2026

---

## How Mainnet Switching Works

Every network-dependent value lives in `.env.local`. To switch from testnet to mainnet, you change **6 env vars** and redeploy:

```env
# ── TESTNET (what we build with) ──
NEXT_PUBLIC_TEMPO_CHAIN_ID=42431
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.moderato.tempo.xyz
NEXT_PUBLIC_EXPLORER_URL=https://explore.testnet.tempo.xyz
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...testnet-deployed...
IRYS_NODE=https://devnet.irys.xyz

# ── MAINNET (swap these 6 lines when ready) ──
# NEXT_PUBLIC_TEMPO_CHAIN_ID=4217
# NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.tempo.xyz
# NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.tempo.xyz
# NEXT_PUBLIC_EXPLORER_URL=https://explore.tempo.xyz
# NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...mainnet-deployed...
# IRYS_NODE=https://node2.irys.xyz
```

The pathUSD address (`0x20c0...`) is the same on both networks. The code itself never references chain IDs directly — it reads from env.

---

## Step 1 — Project Scaffold & Chain Config

**What we build:** Empty Next.js project with Tempo chain wired up.

```
Files created:
├── package.json              ← pnpm, deps installed
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .env.local                ← testnet defaults (Moderato)
├── .env.example              ← template without secrets
├── .gitignore
├── lib/
│   └── chain.ts              ← Tempo chain definition (reads from env)
└── app/
    ├── layout.tsx             ← root layout (providers will come later)
    └── page.tsx               ← placeholder "SentinelTEMPO" landing
```

**What it does:**
- `pnpm create next-app` with TypeScript, Tailwind, App Router
- Install core deps: `viem`, `wagmi`, `@tanstack/react-query`, `sharp`, `mppx`
- `lib/chain.ts` exports a chain object built from `NEXT_PUBLIC_TEMPO_*` env vars
- Validates env vars are set on startup
- App runs on `localhost:3000` showing a placeholder page

**Why first:** Everything depends on the project existing and the chain config being right. One source of truth for network settings.

---

## Step 2 — Smart Contract + Hardhat

**What we build:** The SentinelTEMPO.sol contract and deployment tools.

```
Files created:
├── contracts/
│   ├── SentinelTEMPO.sol          ← full ERC-721 (from plan)
│   ├── hardhat.config.ts          ← Moderato + Mainnet network configs
│   ├── package.json               ← separate deps (hardhat, OZ)
│   ├── scripts/
│   │   ├── deploy.ts              ← deploy contract to network
│   │   └── set-merkle-root.ts     ← admin: update WL root on-chain
│   └── test/
│       └── SentinelTEMPO.test.ts  ← basic tests (mint, WL, access control)
```

**What it does:**
- Full contract: `mintWhitelist()`, `mintPublic()`, `mintTo()`, Phase enum, Merkle proof
- Hardhat configured with `DEPLOYER_PRIVATE_KEY` for both networks (reads from env)
- `pnpm run deploy --network moderato` deploys and prints the contract address
- `pnpm run set-merkle-root --network moderato` updates WL root
- Basic tests run against a local Hardhat node

**What we verify on testnet:**
- Contract deploys successfully
- `mintPublic()` works with testnet pathUSD (get some from faucet)
- `mintTo()` works from the authorized minter address
- Phase transitions work (CLOSED → WHITELIST → PUBLIC)

**Output:** Deployed contract address → put in `.env.local` as `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS`

---

## Step 3 — Whitelist System (Merkle Tree)

**What we build:** Merkle tree generation + WL API endpoints.

```
Files created:
├── config/
│   ├── whitelist.json             ← address list (start with a few test addresses)
│   ├── merkle-root.json           ← generated root
│   └── merkle-proofs.json         ← generated proofs per address
├── scripts/
│   └── generate-merkle.ts         ← reads whitelist.json, outputs root + proofs
├── lib/
│   └── whitelist.ts               ← load proofs, check WL status
└── app/api/nft/wl/
    ├── check/route.ts             ← GET ?address=0x... → { whitelisted: bool }
    └── proof/route.ts             ← GET ?address=0x... → { proof: [...] }
```

**What it does:**
- `pnpm run generate-merkle` builds the tree, saves root + proofs to `config/`
- API endpoints serve WL checks and proofs (reads from JSON files, no DB)
- After generating, we call `set-merkle-root` to push root to the deployed contract

**What we verify on testnet:**
- Generate Merkle tree with 3-5 test addresses
- Set root on contract
- Call `/api/nft/wl/check?address=0xTEST` → returns `true`
- Call `/api/nft/wl/proof?address=0xTEST` → returns valid proof array
- Call `mintWhitelist(proof, uri)` directly on-chain with the proof → succeeds

---

## Step 4 — Trait System & Image Composition

**What we build:** The trait catalog, image compositor, and preview endpoint.

```
Files created:
├── config/
│   └── traits.json                ← trait catalog definition
├── assets/
│   └── layers/                    ← placeholder PNGs (real art comes later)
│       ├── 0-background/
│       ├── 1-body/
│       ├── 2-head/
│       ├── 3-eyes/
│       ├── 4-accessories/
│       └── 5-color/
├── lib/
│   ├── traits.ts                  ← load traits.json, validate selections
│   └── compose.ts                 ← Sharp: stack layers → PNG buffer
└── app/api/nft/
    ├── traits/
    │   ├── route.ts               ← GET → full trait catalog
    │   └── [layerId]/route.ts     ← GET → options for one layer
    └── preview/
        └── route.ts               ← POST { traits } → PNG image response
```

**What it does:**
- `traits.json` defines layers (background, body, head, eyes, accessories, color) with available options per layer
- `compose.ts` uses Sharp to stack selected layer PNGs in order → outputs a 1024x1024 PNG
- Preview endpoint accepts trait selections, composes the image, returns PNG (no mint, no cost)
- For now we use simple colored rectangles / placeholder PNGs until the real art arrives

**What we verify:**
- `GET /api/nft/traits` returns the full catalog
- `POST /api/nft/preview` with valid traits returns a composed PNG
- Invalid trait selections return proper errors

**Note:** This step doesn't touch the blockchain at all. It's pure image pipeline.

---

## Step 5 — Irys Upload Pipeline

**What we build:** Upload composed images + metadata JSON to Irys (permanent storage).

```
Files created:
├── lib/
│   └── irys.ts                    ← Irys client + upload functions
```

**What it does:**
- `irys.ts` creates an Irys uploader configured from `IRYS_NODE` env var
  - Testnet: `https://devnet.irys.xyz` (free uploads)
  - Mainnet: `https://node2.irys.xyz` (paid, uses funds from wallet)
- `uploadImage(pngBuffer)` → returns Irys URL (`https://gateway.irys.xyz/<tx-id>`)
- `uploadMetadata(name, description, imageUrl, attributes)` → returns tokenURI
- Follows the same metadata format used by "Punk On Tempo" (confirmed working on Tempo explorers)

**What we verify:**
- Upload a test image to Irys devnet → get back a gateway URL
- Upload metadata JSON referencing the image → get back a tokenURI
- The tokenURI resolves and returns valid JSON with the image link

---

## Step 6 — Wallet Connect + Human Mint Flow (Frontend)

**What we build:** The full human minting experience — connect wallet, pick traits, preview, pay, mint.

```
Files created:
├── app/
│   ├── providers.tsx              ← WagmiProvider + QueryClientProvider
│   ├── mint/
│   │   └── page.tsx               ← Mint page
│   └── layout.tsx                 ← Updated with providers
├── components/
│   ├── WalletConnect.tsx          ← Connect/disconnect + "Add Tempo" button
│   ├── WhitelistChecker.tsx       ← Shows WL status + correct price
│   ├── TraitPicker.tsx            ← Layer-by-layer selector
│   ├── NFTPreview.tsx             ← Live preview image
│   └── MintButton.tsx             ← approve pathUSD → call mint contract
└── lib/
    └── contract.ts                ← Contract ABI + read/write helpers (viem)
```

**What it does:**
- Wagmi config with `tempoModerato` chain (reads from env), MetaMask connector, auto-discovery
- "Add Tempo to MetaMask" button using `useSwitchChain`
- After wallet connect → auto-check WL status → show correct price
- Trait picker UI → each layer shows available options from `traits.json`
- Live preview → calls `/api/nft/preview` on trait change
- Mint button flow:
  1. Server composes final image + uploads to Irys → returns `tokenURI`
  2. User approves pathUSD spending (`approve(contract, amount)`)
  3. User calls `mintWhitelist(proof, tokenURI)` or `mintPublic(tokenURI)`
  4. Show tx hash + link to explorer

**What we verify on testnet:**
- Connect MetaMask to Moderato testnet
- Get testnet pathUSD from faucet
- Full WL mint flow: connect → see WL price → pick traits → preview → approve → mint → see NFT
- Full public mint flow: same but 8 pathUSD, no proof needed
- TX visible on `explore.testnet.tempo.xyz`

---

## Step 7 — MPP Agent Mint Flow (Backend)

**What we build:** The MPP-enabled `/api/nft/mint` endpoint that agents call.

```
Files created:
├── app/api/nft/
│   ├── mint/route.ts              ← POST — MPP-enabled (402 challenge/pay/mint)
│   └── status/route.ts            ← GET — supply, phase, prices
```

**What it does:**
- Server creates `Mppx.create()` with Tempo payment method, pathUSD currency, fee sponsorship
- `POST /api/nft/mint` with `{ traits, recipient }`:
  1. Validates traits + recipient address
  2. Checks WL status of recipient → determines price (5 or 8)
  3. Returns 402 challenge with the price
  4. Agent pays (mppx handles this automatically)
  5. Agent retries with payment credential
  6. Server verifies payment → composes image → uploads Irys → calls `mintTo(recipient, tokenURI)`
  7. Returns 200 with NFT data + Payment-Receipt header
- `GET /api/nft/status` returns current supply, phase, prices (free, no payment needed)

**What we verify on testnet:**
```bash
# Create test account with testnet tokens
npx mppx account create

# Inspect the 402 challenge (no payment)
npx mppx --inspect http://localhost:3000/api/nft/mint

# Actually mint via MPP
npx mppx -X POST --json '{"traits":{"background":"bg_01","body":"body_01"},"recipient":"0xTEST..."}' \
  http://localhost:3000/api/nft/mint
```

---

## Step 8 — Agent Discovery Files (SKILL.md, llms.txt, OpenAPI)

**What we build:** Files that let AI agents discover and understand our service.

```
Files created:
├── public/
│   ├── SKILL.md                   ← Agent skill file (instructions + endpoints)
│   ├── llms.txt                   ← Machine-readable service index
│   └── api/nft/
│       └── openapi.json           ← OpenAPI 3.1 spec for all endpoints
```

**What it does:**
- `SKILL.md` tells agents: what the service does, all endpoints, pricing, how to mint
- `llms.txt` follows the llms.txt convention — concise machine-readable index
- `openapi.json` — full OpenAPI spec so agents with tool-use can auto-generate correct requests
- All served as static files from `/public/`

**What we verify:**
- Agent (e.g. Claude Code) can read SKILL.md → call the right endpoints → successfully mint

---

## Step 9 — Collection Browse + NFT Detail Pages

**What we build:** Gallery to view all minted NFTs.

```
Files created:
├── app/
│   ├── collection/
│   │   └── page.tsx               ← Grid gallery of all minted NFTs
│   └── collection/[tokenId]/
│       └── page.tsx               ← Individual NFT detail page
├── app/api/nft/
│   ├── collection/
│   │   ├── route.ts               ← GET — paginated list of minted NFTs
│   │   └── [tokenId]/route.ts     ← GET — single NFT data
├── components/
│   └── CollectionGrid.tsx         ← Gallery grid component
```

**What it does:**
- Reads on-chain `totalSupply`, loops through token IDs, fetches each `tokenURI`
- Gallery grid with images + token ID
- Detail page shows full metadata: image, all traits, owner address, mint tx
- Paginated API (don't fetch all 10K at once)

---

## Step 10 — Landing Page + Polish

**What we build:** Production-ready look & feel.

```
Files created/updated:
├── app/page.tsx                   ← Hero landing page
├── components/
│   ├── Header.tsx                 ← Nav: Home, Mint, Collection
│   ├── Footer.tsx
│   ├── SupplyCounter.tsx          ← Live minted/total counter
│   └── PhaseIndicator.tsx         ← Shows current phase (WL/Public/Closed)
```

**What it does:**
- Landing page with project description, supply counter, mint button CTA
- Navigation between pages
- Loading states for all blockchain reads
- Error handling (rejected tx, insufficient balance, sold out, wrong network)
- Mobile responsive design
- Transaction status toasts (pending → confirmed → show NFT)

---

## Build Summary

| Step | What | Blockchain? | Testnet test? |
|------|------|-------------|---------------|
| 1 | Project scaffold + chain config | No | App runs |
| 2 | Smart contract + Hardhat deploy | Yes | Contract deployed |
| 3 | Merkle WL system + API | Yes | WL mint works on-chain |
| 4 | Traits + image composition | No | Preview endpoint works |
| 5 | Irys upload pipeline | No (Irys devnet) | Uploads return URLs |
| 6 | Wallet connect + human mint UI | Yes | Full human mint on testnet |
| 7 | MPP agent mint endpoint | Yes | `npx mppx` mint on testnet |
| 8 | Agent discovery files | No | SKILL.md/OpenAPI served |
| 9 | Collection + NFT detail pages | Yes (reads) | Gallery works |
| 10 | Landing page + polish | No | Production-ready UI |

**Steps 1-7 are the critical path.** Steps 8-10 are additive and can be done in any order after.

---

## What We Need Before Starting

| Item | Status | Notes |
|------|--------|-------|
| **Art assets (layer PNGs)** | Not yet | We'll use colored placeholders initially. Replace with real art anytime. |
| **Testnet pathUSD** | Free | From faucet: `https://docs.tempo.xyz/quickstart/faucet` |
| **Deployer wallet** | Need to create | A testnet wallet with pathUSD for gas + contract deployment |
| **Treasury wallet** | Need address | Where pathUSD payments are received |
| **WL addresses** | Need list | Even just 2-3 test addresses to start |
| **Node.js >= 20** | Check | Required for Next.js 15 |
