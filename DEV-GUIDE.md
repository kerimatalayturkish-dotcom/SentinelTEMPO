# SentinelTEMPO — Complete Development Guide

> Every line of code, every command, every file — organized by step.  
> Target: Moderato testnet. Mainnet = swap 6 env vars.  
> Date: April 2, 2026

---

## Table of Contents

1. [Step 1 — Project Scaffold & Chain Config](#step-1--project-scaffold--chain-config)
2. [Step 2 — Smart Contract & Hardhat](#step-2--smart-contract--hardhat)
3. [Step 3 — Whitelist System (Merkle Tree)](#step-3--whitelist-system-merkle-tree)
4. [Step 4 — Trait System & Image Composition](#step-4--trait-system--image-composition)
5. [Step 5 — Irys Upload Pipeline](#step-5--irys-upload-pipeline)
6. [Step 6 — Wallet Connect & Human Mint (Frontend)](#step-6--wallet-connect--human-mint-frontend)
7. [Step 7 — MPP Agent Mint (Backend)](#step-7--mpp-agent-mint-backend)
8. [Step 8 — Agent Discovery Files](#step-8--agent-discovery-files)
9. [Step 9 — Collection Pages](#step-9--collection-pages)
10. [Step 10 — Landing Page & Polish](#step-10--landing-page--polish)

---

## Prerequisites (Your Action Items)

Before we start building, you need:

| Item | What to do |
|------|-----------|
| **Deployer wallet** | Create an EVM wallet (MetaMask or any). Export the private key. Fund with testnet pathUSD from `https://docs.tempo.xyz/quickstart/faucet` |
| **Treasury wallet** | A wallet address that receives mint payments. Can be the same as deployer or different. |
| **2-3 WL test addresses** | Your own wallets to test WL mint. Put in `config/whitelist.json`. |
| **Placeholder PNGs** | 1024x1024 transparent PNG files. At least 2-3 options per layer (6 layers). |
| **Node.js >= 20** | Required for Next.js 15. Check with `node --version`. |

---

# Step 1 — Project Scaffold & Chain Config

## Goal

Working Next.js 15 app connected to Tempo Moderato testnet. Run `pnpm dev` → see placeholder page at `localhost:3000`.

## Commands

```bash
# Create the project
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src=no --import-alias "@/*" --turbopack

# Install core dependencies
pnpm add viem@^2.43.0 wagmi@^3.2.0 @tanstack/react-query@^5.0.0
pnpm add sharp@^0.33.0
pnpm add mppx
pnpm add @openzeppelin/merkle-tree@^1.0.0

# Install shadcn/ui
pnpm dlx shadcn@latest init
```

## Files to Create

### `.env.local` — All network config lives here

```env
# ─── Tempo Network ───
NEXT_PUBLIC_TEMPO_CHAIN_ID=42431
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.moderato.tempo.xyz
NEXT_PUBLIC_EXPLORER_URL=https://explore.testnet.tempo.xyz
NEXT_PUBLIC_CHAIN_NAME=Tempo Testnet (Moderato)

# ─── Addresses ───
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=            # filled after Step 2 deploy
NEXT_PUBLIC_PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# ─── Server Wallet (NEVER prefix with NEXT_PUBLIC_) ───
SERVER_PRIVATE_KEY=0x_YOUR_DEPLOYER_PRIVATE_KEY
FEE_PAYER_KEY=0x_YOUR_FEE_PAYER_KEY

# ─── Treasury ───
NFT_TREASURY_WALLET=0x_YOUR_TREASURY_ADDRESS

# ─── Irys ───
IRYS_PRIVATE_KEY=0x_YOUR_IRYS_WALLET_KEY
IRYS_NODE=https://devnet.irys.xyz

# ─── App ───
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `.env.example` — Template (committed to git, no secrets)

```env
NEXT_PUBLIC_TEMPO_CHAIN_ID=42431
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.moderato.tempo.xyz
NEXT_PUBLIC_EXPLORER_URL=https://explore.testnet.tempo.xyz
NEXT_PUBLIC_CHAIN_NAME=Tempo Testnet (Moderato)
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=
NEXT_PUBLIC_PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000
SERVER_PRIVATE_KEY=
FEE_PAYER_KEY=
NFT_TREASURY_WALLET=
IRYS_PRIVATE_KEY=
IRYS_NODE=https://devnet.irys.xyz
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `lib/chain.ts` — Single source of truth for chain config

```typescript
import { defineChain } from 'viem'

// Build chain object from env vars — same code works for testnet and mainnet
export const tempoChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Tempo',
  nativeCurrency: {
    name: 'USD',
    symbol: 'USD',
    decimals: 18,  // MetaMask quirk: must be 18 even though pathUSD is 6
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_TEMPO_RPC_URL!],
      webSocket: [process.env.NEXT_PUBLIC_TEMPO_WS_URL!],
    },
  },
  blockExplorers: {
    default: {
      name: 'Tempo Explorer',
      url: process.env.NEXT_PUBLIC_EXPLORER_URL!,
    },
  },
})

// Constants that are the same on both networks
export const PATHUSD_ADDRESS = process.env.NEXT_PUBLIC_PATHUSD_ADDRESS as `0x${string}`
export const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`
export const PATHUSD_DECIMALS = 6

// Price constants (raw values with 6 decimals)
export const WL_PRICE = 5_000_000n    // 5 pathUSD
export const PUBLIC_PRICE = 8_000_000n // 8 pathUSD

// Human-readable prices
export const WL_PRICE_DISPLAY = '5'
export const PUBLIC_PRICE_DISPLAY = '8'
```

### `lib/env.ts` — Validate env vars on startup

```typescript
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

// Server-only env vars (called from API routes, not client components)
export function getServerEnv() {
  return {
    serverPrivateKey: requireEnv('SERVER_PRIVATE_KEY') as `0x${string}`,
    feePayerKey: requireEnv('FEE_PAYER_KEY') as `0x${string}`,
    treasuryWallet: requireEnv('NFT_TREASURY_WALLET') as `0x${string}`,
    irysPrivateKey: requireEnv('IRYS_PRIVATE_KEY') as `0x${string}`,
    irysNode: requireEnv('IRYS_NODE'),
  }
}
```

### `app/layout.tsx` — Root layout (providers added in Step 6)

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SentinelTEMPO',
  description: '10K NFT Collection on Tempo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

### `app/page.tsx` — Placeholder landing

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">SentinelTEMPO</h1>
      <p className="mt-4 text-lg text-gray-500">10K NFT Collection on Tempo</p>
      <p className="mt-2 text-sm text-gray-400">Coming soon...</p>
    </main>
  )
}
```

### `.gitignore` additions

```
.env.local
config/merkle-root.json
config/merkle-proofs.json
```

## Verify Step 1

```bash
pnpm dev
# → Opens http://localhost:3000 — see "SentinelTEMPO" heading
# → No errors in console
# → .env.local exists with testnet values
```

## What's Done After Step 1

- [x] Next.js 15 running with Tailwind + shadcn/ui
- [x] All deps installed (viem, wagmi, sharp, mppx, merkle-tree)
- [x] Chain config reads from env (testnet by default)
- [x] `.env.local` with all vars (secrets TBD until you fill them)
- [x] `.env.example` committed for reference

---

# Step 2 — Smart Contract & Hardhat

## Goal

`SentinelTEMPO.sol` deployed to Moderato testnet. We have the contract address.

## Commands

```bash
# Create contracts workspace (separate package in the monorepo)
mkdir contracts
cd contracts
pnpm init
pnpm add -D hardhat @nomicfoundation/hardhat-toolbox typescript ts-node
pnpm add -D @openzeppelin/contracts@^5.1.0

# Initialize Hardhat
npx hardhat init
# → Choose "Create a TypeScript project"
# → Say yes to .gitignore, yes to install dependencies
```

## Files to Create

### `contracts/hardhat.config.ts`

```typescript
import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import * as dotenv from "dotenv"
import path from "path"

// Load env from root project
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const DEPLOYER_KEY = process.env.SERVER_PRIVATE_KEY || "0x" + "0".repeat(64)

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    moderato: {
      url: "https://rpc.moderato.tempo.xyz",
      chainId: 42431,
      accounts: [DEPLOYER_KEY],
    },
    tempo: {
      url: "https://rpc.tempo.xyz",
      chainId: 4217,
      accounts: [DEPLOYER_KEY],
    },
  },
}

export default config
```

### `contracts/contracts/SentinelTEMPO.sol`

Full Solidity contract — exactly as designed in the plan:

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
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant WL_PRICE = 5_000_000;      // 5 pathUSD (6 decimals)
    uint256 public constant PUBLIC_PRICE = 8_000_000;   // 8 pathUSD (6 decimals)

    address public immutable paymentToken;
    address public treasury;
    bytes32 public merkleRoot;

    enum Phase { CLOSED, WHITELIST, PUBLIC }
    Phase public mintPhase;

    mapping(uint256 => string) private _tokenURIs;
    mapping(address => bool) public minters;
    mapping(address => bool) public wlMinted;

    constructor(
        address _paymentToken,
        address _treasury,
        bytes32 _merkleRoot
    ) ERC721("SentinelTEMPO", "SNTL") Ownable(msg.sender) {
        paymentToken = _paymentToken;
        treasury = _treasury;
        merkleRoot = _merkleRoot;
    }

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

    function mintTo(address to, string calldata uri) external returns (uint256) {
        require(minters[msg.sender], "not authorized minter");
        require(mintPhase != Phase.CLOSED, "minting closed");
        require(totalSupply < MAX_SUPPLY, "sold out");

        uint256 tokenId = totalSupply++;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

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

### `contracts/scripts/deploy.ts`

```typescript
import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying with:", deployer.address)

  const pathUSD = process.env.NEXT_PUBLIC_PATHUSD_ADDRESS
  const treasury = process.env.NFT_TREASURY_WALLET
  
  if (!pathUSD || !treasury) {
    throw new Error("Missing NEXT_PUBLIC_PATHUSD_ADDRESS or NFT_TREASURY_WALLET in .env.local")
  }

  // Temporary placeholder root — will be set properly in Step 3
  const placeholderRoot = ethers.ZeroHash

  const SentinelTEMPO = await ethers.getContractFactory("SentinelTEMPO")
  const contract = await SentinelTEMPO.deploy(pathUSD, treasury, placeholderRoot)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log("SentinelTEMPO deployed to:", address)
  console.log("")
  console.log("Next steps:")
  console.log(`1. Add to .env.local:  NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=${address}`)
  console.log("2. Run generate-merkle to create the real Merkle root")
  console.log("3. Run set-merkle-root to update the contract")
  console.log("4. Run set-minter to authorize the server wallet")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

### `contracts/scripts/set-merkle-root.ts`

```typescript
import { ethers } from "hardhat"
import merkleData from "../../config/merkle-root.json"

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Setting Merkle root:", merkleData.root)
  const tx = await contract.setMerkleRoot(merkleData.root)
  await tx.wait()
  console.log("Merkle root set. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

### `contracts/scripts/set-minter.ts`

```typescript
import { ethers } from "hardhat"

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  // The server wallet that will call mintTo() for agent mints
  const minterAddress = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY!).address

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Authorizing minter:", minterAddress)
  const tx = await contract.setMinter(minterAddress, true)
  await tx.wait()
  console.log("Minter authorized. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

### `contracts/scripts/set-phase.ts`

```typescript
import { ethers } from "hardhat"

// Usage: npx hardhat run scripts/set-phase.ts --network moderato
// Set MINT_PHASE env var: 0=CLOSED, 1=WHITELIST, 2=PUBLIC
async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const phase = Number(process.env.MINT_PHASE ?? 0)
  const phaseNames = ["CLOSED", "WHITELIST", "PUBLIC"]

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log(`Setting phase to: ${phaseNames[phase]} (${phase})`)
  const tx = await contract.setMintPhase(phase)
  await tx.wait()
  console.log("Phase set. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

### `contracts/package.json` scripts section

```json
{
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy:moderato": "hardhat run scripts/deploy.ts --network moderato",
    "deploy:mainnet": "hardhat run scripts/deploy.ts --network tempo",
    "set-merkle-root:moderato": "hardhat run scripts/set-merkle-root.ts --network moderato",
    "set-merkle-root:mainnet": "hardhat run scripts/set-merkle-root.ts --network tempo",
    "set-minter:moderato": "hardhat run scripts/set-minter.ts --network moderato",
    "set-minter:mainnet": "hardhat run scripts/set-minter.ts --network tempo",
    "set-phase:moderato": "MINT_PHASE=${MINT_PHASE:-0} hardhat run scripts/set-phase.ts --network moderato"
  }
}
```

## Deploy Sequence

```bash
cd contracts

# 1. Compile
pnpm compile

# 2. Deploy to Moderato testnet
pnpm deploy:moderato
# → Prints: SentinelTEMPO deployed to: 0x...
# → Copy this address into .env.local as NEXT_PUBLIC_NFT_CONTRACT_ADDRESS

# 3. Authorize server wallet as minter (for agent mintTo calls)
pnpm set-minter:moderato

# 4. Merkle root will be set in Step 3 (after we generate the tree)
```

## Verify Step 2

- Contract compiles without errors
- Contract deploys to Moderato
- Contract address visible on `https://explore.testnet.tempo.xyz/address/0x...`
- Server wallet authorized as minter

## What's Done After Step 2

- [x] `SentinelTEMPO.sol` deployed to Moderato testnet
- [x] Contract address in `.env.local`
- [x] Server wallet authorized as minter
- [x] Admin scripts: `set-merkle-root`, `set-minter`, `set-phase`
- [x] Phase is CLOSED (default — we'll open after WL is set up)

---

# Step 3 — Whitelist System (Merkle Tree)

## Goal

Generate Merkle tree from WL addresses. Set root on contract. API serves WL checks and proofs.

## Files to Create

### `config/whitelist.json` — You populate this

```json
[
  "0xYOUR_WL_ADDRESS_1",
  "0xYOUR_WL_ADDRESS_2",
  "0xYOUR_WL_ADDRESS_3"
]
```

### `scripts/generate-merkle.ts`

```typescript
import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
import fs from "fs"
import path from "path"

const whitelistPath = path.resolve(__dirname, "../config/whitelist.json")
const whitelist: string[] = JSON.parse(fs.readFileSync(whitelistPath, "utf-8"))

// Normalize addresses to lowercase
const leaves = whitelist.map(addr => [addr.toLowerCase()])
const tree = StandardMerkleTree.of(leaves, ["address"])

console.log("Merkle Root:", tree.root)
console.log("Whitelisted addresses:", whitelist.length)

// Save root
const rootPath = path.resolve(__dirname, "../config/merkle-root.json")
fs.writeFileSync(rootPath, JSON.stringify({ root: tree.root }, null, 2))
console.log("Root saved to:", rootPath)

// Save proofs per address
const proofs: Record<string, string[]> = {}
for (const [i, v] of tree.entries()) {
  proofs[v[0].toLowerCase()] = tree.getProof(i)
}
const proofsPath = path.resolve(__dirname, "../config/merkle-proofs.json")
fs.writeFileSync(proofsPath, JSON.stringify(proofs, null, 2))
console.log("Proofs saved to:", proofsPath)
```

### `lib/whitelist.ts`

```typescript
import merkleProofs from "@/config/merkle-proofs.json"

const proofs = merkleProofs as Record<string, string[]>

export function isWhitelisted(address: string): boolean {
  return address.toLowerCase() in proofs
}

export function getMerkleProof(address: string): string[] | null {
  const proof = proofs[address.toLowerCase()]
  return proof ?? null
}
```

### `app/api/nft/wl/check/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { isWhitelisted } from "@/lib/whitelist"

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }

  return NextResponse.json({
    address: address.toLowerCase(),
    whitelisted: isWhitelisted(address),
  })
}
```

### `app/api/nft/wl/proof/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getMerkleProof, isWhitelisted } from "@/lib/whitelist"

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }

  if (!isWhitelisted(address)) {
    return NextResponse.json({ error: "Address not whitelisted" }, { status: 404 })
  }

  return NextResponse.json({
    address: address.toLowerCase(),
    proof: getMerkleProof(address),
  })
}
```

## Run Sequence

```bash
# 1. Add your test WL addresses to config/whitelist.json

# 2. Generate the Merkle tree
pnpm tsx scripts/generate-merkle.ts
# → Prints root, saves to config/merkle-root.json and config/merkle-proofs.json

# 3. Set root on deployed contract
cd contracts
pnpm set-merkle-root:moderato

# 4. Open WL phase
MINT_PHASE=1 pnpm set-phase:moderato
```

## Add to `package.json` scripts (root)

```json
{
  "scripts": {
    "generate-merkle": "tsx scripts/generate-merkle.ts"
  }
}
```

## Verify Step 3

```bash
# Test WL check
curl http://localhost:3000/api/nft/wl/check?address=0xYOUR_WL_ADDRESS
# → { "address": "0x...", "whitelisted": true }

# Test proof
curl http://localhost:3000/api/nft/wl/proof?address=0xYOUR_WL_ADDRESS
# → { "address": "0x...", "proof": ["0x...","0x..."] }

# Test non-WL address
curl http://localhost:3000/api/nft/wl/check?address=0x0000000000000000000000000000000000000001
# → { "address": "0x...", "whitelisted": false }
```

## What's Done After Step 3

- [x] Merkle tree generated from WL addresses
- [x] Root set on contract
- [x] `/api/nft/wl/check` endpoint working
- [x] `/api/nft/wl/proof` endpoint working
- [x] Contract in WHITELIST phase

---

# Step 4 — Trait System & Image Composition

## Goal

Define trait catalog, compose layered images with Sharp, serve preview endpoint.

## Files to Create

### `config/traits.json` — Trait catalog definition

```json
{
  "layers": [
    {
      "id": "background",
      "name": "Background",
      "order": 0,
      "required": true,
      "options": [
        { "id": "bg_blue", "name": "Blue", "file": "0-background/bg_blue.png" },
        { "id": "bg_red", "name": "Red", "file": "0-background/bg_red.png" },
        { "id": "bg_green", "name": "Green", "file": "0-background/bg_green.png" }
      ]
    },
    {
      "id": "body",
      "name": "Body",
      "order": 1,
      "required": true,
      "options": [
        { "id": "body_armor", "name": "Armored", "file": "1-body/body_armor.png" },
        { "id": "body_robe", "name": "Robe", "file": "1-body/body_robe.png" }
      ]
    },
    {
      "id": "head",
      "name": "Head",
      "order": 2,
      "required": true,
      "options": [
        { "id": "head_helmet", "name": "Helmet", "file": "2-head/head_helmet.png" },
        { "id": "head_crown", "name": "Crown", "file": "2-head/head_crown.png" }
      ]
    },
    {
      "id": "eyes",
      "name": "Eyes",
      "order": 3,
      "required": true,
      "options": [
        { "id": "eyes_laser", "name": "Laser", "file": "3-eyes/eyes_laser.png" },
        { "id": "eyes_normal", "name": "Normal", "file": "3-eyes/eyes_normal.png" }
      ]
    },
    {
      "id": "accessories",
      "name": "Accessories",
      "order": 4,
      "required": false,
      "options": [
        { "id": "acc_wings", "name": "Wings", "file": "4-accessories/acc_wings.png" },
        { "id": "acc_shield", "name": "Shield", "file": "4-accessories/acc_shield.png" },
        { "id": "acc_none", "name": "None", "file": "4-accessories/acc_none.png" }
      ]
    },
    {
      "id": "color",
      "name": "Color Overlay",
      "order": 5,
      "required": false,
      "options": [
        { "id": "color_gold", "name": "Gold", "file": "5-color/color_gold.png" },
        { "id": "color_silver", "name": "Silver", "file": "5-color/color_silver.png" },
        { "id": "color_none", "name": "None", "file": "5-color/color_none.png" }
      ]
    }
  ]
}
```

### `assets/layers/` — Your placeholder PNGs go here

```
assets/layers/
├── 0-background/
│   ├── bg_blue.png        ← 1024x1024 solid blue
│   ├── bg_red.png         ← 1024x1024 solid red
│   └── bg_green.png       ← 1024x1024 solid green
├── 1-body/
│   ├── body_armor.png     ← transparent PNG with shape
│   └── body_robe.png
├── 2-head/
│   ├── head_helmet.png
│   └── head_crown.png
├── 3-eyes/
│   ├── eyes_laser.png
│   └── eyes_normal.png
├── 4-accessories/
│   ├── acc_wings.png
│   ├── acc_shield.png
│   └── acc_none.png       ← fully transparent 1024x1024
└── 5-color/
    ├── color_gold.png     ← semi-transparent gold overlay
    ├── color_silver.png
    └── color_none.png     ← fully transparent 1024x1024
```

**Rules for PNGs:**
- All must be exactly **1024x1024 pixels**
- All must be **PNG with alpha channel** (RGBA)
- Background layer: opaque (no transparency)
- All other layers: transparent background, only the trait element is visible
- "None" options: fully transparent 1024x1024 (for optional layers)

### `lib/traits.ts`

```typescript
import traitsConfig from "@/config/traits.json"

export type Layer = typeof traitsConfig.layers[number]
export type TraitOption = Layer["options"][number]
export type TraitSelection = Record<string, string>  // { layerId: optionId }

export function getTraitCatalog() {
  return traitsConfig
}

export function getLayer(layerId: string): Layer | undefined {
  return traitsConfig.layers.find(l => l.id === layerId)
}

export function validateTraits(selection: TraitSelection): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const layer of traitsConfig.layers) {
    const selectedOption = selection[layer.id]

    if (layer.required && !selectedOption) {
      errors.push(`Missing required layer: ${layer.name}`)
      continue
    }

    if (selectedOption) {
      const optionExists = layer.options.some(o => o.id === selectedOption)
      if (!optionExists) {
        errors.push(`Invalid option "${selectedOption}" for layer "${layer.name}"`)
      }
    }
  }

  // Check for unknown layers
  for (const layerId of Object.keys(selection)) {
    if (!traitsConfig.layers.some(l => l.id === layerId)) {
      errors.push(`Unknown layer: ${layerId}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function getLayerFile(layerId: string, optionId: string): string | null {
  const layer = traitsConfig.layers.find(l => l.id === layerId)
  if (!layer) return null
  const option = layer.options.find(o => o.id === optionId)
  return option ? option.file : null
}

export function getTraitAttributes(selection: TraitSelection) {
  return traitsConfig.layers
    .filter(layer => selection[layer.id] && selection[layer.id] !== `${layer.id}_none`)
    .map(layer => {
      const option = layer.options.find(o => o.id === selection[layer.id])
      return {
        trait_type: layer.name,
        value: option?.name ?? selection[layer.id],
      }
    })
}
```

### `lib/compose.ts`

```typescript
import sharp from "sharp"
import path from "path"
import traitsConfig from "@/config/traits.json"
import { TraitSelection, getLayerFile } from "@/lib/traits"

const LAYERS_DIR = path.resolve(process.cwd(), "assets/layers")
const IMAGE_SIZE = 1024

export async function composeImage(selection: TraitSelection): Promise<Buffer> {
  // Collect layers in order
  const layers: sharp.OverlayOptions[] = []

  for (const layer of traitsConfig.layers) {
    const optionId = selection[layer.id]
    if (!optionId) continue

    const file = getLayerFile(layer.id, optionId)
    if (!file) continue

    const filePath = path.join(LAYERS_DIR, file)
    layers.push({ input: filePath })
  }

  if (layers.length === 0) {
    throw new Error("No layers selected")
  }

  // Start with the first layer (background) as base, composite the rest on top
  const [base, ...overlays] = layers

  const image = sharp(base.input as string)
    .resize(IMAGE_SIZE, IMAGE_SIZE)

  if (overlays.length > 0) {
    image.composite(overlays)
  }

  return image.png().toBuffer()
}
```

### `app/api/nft/traits/route.ts`

```typescript
import { NextResponse } from "next/server"
import { getTraitCatalog } from "@/lib/traits"

export async function GET() {
  return NextResponse.json(getTraitCatalog())
}
```

### `app/api/nft/traits/[layerId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getLayer } from "@/lib/traits"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layerId: string }> }
) {
  const { layerId } = await params
  const layer = getLayer(layerId)

  if (!layer) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 })
  }

  return NextResponse.json(layer)
}
```

### `app/api/nft/preview/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { validateTraits, TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const traits: TraitSelection = body.traits

  if (!traits || typeof traits !== "object") {
    return NextResponse.json({ error: "Missing traits object" }, { status: 400 })
  }

  const validation = validateTraits(traits)
  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid traits", details: validation.errors }, { status: 400 })
  }

  const imageBuffer = await composeImage(traits)

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  })
}
```

## Verify Step 4

```bash
# Get trait catalog
curl http://localhost:3000/api/nft/traits | jq .

# Get single layer
curl http://localhost:3000/api/nft/traits/background | jq .

# Preview an NFT (should return PNG bytes)
curl -X POST http://localhost:3000/api/nft/preview \
  -H "Content-Type: application/json" \
  -d '{"traits":{"background":"bg_blue","body":"body_armor","head":"head_helmet","eyes":"eyes_laser"}}' \
  --output test-preview.png

# Open test-preview.png — should show composed image
```

## What's Done After Step 4

- [x] Trait catalog defined in `config/traits.json`
- [x] Placeholder PNGs in `assets/layers/`
- [x] Sharp image composition working
- [x] `GET /api/nft/traits` serves catalog
- [x] `POST /api/nft/preview` composes + returns PNG
- [x] Trait validation catches invalid selections

---

# Step 5 — Irys Upload Pipeline

## Goal

Upload composed images and metadata JSON to Irys. Get permanent URLs back.

## Files to Create

### `lib/irys.ts`

```typescript
import { getServerEnv } from "@/lib/env"

// Dynamic import because Irys SDK is ESM-heavy
async function getIrysUploader() {
  const { Uploader } = await import("@irys/upload")
  const { Ethereum } = await import("@irys/upload-ethereum")

  const env = getServerEnv()

  const irys = await Uploader(Ethereum)
    .withWallet(env.irysPrivateKey)
    .withRpc(env.irysNode)
    .build()

  return irys
}

export async function uploadImage(imageBuffer: Buffer): Promise<string> {
  const irys = await getIrysUploader()

  const receipt = await irys.upload(imageBuffer, {
    tags: [
      { name: "Content-Type", value: "image/png" },
      { name: "App-Name", value: "SentinelTEMPO" },
    ],
  })

  return `https://gateway.irys.xyz/${receipt.id}`
}

export async function uploadMetadata(metadata: {
  name: string
  description: string
  image: string
  attributes: { trait_type: string; value: string }[]
}): Promise<string> {
  const irys = await getIrysUploader()

  const receipt = await irys.upload(JSON.stringify(metadata), {
    tags: [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SentinelTEMPO" },
    ],
  })

  return `https://gateway.irys.xyz/${receipt.id}`
}
```

**Note on Irys SDK:** The exact import path and API may vary depending on the Irys SDK version at the time of build. We'll verify against the latest `@irys/upload` docs and adjust if needed. The devnet (`https://devnet.irys.xyz`) is free for testnet — no funds needed.

## Verify Step 5

```bash
# We'll create a small test script or test it through the preview pipeline
# The real test is in Step 6 when we do a full mint flow
```

## What's Done After Step 5

- [x] `uploadImage()` takes PNG buffer → returns Irys URL
- [x] `uploadMetadata()` takes metadata object → returns tokenURI
- [x] Uses devnet for testnet, node2 for mainnet (env var switch)

---

# Step 6 — Wallet Connect & Human Mint (Frontend)

## Goal

Full human minting flow: Connect MetaMask → pick traits → preview → approve pathUSD → mint → see NFT.

## Files to Create

### `app/providers.tsx` — Wagmi + React Query providers

```tsx
"use client"

import { WagmiProvider, createConfig, http } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { metaMask, coinbaseWallet } from "wagmi/connectors"
import { tempoChain } from "@/lib/chain"

const config = createConfig({
  chains: [tempoChain],
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: "SentinelTEMPO" }),
  ],
  multiInjectedProviderDiscovery: true,
  transports: {
    [tempoChain.id]: http(),
  },
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### `app/layout.tsx` — Updated with providers

```tsx
import type { Metadata } from "next"
import { Providers } from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "SentinelTEMPO",
  description: "10K NFT Collection on Tempo",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### `lib/contract.ts` — Contract ABI and helpers

```typescript
// ABI — only the functions we need (not the full ABI to save bundle size)
export const SENTINEL_ABI = [
  {
    name: "mintWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes32[]" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintPublic",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "uri", type: "string" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintPhase",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "wlMinted",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const

// pathUSD TIP-20 ABI (just approve + balanceOf)
export const PATHUSD_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const
```

### Components (6 files)

**`components/WalletConnect.tsx`** — Connect/disconnect wallet with "Add Tempo" support
- Shows available wallets (MetaMask, Coinbase, any injected)
- After connect → shows address + "Sign out" button
- If wallet not on Tempo chain → shows "Add Tempo to wallet" button using `useSwitchChain`
- Reads pathUSD balance via `ITIP20.balanceOf()` and displays it

**`components/WhitelistChecker.tsx`** — WL status display
- On wallet connect → calls `GET /api/nft/wl/check?address=...`
- Shows "Whitelisted — Mint for 5 pathUSD" or "Public — Mint for 8 pathUSD"
- Also checks `wlMinted` on contract to show if WL mint already used

**`components/TraitPicker.tsx`** — Layer-by-layer trait selector
- Fetches catalog from `GET /api/nft/traits`
- For each layer: shows options as selectable cards/buttons
- Required layers show a mandatory indicator
- Emits `onTraitsChange(selection)` for live preview

**`components/NFTPreview.tsx`** — Live preview image
- On trait change → calls `POST /api/nft/preview` with selected traits
- Shows composed image in a preview card
- Loading state while composing

**`components/MintButton.tsx`** — The critical mint flow
- Disabled until traits are selected and wallet is connected
- On click, executes this sequence:
  1. Call backend to compose final image + upload to Irys → get `tokenURI`
  2. Estimate if user needs to approve pathUSD (`allowance` check)
  3. If needed → `pathUSD.approve(contractAddress, price)` → wait for confirmation
  4. Call `mintWhitelist(proof, tokenURI)` or `mintPublic(tokenURI)` on contract
  5. Wait for tx confirmation
  6. Show success: token ID, tx hash, link to explorer, link to NFT image
- Shows status at each step: "Uploading..." → "Approving pathUSD..." → "Minting..." → "Done!"

**`components/CollectionGrid.tsx`** — Gallery of minted NFTs (built in Step 9, placeholder here)

### `app/mint/page.tsx` — The mint page

```tsx
"use client"

import { WalletConnect } from "@/components/WalletConnect"
import { WhitelistChecker } from "@/components/WhitelistChecker"
import { TraitPicker } from "@/components/TraitPicker"
import { NFTPreview } from "@/components/NFTPreview"
import { MintButton } from "@/components/MintButton"
import { useState } from "react"
import { TraitSelection } from "@/lib/traits"

export default function MintPage() {
  const [selectedTraits, setSelectedTraits] = useState<TraitSelection>({})

  return (
    <main className="container mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-bold mb-8">Mint Your SentinelTEMPO</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
          <WalletConnect />
          <WhitelistChecker />
          <TraitPicker onTraitsChange={setSelectedTraits} />
        </div>

        {/* Right: Preview + Mint */}
        <div className="space-y-6">
          <NFTPreview traits={selectedTraits} />
          <MintButton traits={selectedTraits} />
        </div>
      </div>
    </main>
  )
}
```

### `app/api/nft/prepare/route.ts` — Backend: compose + upload + return tokenURI

This is called by `MintButton` before the on-chain mint:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { validateTraits, getTraitAttributes, TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"

export async function POST(request: NextRequest) {
  const { traits, tokenIndex } = await request.json()

  const validation = validateTraits(traits as TraitSelection)
  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid traits", details: validation.errors }, { status: 400 })
  }

  // Compose image
  const imageBuffer = await composeImage(traits)

  // Upload image to Irys
  const imageUrl = await uploadImage(imageBuffer)

  // Build and upload metadata
  const metadata = {
    name: `SentinelTEMPO #${tokenIndex ?? "?"}`,
    description: "A Sentinel guarding the Tempo blockchain.",
    image: imageUrl,
    attributes: getTraitAttributes(traits),
  }
  const tokenURI = await uploadMetadata(metadata)

  return NextResponse.json({ tokenURI, imageUrl, metadata })
}
```

## Human Mint Flow — Full Sequence

```
User                    Frontend                 Backend             Contract
 │                        │                        │                    │
 │── Connect wallet ────▶ │                        │                    │
 │                        │── GET /wl/check ──────▶│                    │
 │                        │◀── { whitelisted } ────│                    │
 │                        │                        │                    │
 │── Pick traits ────────▶│                        │                    │
 │                        │── POST /preview ──────▶│                    │
 │◀──── show preview ─────│◀── PNG ────────────────│                    │
 │                        │                        │                    │
 │── Click "Mint" ───────▶│                        │                    │
 │                        │── POST /prepare ──────▶│                    │
 │                        │                        │── upload to Irys   │
 │                        │◀── { tokenURI } ───────│                    │
 │                        │                        │                    │
 │◀── approve pathUSD ────│───────────────────────────── approve() ───▶│
 │── confirm in wallet ──▶│                        │                    │
 │                        │───────────────────────────── mintWL() ────▶│
 │                        │                        │                    │── verifies proof
 │                        │                        │                    │── pulls pathUSD
 │                        │                        │                    │── mints NFT
 │                        │◀──────────────────────────── tx receipt ───│
 │◀── "Minted! #42" ─────│                        │                    │
```

## Verify Step 6

1. Open `http://localhost:3000/mint`
2. Connect MetaMask (should prompt to add Moderato network)
3. See WL status (whitelisted or not)
4. Pick traits from each layer
5. See live preview update
6. Click "Mint"
7. Approve pathUSD in MetaMask
8. Confirm mint tx in MetaMask
9. See success with token ID and explorer link
10. Check explorer: `https://explore.testnet.tempo.xyz/tx/0x...`

## What's Done After Step 6

- [x] Wagmi wallet connect (MetaMask + auto-detect others)
- [x] WL status check on connect
- [x] Trait picker with live preview
- [x] pathUSD approve + mint transaction flow
- [x] Irys upload (compose → upload image → upload metadata → get tokenURI)
- [x] End-to-end human WL + public mint on Moderato testnet
- [x] Transaction success UI with explorer links

---

# Step 7 — MPP Agent Mint (Backend)

## Goal

Agents can mint by calling `POST /api/nft/mint`. Server handles 402 challenge, payment verification, compose, upload, and `mintTo()`.

## Files to Create

### `app/api/nft/mint/route.ts` — MPP-enabled mint endpoint

```typescript
import { NextRequest, NextResponse } from "next/server"
import { Mppx, tempo } from "mppx/nextjs"
import { privateKeyToAccount } from "viem/accounts"
import { createPublicClient, createWalletClient, http } from "viem"
import { getServerEnv } from "@/lib/env"
import { tempoChain, NFT_CONTRACT_ADDRESS, PATHUSD_ADDRESS } from "@/lib/chain"
import { validateTraits, getTraitAttributes, TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"
import { SENTINEL_ABI } from "@/lib/contract"
import { isWhitelisted } from "@/lib/whitelist"

const env = getServerEnv()

const mppx = Mppx.create({
  methods: [tempo({
    currency: PATHUSD_ADDRESS,
    recipient: env.treasuryWallet,
    feePayer: process.env.FEE_PAYER_KEY
      ? privateKeyToAccount(env.feePayerKey)
      : "https://sponsor.moderato.tempo.xyz",
  })],
})

const serverAccount = privateKeyToAccount(env.serverPrivateKey)

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(),
})

const walletClient = createWalletClient({
  account: serverAccount,
  chain: tempoChain,
  transport: http(),
})

export const POST =
  mppx.charge({
    amount: async (request: NextRequest) => {
      // Read the body to determine WL vs public price
      const body = await request.clone().json()
      const recipient = body.recipient
      if (recipient && isWhitelisted(recipient)) return "5"
      return "8"
    },
  })(async (request: NextRequest) => {
    const { traits, recipient } = await request.json()

    // Validate
    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 })
    }

    const validation = validateTraits(traits as TraitSelection)
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid traits", details: validation.errors }, { status: 400 })
    }

    // Get current supply for naming
    const totalSupply = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "totalSupply",
    })

    // Compose image
    const imageBuffer = await composeImage(traits)
    const imageUrl = await uploadImage(imageBuffer)

    // Build and upload metadata
    const metadata = {
      name: `SentinelTEMPO #${totalSupply}`,
      description: "A Sentinel guarding the Tempo blockchain.",
      image: imageUrl,
      attributes: getTraitAttributes(traits),
    }
    const tokenURI = await uploadMetadata(metadata)

    // Mint on-chain via server wallet
    const txHash = await walletClient.writeContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "mintTo",
      args: [recipient as `0x${string}`, tokenURI],
    })

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    return NextResponse.json({
      tokenId: Number(totalSupply),
      tokenURI,
      imageUrl,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      recipient,
      traits,
      phase: isWhitelisted(recipient) ? "whitelist" : "public",
    })
  })
```

**Note:** The exact `mppx/nextjs` middleware API may differ slightly from the above. We'll verify against the latest mppx docs during implementation and adjust the wrapper pattern if needed. The core flow (402 challenge → payment → verify → respond) is the same regardless.

### `app/api/nft/status/route.ts`

```typescript
import { NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { tempoChain, NFT_CONTRACT_ADDRESS } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(),
})

export async function GET() {
  const [totalSupply, mintPhase] = await Promise.all([
    publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "totalSupply",
    }),
    publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: SENTINEL_ABI,
      functionName: "mintPhase",
    }),
  ])

  const phaseNames = ["closed", "whitelist", "public"]

  return NextResponse.json({
    totalSupply: Number(totalSupply),
    maxSupply: 10_000,
    remaining: 10_000 - Number(totalSupply),
    phase: phaseNames[Number(mintPhase)],
    prices: {
      whitelist: "5",
      public: "8",
      currency: "pathUSD",
    },
  })
}
```

## Test Agent Mint

```bash
# 1. Create a test MPP account (funded with testnet tokens)
npx mppx account create

# 2. Inspect the 402 challenge (no payment)
npx mppx --inspect -X POST --json '{"traits":{"background":"bg_blue","body":"body_armor","head":"head_helmet","eyes":"eyes_laser"},"recipient":"0xYOUR_TEST_ADDRESS"}' http://localhost:3000/api/nft/mint

# 3. Actually mint via MPP
npx mppx -X POST --json '{"traits":{"background":"bg_blue","body":"body_armor","head":"head_helmet","eyes":"eyes_laser"},"recipient":"0xYOUR_TEST_ADDRESS"}' http://localhost:3000/api/nft/mint

# 4. Check status
curl http://localhost:3000/api/nft/status | jq .
```

## What's Done After Step 7

- [x] `POST /api/nft/mint` — full MPP-enabled agent mint
- [x] `GET /api/nft/status` — supply, phase, prices
- [x] Dynamic pricing: 5 pathUSD for WL recipients, 8 for public
- [x] Fee sponsorship via testnet sponsor
- [x] End-to-end agent mint tested with `npx mppx`

---

# Step 8 — Agent Discovery Files

## Goal

Agents can find and understand our service automatically via SKILL.md, llms.txt, and OpenAPI.

## Files to Create

### `public/SKILL.md`

```markdown
---
name: sentinel-tempo
description: >
  Use this skill to mint SentinelTEMPO NFTs on Tempo. Check whitelist status,
  browse available traits, preview compositions, and mint with automatic payment
  via MPP. Supports both whitelist (5 pathUSD) and public (8 pathUSD) pricing.
---

# SentinelTEMPO — NFT Minting Service

## What this service does
Mint custom SentinelTEMPO NFTs on the Tempo blockchain. Choose from 6 trait
layers, preview your composition, and mint. Whitelist addresses pay 5 pathUSD,
public mints cost 8 pathUSD.

## Quick Start

1. Check available traits: GET /api/nft/traits
2. Check mint status: GET /api/nft/status
3. Preview your NFT: POST /api/nft/preview (free)
4. Mint: POST /api/nft/mint (paid via MPP — 5 or 8 pathUSD)

## Endpoints

### Check whitelist status (free)
GET /api/nft/wl/check?address=<wallet_address>
Returns: { "address": "0x...", "whitelisted": true/false }

### Get available traits (free)
GET /api/nft/traits
Returns: Full trait catalog with all layers and options

### Get mint status (free)
GET /api/nft/status
Returns: { "phase": "whitelist|public|closed", "totalSupply": N, "maxSupply": 10000, "prices": {...} }

### Preview NFT (free)
POST /api/nft/preview
Content-Type: application/json
Body: { "traits": { "background": "bg_blue", "body": "body_armor", "head": "head_helmet", "eyes": "eyes_laser" } }
Returns: PNG image

### Mint NFT (paid via MPP)
POST /api/nft/mint
Content-Type: application/json
Body: { "traits": { "background": "bg_blue", "body": "body_armor", "head": "head_helmet", "eyes": "eyes_laser" }, "recipient": "0x..." }
Price: 5 pathUSD (whitelist addresses) or 8 pathUSD (public)
Payment: Automatic via MPP HTTP 402 challenge/credential flow

## Payment Details
- Currency: pathUSD on Tempo
- Network: Chain 42431 (testnet) / Chain 4217 (mainnet)
- Protocol: MPP (Machine Payments Protocol)
- The endpoint returns HTTP 402 with a payment challenge. Your MPP client handles payment automatically.
```

### `public/llms.txt`

```
# SentinelTEMPO
> 10K NFT Collection on Tempo with AI agent minting support

## Endpoints
- GET /api/nft/traits — Trait catalog (free)
- GET /api/nft/status — Supply, phase, prices (free)
- GET /api/nft/wl/check?address=0x... — Whitelist check (free)
- GET /api/nft/wl/proof?address=0x... — Merkle proof (free)
- POST /api/nft/preview — Preview composition (free)
- POST /api/nft/mint — Mint NFT (paid via MPP, 5-8 pathUSD)

## Docs
- /SKILL.md — Full agent instructions
- /api/nft/openapi.json — OpenAPI 3.1 specification
```

### `public/api/nft/openapi.json`

Full OpenAPI 3.1 spec covering all endpoints — schemas for request/response bodies, trait catalog structure, error formats. This file will be ~200 lines of JSON. We'll generate it accurately based on the actual API shapes once the endpoints are built.

## What's Done After Step 8

- [x] `SKILL.md` with agent-friendly instructions
- [x] `llms.txt` with endpoint index
- [x] `openapi.json` with full API spec
- [x] All served as static files from `/public/`

---

# Step 9 — Collection Pages

## Goal

Browse all minted NFTs in a gallery. View individual NFT details.

## Files to Create

### `app/api/nft/collection/route.ts`

- `GET /api/nft/collection?page=1&limit=20`
- Reads `totalSupply` from contract
- For each token in the page range: reads `tokenURI` → fetches metadata from Irys
- Returns array of `{ tokenId, name, image, attributes, owner }`
- Paginated to avoid loading all 10K at once

### `app/api/nft/collection/[tokenId]/route.ts`

- `GET /api/nft/collection/42`
- Reads `tokenURI(42)` from contract → fetches metadata from Irys
- Reads owner via `ownerOf(42)` from contract
- Returns full NFT details

### `components/CollectionGrid.tsx`

- Grid of NFT cards (image + name + token ID)
- Click to navigate to detail page
- Pagination controls
- Loading skeletons

### `app/collection/page.tsx`

- Gallery page using `CollectionGrid`
- Shows total minted count
- Pagination

### `app/collection/[tokenId]/page.tsx`

- Full detail page for a single NFT
- Shows: image (large), name, all attributes/traits, owner address, link to explorer
- Link back to collection

## What's Done After Step 9

- [x] `/collection` — paginated gallery of all minted NFTs
- [x] `/collection/42` — individual NFT detail page
- [x] API endpoints serving collection data from on-chain + Irys

---

# Step 10 — Landing Page & Polish

## Goal

Production-ready UI with proper navigation, loading states, error handling, and responsive design.

## Files to Create / Update

### `components/Header.tsx`

- Nav links: Home, Mint, Collection
- Wallet connect button (compact — shows address when connected)
- Supply counter badge

### `components/Footer.tsx`

- Links: Explorer, Source, Tempo website

### `components/SupplyCounter.tsx`

- Reads `totalSupply` from contract (live)
- Shows `X / 10,000 minted`
- Progress bar

### `components/PhaseIndicator.tsx`

- Reads `mintPhase` from contract
- Shows current phase with visual indicator (CLOSED = gray, WL = yellow, PUBLIC = green)

### `app/page.tsx` — Landing page redesign

- Hero section with project description
- Supply counter + phase indicator
- CTA button → `/mint`
- Sample NFT previews
- Brief FAQ or "How it works" section

### Error Handling (across all components)

- Wrong network → "Switch to Tempo" toast
- Insufficient pathUSD balance → show balance + required amount
- Transaction rejected → "Transaction cancelled" message
- Transaction failed on-chain → show error reason
- Sold out → disable mint, show "Sold Out"
- Already minted WL → show "You've already used your whitelist mint"
- Network error → retry button with exponential backoff

### Loading States

- Wallet connecting → spinner
- Checking WL status → skeleton
- Composing preview → image skeleton
- Uploading to Irys → progress text
- Approving pathUSD → step indicator
- Minting → step indicator with tx hash once broadcast
- Loading collection → card skeletons

### Mobile Responsive

- Mint page: stack trait picker on top, preview below
- Collection: 1-2 columns on mobile, 3-4 on desktop
- Wallet connect: compact on mobile

## What's Done After Step 10

- [x] Professional landing page
- [x] Navigation between all pages
- [x] Error handling for every failure case
- [x] Loading states everywhere
- [x] Mobile responsive
- [x] Ready for production

---

# Mainnet Checklist

When ready to go live, follow this exact sequence:

```bash
# 1. Update .env.local with mainnet values
NEXT_PUBLIC_TEMPO_CHAIN_ID=4217
NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.tempo.xyz
NEXT_PUBLIC_TEMPO_WS_URL=wss://rpc.tempo.xyz
NEXT_PUBLIC_EXPLORER_URL=https://explore.tempo.xyz
NEXT_PUBLIC_CHAIN_NAME=Tempo Mainnet
IRYS_NODE=https://node2.irys.xyz

# 2. Fund mainnet wallets
# - Deployer wallet: enough pathUSD for deploy gas
# - Treasury wallet: this receives mint payments
# - Server wallet: needs pathUSD for mintTo() gas
# - Fee payer: if self-hosting (or use public sponsor)
# - Irys wallet: fund for permanent storage uploads

# 3. Deploy contract to mainnet
cd contracts
pnpm deploy:mainnet
# → Copy new contract address to .env.local

# 4. Set Merkle root on mainnet contract
pnpm set-merkle-root:mainnet

# 5. Authorize server wallet as minter
pnpm set-minter:mainnet

# 6. Set mint phase (start with WHITELIST or PUBLIC)
MINT_PHASE=1 pnpm run set-phase:mainnet  # 1=WHITELIST, 2=PUBLIC

# 7. Test one mint on mainnet before announcing

# 8. Update import in providers.tsx if using viem/chains directly
# (tempoChain from lib/chain.ts reads from env — no code change needed)

# 9. Deploy app to hosting (Vercel, etc.)
```

**Total code changes for mainnet: 0 files.** Only `.env.local` values change.

---

# Quick Command Reference

```bash
# ── Development ──
pnpm dev                                    # Start Next.js dev server
pnpm build                                  # Production build

# ── Merkle Tree ──
pnpm generate-merkle                        # Rebuild from whitelist.json

# ── Contract (from /contracts/) ──
pnpm compile                                # Compile Solidity
pnpm test                                   # Run contract tests
pnpm deploy:moderato                        # Deploy to testnet
pnpm set-merkle-root:moderato               # Update WL root
pnpm set-minter:moderato                    # Authorize server wallet
MINT_PHASE=1 pnpm set-phase:moderato        # 0=CLOSED, 1=WL, 2=PUBLIC

# ── Agent Testing ──
npx mppx account create                     # Create funded test account
npx mppx --inspect POST /api/nft/mint       # Debug 402 challenge
npx mppx POST /api/nft/mint                 # Full agent mint

# ── API Testing ──
curl localhost:3000/api/nft/status
curl localhost:3000/api/nft/traits
curl localhost:3000/api/nft/wl/check?address=0x...
```
