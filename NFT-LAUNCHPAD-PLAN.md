# NFT Launchpad on Tempo — Project Plan

> Standalone project: `NFTagent/`  
> Target: Testnet (Moderato) first → Mainnet  
> Date: March 2026

---

## 1. Project Summary

A customizable NFT launchpad on the Tempo blockchain where both **human users** (via web UI) and **AI agents** (via MPP-enabled API) can:

1. Browse available trait layers (head, body, color, accessories, etc.)
2. Compose a custom NFT by selecting one option per layer
3. Preview the composed image
4. Pay in pathUSD and receive the minted NFT

AI agents pay through MPP (HTTP 402 flow). Humans pay via `pathUSD.transferFrom` (approve + contract pull). The server mints all NFTs — unified pipeline for both paths.

---

## 2. Decisions Made

| Question | Decision |
|----------|----------|
| Where to build | Standalone project in `NFTagent/` |
| Art assets | Designer will provide trait layer PNGs |
| Deployment | Testnet (Moderato) first, then Mainnet |
| Supply & pricing | **TBD** — design system to be configurable |
| Trait uniqueness | **TBD** — design system to support both modes |
| Human payment UX | `pathUSD.transferFrom` (approve + pull) — see §6 |

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
| Contract tooling | Hardhat or Foundry |
| Blockchain | Tempo (EVM-compatible) |
| Agent payments | MPP via `mppx` SDK |
| Human payments | pathUSD TIP-20 approve + transferFrom |
| Wallet connect | wagmi + viem |
| State management | React state (or Zustand if needed) |

---

## 4. Smart Contract Design

### Why `transferFrom` (approve + pull) is more reliable

Two options were considered:

**Option A — Direct transfer then mint (2-step):**
```
User sends pathUSD → server wallet
Server detects payment → mints NFT
```
Risk: race conditions, lost payments if server misses tx, no atomicity.

**Option B — Approve + transferFrom (atomic pull):**
```
User approves contract to spend X pathUSD
User calls mint() → contract pulls pathUSD + mints NFT in one tx
```
Benefits:
- **Atomic** — payment and mint succeed or fail together, no lost funds
- **Proven on Tempo** — the reference NFT contract (`0xf508…`) uses exactly this pattern
- **No server monitoring needed** for human path — contract handles everything
- **Refund-safe** — if mint fails, tokens stay in user's wallet

**Decision: Option B** — `approve` + `transferFrom` inside the contract's `mint()` function.

### Contract: `ClawNFT.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ITIP20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ClawNFT is ERC721, Ownable {
    uint256 public totalSupply;
    uint256 public maxSupply;           // configurable
    uint256 public mintPrice;           // in pathUSD base units (18 decimals)
    address public paymentToken;        // pathUSD address
    address public treasury;            // where payments go
    bool public mintActive;

    mapping(uint256 => string) private _tokenURIs;

    // Server wallet for agent mints (MPP path)
    mapping(address => bool) public minters;

    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        uint256 _mintPrice,
        address _paymentToken,
        address _treasury
    ) ERC721(name, symbol) Ownable(msg.sender) {
        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        paymentToken = _paymentToken;
        treasury = _treasury;
    }

    // --- Human mint (user calls directly, contract pulls pathUSD) ---
    function mint(string calldata uri) external returns (uint256) {
        require(mintActive, "minting paused");
        require(totalSupply < maxSupply, "sold out");
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, mintPrice),
            "payment failed"
        );
        uint256 tokenId = totalSupply++;
        _mint(msg.sender, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    // --- Agent mint (server calls after MPP payment verified) ---
    function mintTo(address to, string calldata uri) external returns (uint256) {
        require(minters[msg.sender], "not authorized minter");
        require(mintActive, "minting paused");
        require(totalSupply < maxSupply, "sold out");
        uint256 tokenId = totalSupply++;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    // --- Admin ---
    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
    }

    function setMintActive(bool active) external onlyOwner {
        mintActive = active;
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIs[tokenId];
    }
}
```

**Two mint functions:**
- `mint(uri)` — called by humans. Contract pulls pathUSD from `msg.sender`.
- `mintTo(to, uri)` — called by server wallet after MPP payment. No pathUSD pull (agent already paid via MPP).

### Tempo-Specific Notes
- pathUSD is a TIP-20 precompile at `0x20c0000000000000000000000000000000000000`
- State creation costs **250k gas/slot** (vs 20k on Ethereum) — keep on-chain storage minimal
- Traits/image live on Irys, not in contract storage
- Gas is cheap (<$0.001/tx) but sponsored by fee payer anyway

### Network Config

| Network | Chain ID | RPC | pathUSD | Escrow (MPP) |
|---------|----------|-----|---------|--------------|
| Moderato (testnet) | 42431 | `https://rpc.moderato.tempo.xyz` | `0x20c0...000` | `0xe1c4d3...336` |
| Mainnet | 42069 | `https://rpc.tempo.xyz` | `0x20c0...000` | `0x33b901...f25` |

---

## 5. Trait System

### Layer Structure

```
assets/
  layers/
    0-background/
      solid_blue.png
      gradient_fire.png
      galaxy.png
      ...
    1-body/
      robot.png
      human.png
      alien.png
      ...
    2-head/
      helmet.png
      crown.png
      cap.png
      horns.png
      ...
    3-eyes/
      laser.png
      visor.png
      normal.png
      ...
    4-accessories/
      sword.png
      shield.png
      wings.png
      none.png
      ...
    5-color/
      gold.png       (overlay/filter)
      neon.png
      arctic.png
      ...
```

### Trait Catalog (`traits.json`)

```json
{
  "layers": [
    {
      "id": "background",
      "name": "Background",
      "order": 0,
      "required": true,
      "options": [
        { "id": "solid_blue", "name": "Solid Blue", "file": "0-background/solid_blue.png", "rarity": "common" },
        { "id": "galaxy", "name": "Galaxy", "file": "0-background/galaxy.png", "rarity": "rare" }
      ]
    },
    {
      "id": "body",
      "name": "Body",
      "order": 1,
      "required": true,
      "options": [...]
    }
  ],
  "canvas": { "width": 1024, "height": 1024 }
}
```

### Rarity / Pricing (TBD — configurable)

Two modes the system should support:

**Mode A — Flat price:** Every combination costs the same (e.g., 5 pathUSD).

**Mode B — Tiered pricing:** Base price + premium per rare trait.
```
Base: 3 pathUSD
+ rare trait: +1 pathUSD each
+ legendary trait: +3 pathUSD each
```

### Uniqueness (TBD — configurable)

**Mode A — Duplicates allowed:** Any combo can be minted multiple times. Supply cap is just total count.

**Mode B — Unique combos only:** Server tracks minted combinations in a database. Rejects duplicates. Every NFT is visually unique.

The system will be built to support both — controlled by a config flag.

---

## 6. API Endpoints

### Public (Free)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nft/traits` | Returns trait catalog JSON (all layers, options, rarity) |
| GET | `/api/nft/traits/[layerId]` | Returns options for a specific layer |
| POST | `/api/nft/preview` | Accepts trait selections, returns composed PNG preview |
| GET | `/api/nft/collection` | Browse all minted NFTs (paginated) |
| GET | `/api/nft/collection/[tokenId]` | Single NFT details |
| GET | `/api/nft/status` | Supply remaining, mint active, price |

### Paid — Human Path (direct contract interaction)

| Step | Action | Who |
|------|--------|-----|
| 1 | User selects traits in UI | Frontend |
| 2 | User calls `pathUSD.approve(contractAddr, mintPrice)` | Frontend (wallet) |
| 3 | Server composes image + uploads metadata to Irys | Backend |
| 4 | Server returns `tokenURI` to frontend | Backend |
| 5 | User calls `contract.mint(tokenURI)` | Frontend (wallet) |
| 6 | Contract pulls pathUSD + mints NFT | On-chain |

### Paid — Agent Path (MPP)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/nft/mint` | MPP-enabled. Accepts traits + recipient. Returns 402 → agent pays → returns NFT data + receipt |

```typescript
// app/api/nft/mint/route.ts
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [tempo({
    recipient: process.env.NFT_TREASURY_WALLET!,
    feePayer: privateKeyToAccount(process.env.FEE_PAYER_KEY!),
  })],
})

export async function POST(request: Request) {
  const { traits, recipient } = await request.json()

  // Validate traits
  const price = calculatePrice(traits)  // flat or tiered

  // MPP charge — returns 402 if agent hasn't paid
  const result = await mppx.charge({
    amount: price.toString(),
    description: `Mint custom NFT`,
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
  }))
}
```

### Agent Discovery

| File | Purpose |
|------|---------|
| `/llms.txt` | Machine-readable service description for agent discovery |
| `/api/nft/openapi.json` | OpenAPI spec for tool integration |
| `SKILL.md` | Agent skill file describing how to use the launchpad |

---

## 7. Image Composition Pipeline

```
Input: { background: "galaxy", body: "robot", head: "crown", eyes: "laser", accessories: "wings", color: "gold" }
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │   Sharp (Node.js)          │
                    │                            │
                    │   1. Load background.png   │
                    │   2. Composite body.png    │
                    │   3. Composite head.png    │
                    │   4. Composite eyes.png    │
                    │   5. Composite access.png  │
                    │   6. Apply color overlay   │
                    │   7. Export PNG (1024x1024) │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   Upload to Irys/Arweave   │
                    │   → permanent image URL    │
                    │   → permanent metadata URL │
                    └───────────────────────────┘
```

```typescript
// lib/compose.ts
import sharp from 'sharp'

export async function composeImage(traits: Record<string, string>): Promise<Buffer> {
  const layers = getLayerFiles(traits) // resolve trait IDs to file paths

  let composite = sharp(layers[0]).resize(1024, 1024)

  for (const layer of layers.slice(1)) {
    composite = composite.composite([{ input: layer, gravity: 'center' }])
  }

  return composite.png().toBuffer()
}
```

---

## 8. Project Structure

```
NFTagent/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # Landing / hero
│   ├── mint/
│   │   └── page.tsx                  # Human mint UI (trait picker + preview + mint)
│   ├── collection/
│   │   └── page.tsx                  # Browse all minted NFTs
│   ├── collection/[tokenId]/
│   │   └── page.tsx                  # Individual NFT detail
│   └── api/
│       └── nft/
│           ├── traits/
│           │   └── route.ts          # GET — trait catalog
│           ├── preview/
│           │   └── route.ts          # POST — compose preview image
│           ├── mint/
│           │   └── route.ts          # POST — MPP-enabled mint (agent path)
│           ├── collection/
│           │   └── route.ts          # GET — browse minted NFTs
│           └── status/
│               └── route.ts          # GET — supply, price, active
├── assets/
│   └── layers/                       # Trait PNGs from designer
│       ├── 0-background/
│       ├── 1-body/
│       ├── 2-head/
│       ├── 3-eyes/
│       ├── 4-accessories/
│       └── 5-color/
├── components/
│   ├── TraitPicker.tsx               # Layer-by-layer trait selector
│   ├── NFTPreview.tsx                # Live preview canvas
│   ├── MintButton.tsx                # Approve + mint flow
│   └── CollectionGrid.tsx            # Gallery of minted NFTs
├── contracts/
│   ├── ClawNFT.sol                   # ERC-721 contract
│   ├── hardhat.config.ts             # Deployment config (Moderato + Mainnet)
│   └── scripts/
│       └── deploy.ts                 # Deploy script
├── lib/
│   ├── compose.ts                    # Sharp image composition
│   ├── irys.ts                       # Irys upload (image + metadata)
│   ├── contract.ts                   # Contract interaction (viem)
│   ├── traits.ts                     # Trait catalog loader + validation
│   ├── pricing.ts                    # Price calculation (flat or tiered)
│   └── uniqueness.ts                 # Combo tracking (if unique mode)
├── config/
│   ├── traits.json                   # Trait catalog definition
│   └── network.ts                    # Tempo chain configs
├── public/
│   ├── llms.txt                      # Agent service discovery
│   └── SKILL.md                      # Agent skill file
├── TEMPO-NFT-RESEARCH.md             # (existing) NFT research
├── TEMPO-MPP-RESEARCH.md             # (existing) MPP research
├── NFT-LAUNCHPAD-PLAN.md             # (this file)
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── .env.local
```

---

## 9. Environment Variables

```env
# Tempo Network
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz        # testnet first
TEMPO_CHAIN_ID=42431                                  # moderato

# Contract
NFT_CONTRACT_ADDRESS=0x...                            # deployed ClawNFT
PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# Server wallet (for agent mints via mintTo)
SERVER_PRIVATE_KEY=0x...
FEE_PAYER_KEY=0x...                                   # gas sponsorship

# MPP
NFT_TREASURY_WALLET=0x...                             # receives pathUSD from MPP

# Irys
IRYS_PRIVATE_KEY=0x...                                # for uploading metadata
IRYS_NODE=https://node2.irys.xyz                      # or devnet for testnet

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
MINT_PRICE=5000000000000000000                        # 5 pathUSD (18 decimals)
MAX_SUPPLY=10000
UNIQUE_COMBOS=false                                   # true = no duplicate combos
```

---

## 10. Development Phases

### Phase 1 — Foundation (Week 1-2)
- [ ] Initialize Next.js project in `NFTagent/`
- [ ] Set up Tailwind + shadcn/ui
- [ ] Create `traits.json` schema + loader
- [ ] Build image composition pipeline with Sharp
- [ ] Create preview API endpoint
- [ ] Set up Hardhat with Tempo Moderato config

### Phase 2 — Smart Contract (Week 2-3)
- [ ] Write `ClawNFT.sol` with dual mint functions
- [ ] Write deployment script for Moderato
- [ ] Deploy to Moderato testnet
- [ ] Test `mint()` (human path) with testnet pathUSD
- [ ] Test `mintTo()` (server/agent path)
- [ ] Verify contract on Tempo explorer

### Phase 3 — Human Mint Flow (Week 3-4)
- [ ] Build trait picker UI component
- [ ] Build live preview component
- [ ] Integrate wagmi for wallet connection
- [ ] Build approve + mint transaction flow
- [ ] Irys upload integration (image + metadata)
- [ ] End-to-end human mint on Moderato

### Phase 4 — MPP Agent Flow (Week 4-5)
- [ ] Install `mppx` and configure server middleware
- [ ] Build MPP-enabled `/api/nft/mint` endpoint
- [ ] Build `/api/nft/traits` endpoint (agent-readable)
- [ ] Test with `tempo` CLI (agent simulation)
- [ ] Create `llms.txt` for service discovery
- [ ] Create `SKILL.md` for agent instructions
- [ ] End-to-end agent mint on Moderato

### Phase 5 — Collection & Polish (Week 5-6)
- [ ] Collection browse page (gallery)
- [ ] Individual NFT detail page
- [ ] Supply counter / sold-out handling
- [ ] Landing page / hero
- [ ] Mobile responsive
- [ ] Error handling + edge cases

### Phase 6 — Mainnet Launch
- [ ] Switch RPC to `rpc.tempo.xyz` (chain 42069)
- [ ] Deploy contract to mainnet
- [ ] Update Irys to mainnet node
- [ ] Final testing
- [ ] Launch

---

## 11. Designer Handoff Requirements

The designer needs to produce:

1. **Canvas size**: 1024×1024 px (or agreed upon size)
2. **File format**: PNG with transparency (except background layer)
3. **Naming convention**: `{layer-number}-{layer-name}/{trait-id}.png`
4. **Alignment**: All PNGs must be same canvas size, traits positioned correctly when stacked
5. **Layers to design** (minimum):

| Layer | Min Options | Notes |
|-------|-------------|-------|
| Background | 5-8 | Full canvas, no transparency |
| Body | 4-6 | Centered, transparent background |
| Head | 5-8 | Positioned on body |
| Eyes | 4-6 | Positioned on head |
| Accessories | 5-8 + "none" | Optional layer |
| Color overlay | 4-6 | Semi-transparent color filter |

6. **Preview thumbnail**: One "hero" composed example for the landing page

---

## 12. Risk & Considerations

| Risk | Mitigation |
|------|------------|
| Tempo state costs (250k gas/slot) | Minimal on-chain storage — traits in metadata on Irys |
| Irys upload latency | Pre-compose on preview, cache composed images |
| pathUSD liquidity on testnet | Use Tempo faucet or bridge |
| Agent payment failures | MPP handles retries; charge is atomic |
| Duplicate combo race conditions | Server-side lock on combo hash before minting |
| Large trait catalog = slow preview | Cache composed layers, use Sharp streaming |
| Contract upgrade needed | Use proxy pattern (UUPS) if future upgrades are likely |

---

## 13. Future Enhancements (Post-Launch)

- **Trait rarity weighting** — make some traits appear less often in random mints
- **Random mint mode** — "surprise me" button that picks random traits
- **Secondary marketplace** — list/trade NFTs peer-to-peer
- **Trait swapping** — burn an NFT, get a new one with different traits
- **Batch minting** — agents mint multiple NFTs in one session (MPP session intent)
- **Revenue share** — trait designers earn royalties
- **On-chain provenance** — hash of trait combo stored in contract for verification
