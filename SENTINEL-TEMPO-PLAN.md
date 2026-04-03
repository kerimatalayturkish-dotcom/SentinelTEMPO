# SentinelTEMPO — NFT Project Plan

> Project: `NFTagent/`  
> Supply: 10,000 NFTs  
> Currency: pathUSD (TIP-20, 6 decimals)  
> Target: Testnet (Moderato) → Mainnet  
> Date: April 2026

---

## 1. Project Summary

**SentinelTEMPO** is a 10K NFT collection on the Tempo blockchain with two mint phases:

| Phase | Price | Who |
|-------|-------|-----|
| **Whitelist Mint** | 5 pathUSD | Pre-approved addresses only |
| **Public Mint** | 8 pathUSD | Anyone |

Three minting paths:
1. **Human (Web UI)** — connect wallet → approve pathUSD → call contract `mint()`
2. **AI Agent (MPP)** — call `/api/nft/mint` → HTTP 402 → agent pays → server mints via `mintTo()`
3. **AI Agent (WL check)** — agent can query `/api/nft/whitelist/check` to verify WL status before minting

Users and agents can check whitelist status through both the website and the API.

---

## 2. Network Configuration

| Parameter | Testnet (Moderato) | Mainnet |
|-----------|-------------------|---------|
| **Chain ID** | `42431` | `4217` |
| **RPC** | `https://rpc.moderato.tempo.xyz` | `https://rpc.tempo.xyz` |
| **WebSocket** | `wss://rpc.moderato.tempo.xyz` | `wss://rpc.tempo.xyz` |
| **Explorer (scanner)** | `https://explore.testnet.tempo.xyz` | `https://explore.tempo.xyz` |
| **Wallet/Chain connect** | `explore.moderato.tempo.xyz` | `explore.tempo.xyz` |
| **Fee Payer (testnet)** | `https://sponsor.moderato.tempo.xyz` | Self-hosted or service |
| **pathUSD** | `0x20c0000000000000000000000000000000000000` | `0x20c0000000000000000000000000000000000000` |
| **Escrow (MPP)** | `0xe1c4d3dce17bc111181ddf716f75bae49e61a336` | `0x33b901018174DDabE4841042ab76ba85D4e24f25` |

### pathUSD Decimals — CRITICAL

TIP-20 tokens use **6 decimals** (not 18 like ERC-20 on Ethereum).

| Price | pathUSD | Raw value (6 decimals) |
|-------|---------|----------------------|
| Whitelist mint | 5 pathUSD | `5_000_000` |
| Public mint | 8 pathUSD | `8_000_000` |

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Package manager | pnpm |
| Styling | Tailwind CSS + shadcn/ui |
| Image composition | Sharp (Node.js) |
| Metadata storage | Irys (Arweave gateway) |
| Smart contract | Solidity 0.8.x, OpenZeppelin ERC-721 |
| Contract tooling | Hardhat (w/ Tempo config) |
| Blockchain | Tempo (EVM-compatible, Osaka fork) |
| Agent payments | MPP via `mppx` SDK |
| Human payments | pathUSD TIP-20 `approve` + `transferFrom` |
| Wallet connect | wagmi (>= 3.2.0) + viem (>= 2.43.0) — native Tempo support |
| Whitelist | Merkle tree (on-chain root, off-chain proofs) |

---

## 4. Smart Contract Design

### Why Merkle Tree for Whitelist

Tempo charges **250,000 gas per new storage slot** (12.5x Ethereum). Storing 500+ WL addresses in a mapping would be extremely expensive. A Merkle tree stores only one `bytes32` root on-chain, and WL users submit proofs that are verified in memory — no storage writes for the WL itself.

### Contract: `SentinelTEMPO.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface ITIP20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SentinelTEMPO is ERC721, Ownable {
    // --- State ---
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant WL_PRICE = 5_000_000;      // 5 pathUSD (6 decimals)
    uint256 public constant PUBLIC_PRICE = 8_000_000;   // 8 pathUSD (6 decimals)

    address public immutable paymentToken;  // pathUSD
    address public treasury;                // receives payments

    bytes32 public merkleRoot;              // whitelist Merkle root

    enum Phase { CLOSED, WHITELIST, PUBLIC }
    Phase public mintPhase;

    mapping(uint256 => string) private _tokenURIs;
    mapping(address => bool) public minters;            // authorized server wallets (MPP path)
    mapping(address => bool) public wlMinted;           // track WL mints (1 per address)

    // --- Constructor ---
    constructor(
        address _paymentToken,
        address _treasury,
        bytes32 _merkleRoot
    ) ERC721("SentinelTEMPO", "SNTL") Ownable(msg.sender) {
        paymentToken = _paymentToken;
        treasury = _treasury;
        merkleRoot = _merkleRoot;
    }

    // --- Human WL Mint (user calls directly) ---
    function mintWhitelist(bytes32[] calldata proof, string calldata uri) external returns (uint256) {
        require(mintPhase == Phase.WHITELIST, "WL mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(!wlMinted[msg.sender], "already minted WL");
        require(
            MerkleProof.verify(proof, merkleRoot, keccak256(abi.encodePacked(msg.sender))),
            "not whitelisted"
        );
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, WL_PRICE),
            "payment failed"
        );

        wlMinted[msg.sender] = true;
        uint256 tokenId = totalSupply++;
        _mint(msg.sender, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    // --- Human Public Mint (user calls directly) ---
    function mintPublic(string calldata uri) external returns (uint256) {
        require(mintPhase == Phase.PUBLIC, "public mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, PUBLIC_PRICE),
            "payment failed"
        );

        uint256 tokenId = totalSupply++;
        _mint(msg.sender, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    // --- Agent Mint (server calls after MPP payment verified) ---
    function mintTo(address to, string calldata uri) external returns (uint256) {
        require(minters[msg.sender], "not authorized minter");
        require(mintPhase != Phase.CLOSED, "minting closed");
        require(totalSupply < MAX_SUPPLY, "sold out");

        uint256 tokenId = totalSupply++;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    // --- Admin ---
    function setMintPhase(Phase phase) external onlyOwner {
        mintPhase = phase;
    }

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIs[tokenId];
    }
}
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Merkle proof for WL** | Saves ~250k gas per WL address vs storage mapping. Only 1 `bytes32` stored on-chain. |
| **1 WL mint per address** | `wlMinted` mapping tracks who used their WL. Prevents double-mint. |
| **Phase enum** | Clean state machine: CLOSED → WHITELIST → PUBLIC. Admin toggles. |
| **Separate `mintTo()`** | Server mints for agents after MPP payment verified off-chain. No pathUSD pull (agent paid via HTTP 402). |
| **`uri` param in mint** | Metadata URI is passed per-mint (not base URI + tokenId). Each NFT gets unique composed metadata on Irys. |
| **Immutable `paymentToken`** | pathUSD address won't change. Set once in constructor. |
| **6-decimal constants** | `WL_PRICE = 5_000_000` and `PUBLIC_PRICE = 8_000_000` match TIP-20's 6-decimal precision. |

### Tempo-Specific Notes

- `msg.value` / `CALLVALUE` always returns 0 — payment MUST use `transferFrom`
- State creation: 250k gas/slot — keep on-chain storage minimal
- `eth_getBalance` returns a meaningless large number — never use for balance checks
- Use `ITIP20.balanceOf()` to check pathUSD balance
- Gas fees paid in pathUSD by default (non-TIP-20 contract calls fall back to pathUSD)
- Fee sponsorship via `feePayer` makes gas invisible to users

---

## 5. Whitelist System

### Architecture

```
┌──────────────────────────┐
│  whitelist.json          │  Source of truth: list of WL addresses
│  ["0xabc...", "0xdef..."]│
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Merkle Tree Generator   │  Build tree, extract root + proofs
│  (scripts/merkle.ts)     │
└────────────┬─────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐   ┌─────────────────┐
│ On-chain │   │ merkle-proofs/  │  Pre-computed proofs per address
│ root     │   │ (JSON files)    │  Served by API
│ (bytes32)│   └────────┬────────┘
└──────────┘            │
                        ▼
              ┌──────────────────┐
              │ /api/nft/wl/check│  Endpoint: lookup proof for address
              │ /api/nft/wl/proof│  Endpoint: return Merkle proof
              └──────────────────┘
```

### Flow

1. **Admin** maintains `config/whitelist.json` — array of WL addresses
2. **Build script** (`scripts/generate-merkle.ts`) generates Merkle tree:
   - Computes root → saved to `config/merkle-root.json`
   - Computes proof per address → saved to `config/merkle-proofs.json`
3. **Deploy/Admin** sets `merkleRoot` on contract via `setMerkleRoot(root)`
4. **API** serves WL status checks and proofs:
   - `GET /api/nft/wl/check?address=0x...` → `{ whitelisted: true/false }`
   - `GET /api/nft/wl/proof?address=0x...` → `{ proof: ["0x...", ...] }` (if WL'd)
5. **Frontend** on wallet connect → auto-checks WL → shows appropriate mint UI (WL price vs public price)
6. **AI Agent** calls `/api/nft/wl/check` to determine WL status → adjusts mint price in MPP charge

### Merkle Tree Generation

```typescript
// scripts/generate-merkle.ts
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import whitelist from "../config/whitelist.json";

const leaves = whitelist.map(addr => [addr]);
const tree = StandardMerkleTree.of(leaves, ["address"]);

console.log("Merkle Root:", tree.root);

// Save root
fs.writeFileSync("config/merkle-root.json", JSON.stringify({ root: tree.root }));

// Save proofs per address
const proofs: Record<string, string[]> = {};
for (const [i, v] of tree.entries()) {
    proofs[v[0].toLowerCase()] = tree.getProof(i);
}
fs.writeFileSync("config/merkle-proofs.json", JSON.stringify(proofs));
```

---

## 6. Mint Flows

### 6a. Human Whitelist Mint

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Connect  │    │ Check WL │    │ Approve  │    │ Mint WL  │
│ Wallet   │───▶│ Status   │───▶│ pathUSD  │───▶│ Contract │
│ (wagmi)  │    │ (API)    │    │ 5 pUSD   │    │ Call     │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────┐
                                          │ Contract pulls   │
                                          │ 5 pathUSD +      │
                                          │ verifies proof + │
                                          │ mints NFT        │
                                          └──────────────────┘
```

**Step-by-step:**
1. User connects wallet via wagmi (Tempo chain auto-detected)
2. Frontend calls `/api/nft/wl/check?address=0x...`
3. If WL'd → show WL mint UI with 5 pathUSD price
4. Frontend fetches Merkle proof from `/api/nft/wl/proof?address=0x...`
5. Backend composes image from selected traits → uploads to Irys → returns `tokenURI`
6. User calls `pathUSD.approve(contractAddr, 5_000_000)`
7. User calls `contract.mintWhitelist(proof, tokenURI)`
8. Contract verifies proof, pulls 5 pathUSD, mints NFT — all atomic

### 6b. Human Public Mint

Same as above but:
- No WL check needed
- Price = 8 pathUSD
- Calls `contract.mintPublic(tokenURI)` instead
- No Merkle proof required

### 6c. AI Agent Mint (MPP)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│ Agent    │    │ POST         │    │ 402      │    │ Agent    │
│ requests │───▶│ /api/nft/mint│───▶│ Challenge│───▶│ pays     │
│ mint     │    │              │    │ (MPP)    │    │ on-chain │
└──────────┘    └──────────────┘    └──────────┘    └──────────┘
                                                         │
                                                         ▼
                                              ┌──────────────────┐
                                              │ Server verifies  │
                                              │ payment → compose│
                                              │ image → upload   │
                                              │ Irys → call      │
                                              │ mintTo() on      │
                                              │ contract         │
                                              └──────────────────┘
```

**Step-by-step:**
1. Agent sends `POST /api/nft/mint` with `{ traits, recipient }`
2. Server checks if `recipient` is WL'd → sets price to 5 or 8 pathUSD
3. Server returns **HTTP 402** with `WWW-Authenticate: Payment` challenge (amount = price)
4. Agent's MPP client auto-fulfills payment (on-chain pathUSD transfer)
5. Agent retries with `Authorization: Payment <credential>`
6. Server verifies payment via `mppx`
7. Server composes image → uploads metadata to Irys → gets `tokenURI`
8. Server calls `contract.mintTo(recipient, tokenURI)` (server is authorized minter)
9. Server returns **200 OK** with `Payment-Receipt` + NFT data (tokenId, tokenURI, txHash)

### MPP Server Code

```typescript
// app/api/nft/mint/route.ts
import { Mppx, tempo } from 'mppx/server'
import { privateKeyToAccount } from 'viem/accounts'

const mppx = Mppx.create({
  methods: [tempo({
    currency: '0x20c0000000000000000000000000000000000000', // pathUSD
    recipient: process.env.NFT_TREASURY_WALLET!,
    feePayer: privateKeyToAccount(process.env.FEE_PAYER_KEY! as `0x${string}`),
  })],
})

export async function POST(request: Request) {
  const { traits, recipient } = await request.json()

  // Validate input
  validateTraits(traits)
  validateAddress(recipient)

  // Check WL status to determine price
  const isWL = checkWhitelist(recipient)
  const price = isWL ? '5' : '8'  // pathUSD (mppx handles base units)

  // MPP charge — returns 402 if agent hasn't paid
  const result = await mppx.charge({
    amount: price,
    description: `Mint SentinelTEMPO NFT (${isWL ? 'WL' : 'Public'})`,
  })(request)

  if (result.status === 402) return result.challenge

  // Payment verified — compose, upload, mint
  const image = await composeImage(traits)
  const metadata = buildMetadata(traits, image)
  const tokenURI = await uploadToIrys(metadata)
  const { tokenId, txHash } = await mintTo(recipient, tokenURI)

  return result.withReceipt(Response.json({
    tokenId,
    tokenURI,
    image: metadata.image,
    txHash,
    traits,
    phase: isWL ? 'whitelist' : 'public',
  }))
}
```

---

## 7. Trait System & Image Composition

### Layer Structure

```
assets/
  layers/
    0-background/
      bg_01.png
      bg_02.png
      ...
    1-body/
      body_01.png
      body_02.png
      ...
    2-head/
      head_01.png
      ...
    3-eyes/
      eyes_01.png
      ...
    4-accessories/
      acc_01.png
      none.png
      ...
    5-color/
      overlay_01.png
      ...
```

> **Note**: Actual trait names and categories TBD — pending designer asset delivery. The system is configurable via `traits.json`.

### Composition Pipeline

```
Input: { background: "bg_01", body: "body_03", head: "head_02", ... }
          │
          ▼
    ┌─────────────┐
    │ Sharp        │   Load layers in order (0→5)
    │ composite()  │   Stack as PNG overlays
    │ 1024×1024    │   Export as PNG buffer
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ Irys Upload  │   Upload image PNG → permanent URL
    │              │   Upload metadata JSON → permanent URL (tokenURI)
    └──────┬──────┘
           │
           ▼
    Returns: tokenURI (https://gateway.irys.xyz/...)
```

### Metadata Format (on Irys)

```json
{
  "name": "SentinelTEMPO #42",
  "description": "A Sentinel guarding the Tempo blockchain.",
  "image": "https://gateway.irys.xyz/<image-tx-id>",
  "attributes": [
    { "trait_type": "Background", "value": "Nebula" },
    { "trait_type": "Body", "value": "Armored" },
    { "trait_type": "Head", "value": "Crown" },
    { "trait_type": "Eyes", "value": "Laser" },
    { "trait_type": "Accessories", "value": "Wings" },
    { "trait_type": "Color", "value": "Gold" }
  ]
}
```

---

## 8. API Endpoints

### Public (Free)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nft/traits` | Trait catalog JSON (all layers + options) |
| GET | `/api/nft/traits/[layerId]` | Options for a specific layer |
| POST | `/api/nft/preview` | Compose + return preview PNG (no mint) |
| GET | `/api/nft/collection` | Browse all minted NFTs (paginated) |
| GET | `/api/nft/collection/[tokenId]` | Single NFT details |
| GET | `/api/nft/status` | Supply remaining, mint phase, prices |
| GET | `/api/nft/wl/check?address=0x...` | Check if address is whitelisted |
| GET | `/api/nft/wl/proof?address=0x...` | Get Merkle proof (if WL'd) |

### Paid — Human Path (direct contract interaction)

| Step | Action | Who |
|------|--------|-----|
| 1 | Connect wallet, check WL status | Frontend |
| 2 | Select traits, preview | Frontend |
| 3 | Server composes image + uploads to Irys → returns tokenURI | Backend |
| 4 | User approves pathUSD (5 or 8) | Frontend (wallet) |
| 5 | User calls `mintWhitelist(proof, uri)` or `mintPublic(uri)` | Frontend (wallet) |
| 6 | Contract verifies + pulls pathUSD + mints NFT | On-chain |

### Paid — Agent Path (MPP)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/nft/mint` | MPP-enabled. Accepts `{ traits, recipient }`. Auto-detects WL for pricing. Returns 402 → agent pays → returns NFT data + receipt. |

### Agent Discovery

| File | Purpose |
|------|---------|
| `/llms.txt` | Machine-readable service description |
| `/api/nft/openapi.json` | OpenAPI spec for tool integration |
| `SKILL.md` | Agent skill file with usage instructions |

---

## 9. Project Structure

```
NFTagent/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Landing page
│   ├── mint/
│   │   └── page.tsx                      # Mint UI (trait picker + preview + mint)
│   ├── collection/
│   │   └── page.tsx                      # Browse all minted NFTs
│   ├── collection/[tokenId]/
│   │   └── page.tsx                      # Individual NFT detail
│   └── api/
│       └── nft/
│           ├── traits/
│           │   ├── route.ts              # GET — full trait catalog
│           │   └── [layerId]/
│           │       └── route.ts          # GET — single layer options
│           ├── preview/
│           │   └── route.ts              # POST — compose preview PNG
│           ├── mint/
│           │   └── route.ts              # POST — MPP-enabled mint (agent path)
│           ├── collection/
│           │   ├── route.ts              # GET — browse minted NFTs
│           │   └── [tokenId]/
│           │       └── route.ts          # GET — single NFT detail
│           ├── status/
│           │   └── route.ts              # GET — supply, phase, prices
│           └── wl/
│               ├── check/
│               │   └── route.ts          # GET — check WL status
│               └── proof/
│                   └── route.ts          # GET — Merkle proof for address
├── assets/
│   └── layers/                           # Trait PNGs from designer
│       ├── 0-background/
│       ├── 1-body/
│       ├── 2-head/
│       ├── 3-eyes/
│       ├── 4-accessories/
│       └── 5-color/
├── components/
│   ├── WalletConnect.tsx                 # wagmi wallet connection
│   ├── WhitelistChecker.tsx              # WL status display
│   ├── TraitPicker.tsx                   # Layer-by-layer trait selector
│   ├── NFTPreview.tsx                    # Live preview canvas
│   ├── MintButton.tsx                    # Approve + mint flow (WL or public)
│   └── CollectionGrid.tsx                # Gallery of minted NFTs
├── contracts/
│   ├── SentinelTEMPO.sol                # ERC-721 contract
│   ├── hardhat.config.ts                # Tempo Moderato + Mainnet config
│   └── scripts/
│       ├── deploy.ts                     # Deploy SentinelTEMPO contract
│       └── set-merkle-root.ts            # Update Merkle root on contract
├── lib/
│   ├── compose.ts                        # Sharp image composition
│   ├── irys.ts                           # Irys upload (image + metadata JSON)
│   ├── contract.ts                       # Contract interaction (viem)
│   ├── traits.ts                         # Trait catalog loader + validation
│   ├── whitelist.ts                      # WL check + Merkle proof lookup
│   └── chain.ts                          # Tempo chain configs (testnet/mainnet)
├── scripts/
│   └── generate-merkle.ts               # Build Merkle tree from whitelist.json
├── config/
│   ├── traits.json                       # Trait catalog definition
│   ├── whitelist.json                    # Array of WL addresses
│   ├── merkle-root.json                  # Generated Merkle root
│   ├── merkle-proofs.json                # Generated proofs per address
│   └── network.ts                        # Chain config exports
├── public/
│   ├── llms.txt                          # Agent service discovery
│   └── api/
│       └── nft/
│           └── openapi.json              # OpenAPI spec
├── SKILL.md                              # Agent skill file
├── SENTINEL-TEMPO-PLAN.md                # This file
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
└── .env.local
```

---

## 10. Environment Variables

```env
# ─── Tempo Network ───
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
NEXT_PUBLIC_TEMPO_CHAIN_ID=42431
NEXT_PUBLIC_EXPLORER_URL=https://explore.testnet.tempo.xyz

# ─── Contract ───
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...          # Deployed SentinelTEMPO
NEXT_PUBLIC_PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# ─── Server Wallet (for mintTo via MPP) ───
SERVER_PRIVATE_KEY=0x...
FEE_PAYER_KEY=0x...

# ─── MPP ───
NFT_TREASURY_WALLET=0x...                       # Receives pathUSD from MPP + contract

# ─── Irys ───
IRYS_PRIVATE_KEY=0x...
IRYS_NODE=https://devnet.irys.xyz               # devnet for testnet, node2 for mainnet

# ─── App ───
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Security**: `SERVER_PRIVATE_KEY`, `FEE_PAYER_KEY`, and `IRYS_PRIVATE_KEY` are server-only. Never prefix with `NEXT_PUBLIC_`.

---

## 11. Development Phases

### Phase 1 — Foundation (Week 1)
- [ ] Initialize Next.js 15 project with pnpm
- [ ] Set up Tailwind CSS + shadcn/ui
- [ ] Configure viem + wagmi for Tempo Moderato
- [ ] Create `config/traits.json` schema + loader (`lib/traits.ts`)
- [ ] Build image composition pipeline with Sharp (`lib/compose.ts`)
- [ ] Create preview API endpoint (`/api/nft/preview`)
- [ ] Set up Hardhat with Tempo Moderato network config

### Phase 2 — Smart Contract (Week 2)
- [ ] Write `SentinelTEMPO.sol` with WL + Public + Agent mint functions
- [ ] Write Merkle tree generator script (`scripts/generate-merkle.ts`)
- [ ] Write deployment script (`contracts/scripts/deploy.ts`)
- [ ] Deploy to Moderato testnet
- [ ] Test `mintWhitelist()` with testnet pathUSD + Merkle proof
- [ ] Test `mintPublic()` with testnet pathUSD
- [ ] Test `mintTo()` from authorized server wallet
- [ ] Set Merkle root via `setMerkleRoot()`

### Phase 3 — Human Mint Flow (Week 3)
- [ ] Build wallet connection component (wagmi)
- [ ] Build WL checker component (calls `/api/nft/wl/check`)
- [ ] Build trait picker UI
- [ ] Build live preview component
- [ ] Integrate Irys upload (image + metadata)
- [ ] Build approve + mint transaction flow (WL and public paths)
- [ ] End-to-end human WL mint on Moderato
- [ ] End-to-end human public mint on Moderato

### Phase 4 — MPP Agent Flow (Week 4)
- [ ] Install `mppx` and configure server
- [ ] Build MPP-enabled `/api/nft/mint` endpoint
- [ ] Build `/api/nft/traits` endpoint (agent-readable)
- [ ] Build `/api/nft/wl/check` endpoint
- [ ] Build `/api/nft/status` endpoint
- [ ] Test with `npx mppx` CLI (simulate agent mint)
- [ ] Create `llms.txt` for service discovery
- [ ] Create `SKILL.md` for agent instructions
- [ ] Create `openapi.json` spec
- [ ] End-to-end agent mint on Moderato

### Phase 5 — Collection & Polish (Week 5)
- [ ] Collection browse page (gallery grid)
- [ ] Individual NFT detail page
- [ ] Supply counter + phase indicator
- [ ] Landing page / hero
- [ ] Mobile responsive design
- [ ] Error handling + edge cases
- [ ] Loading states + transaction status

### Phase 6 — Mainnet Launch
- [ ] Switch RPC to `https://rpc.tempo.xyz` (chain 4217)
- [ ] Deploy contract to mainnet
- [ ] Set Merkle root on mainnet contract
- [ ] Switch Irys to mainnet node
- [ ] Update all env vars for production
- [ ] Final testing
- [ ] Launch

---

## 12. Whitelist Management Workflow

### Adding/Updating WL

```bash
# 1. Edit config/whitelist.json — add/remove addresses
# 2. Regenerate Merkle tree
pnpm run generate-merkle

# 3. Update contract with new root
pnpm run set-merkle-root --network moderato

# 4. API automatically serves new proofs (reads from config/merkle-proofs.json)
```

### WL File Format

```json
// config/whitelist.json
[
  "0x1234567890abcdef1234567890abcdef12345678",
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "0x..."
]
```

All addresses are checksummed and lowercased before Merkle leaf hashing.

---

## 13. Agent Skill File

```markdown
// public/SKILL.md (or served at /SKILL.md)

# SentinelTEMPO — NFT Minting Service

## What this service does
Mint custom SentinelTEMPO NFTs on the Tempo blockchain. Choose traits, preview, and mint.

## Endpoints

### Check whitelist status (free)
GET /api/nft/wl/check?address=<wallet_address>
Returns: { "whitelisted": true/false }

### Get available traits (free)
GET /api/nft/traits
Returns: Full trait catalog with layers and options

### Get mint status (free)
GET /api/nft/status
Returns: { "phase": "whitelist|public|closed", "totalSupply": N, "maxSupply": 10000, "wlPrice": "5", "publicPrice": "8" }

### Preview NFT (free)
POST /api/nft/preview
Body: { "traits": { "background": "bg_01", "body": "body_03", ... } }
Returns: PNG image

### Mint NFT (paid via MPP)
POST /api/nft/mint
Body: { "traits": { "background": "bg_01", ... }, "recipient": "0x..." }
Price: 5 pathUSD (whitelist) or 8 pathUSD (public)
Payment: HTTP 402 → pay with pathUSD on Tempo → receive NFT

## Payment
- Currency: pathUSD on Tempo (chain 4217 mainnet / 42431 testnet)
- WL price: 5 pathUSD
- Public price: 8 pathUSD
- Protocol: MPP (HTTP 402 challenge/credential flow)
```

---

## 14. Risk & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **pathUSD decimal mistake** | HIGH | Constants in contract use 6 decimals. Unit tests verify exact amounts. |
| **Merkle root mismatch** | HIGH | Generate-and-set is a single script. Root is logged + verified before deploy. |
| **State costs (250k gas/slot)** | MEDIUM | Minimal on-chain storage: only tokenURI string + wlMinted bool + totalSupply. Traits live on Irys. |
| **WL race condition** | MEDIUM | `wlMinted[msg.sender]` check is atomic in the same tx. One WL mint per address enforced on-chain. |
| **Agent mint abuse** | MEDIUM | `mintTo()` restricted to `minters` mapping. Only server wallet authorized. MPP handles payment verification. |
| **Irys upload latency** | LOW | Pre-compose on preview. Cache composed images. Irys uploads are fast (~1-2s). |
| **No NFT marketplace on Tempo** | INFO | Secondary trading is out of scope for launch. Can build later or wait for ecosystem. |
| **Contract upgrade** | LOW | If upgrades needed post-launch, can deploy v2 and migrate. Consider UUPS proxy if this is a concern. |

---

## 15. Open Questions for Discussion

| # | Question | Options |
|---|----------|---------|
| 1 | **Max WL mints per address?** | Currently 1. Do we want to allow more (e.g., 3 per WL address)? |
| 2 | **Max public mints per tx?** | Currently 1 per call. Batch mint (e.g., mint up to 5) saves gas for users but adds complexity. |
| 3 | **Agent WL handling** | Should agents who mint on behalf of a WL'd recipient get the WL price? Current plan: yes, based on recipient address. |
| 4 | **Reveal mechanism?** | Option A: All metadata visible immediately. Option B: Unrevealed placeholder → reveal after mint-out. |
| 5 | **Art assets** | Need designer to provide trait layer PNGs. What's the theme/style for "Sentinel"? |
| 6 | **Trait uniqueness** | Allow duplicate combinations? Or enforce unique combos only? |
| 7 | **Founder/team allocation?** | Reserve any tokens for team? (e.g., 100 pre-minted) |
| 8 | **WL size estimate?** | How many WL addresses? Affects proof size and gas (larger tree = larger proofs). |
| 9 | **Royalties** | No ERC-2981 on Tempo yet. Do we need any royalty mechanism? |
| 10 | **Domain/hosting** | Where will this be deployed? Vercel? Self-hosted? |

---

## 16. Dependencies & Versions

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "viem": "^2.43.0",
    "wagmi": "^3.2.0",
    "@tanstack/react-query": "^5.0.0",
    "mppx": "latest",
    "sharp": "^0.33.0",
    "@irys/upload": "latest",
    "@irys/upload-ethereum": "latest",
    "@openzeppelin/merkle-tree": "^1.0.0",
    "tailwindcss": "^4.0.0",
    "@radix-ui/react-*": "latest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "hardhat": "^2.22.0",
    "@openzeppelin/contracts": "^5.1.0",
    "@nomicfoundation/hardhat-toolbox": "latest"
  }
}
```

---

## Appendix: Quick Reference

```
Project:         SentinelTEMPO
Supply:          10,000
WL Price:        5 pathUSD (5_000_000 raw)
Public Price:    8 pathUSD (8_000_000 raw)
pathUSD:         0x20c0000000000000000000000000000000000000
pathUSD decimals: 6
Mainnet Chain:   4217
Testnet Chain:   42431
RPC (testnet):   https://rpc.moderato.tempo.xyz
RPC (mainnet):   https://rpc.tempo.xyz
Explorer (test): https://explore.testnet.tempo.xyz
Explorer (main): https://explore.tempo.xyz
MPP SDK:         npm install mppx viem
Irys SDK:        npm install @irys/upload @irys/upload-ethereum
Merkle:          npm install @openzeppelin/merkle-tree
```
