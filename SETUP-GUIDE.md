# SentinelTEMPO — Setup Guide (Before We Build)

> Everything YOU need to do before development starts.  
> Once these are ready, I start coding.

---

## Table of Contents

1. [Create the Deployer Wallet](#1-create-the-deployer-wallet)
2. [Create the Treasury Wallet](#2-create-the-treasury-wallet)
3. [Create the Server Wallet (for Agent Mints)](#3-create-the-server-wallet-for-agent-mints)
4. [Fund All Wallets from the Testnet Faucet](#4-fund-all-wallets-from-the-testnet-faucet)
5. [Create Whitelist Test Addresses](#5-create-whitelist-test-addresses)
6. [Create Placeholder PNG Art Assets](#6-create-placeholder-png-art-assets)
7. [Check Node.js Version](#7-check-nodejs-version)
8. [Fill In the Env Var Checklist](#8-fill-in-the-env-var-checklist)

---

## 1. Create the Deployer Wallet

**What it is:** The wallet that deploys the smart contract and owns it. This wallet will be the `onlyOwner` on the contract, meaning it's the only one that can:
- Change the mint phase (CLOSED → WHITELIST → PUBLIC)
- Update the Merkle root (whitelist changes)
- Authorize/revoke minter wallets
- Change the treasury address

**How to create it:**

### Option A: MetaMask (easiest)
1. Open MetaMask
2. Click your account icon → "Add account or hardware wallet" → "Add a new account"
3. Name it "SentinelTEMPO Deployer"
4. Click the three dots → "Account details" → "Show private key"
5. Enter your MetaMask password
6. **Copy the private key** — you'll need this for `.env.local` as `SERVER_PRIVATE_KEY`

### Option B: Command line (if you prefer)
```bash
# Generate a random wallet using node
node -e "const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts'); const key = generatePrivateKey(); const acc = privateKeyToAccount(key); console.log('Address:', acc.address); console.log('Private Key:', key);"
```

**Save these values:**
| Field | Value |
|-------|-------|
| Deployer Address | `0x_________________` |
| Deployer Private Key | `0x_________________` |

> **Security:** The deployer private key controls the contract. Keep it safe. Never share it. Never commit it to git. It goes only in `.env.local`.

---

## 2. Create the Treasury Wallet

**What it is:** The wallet that receives all pathUSD payments from mints. When someone mints an NFT (whitelist = 5 pathUSD, public = 8 pathUSD), the pathUSD goes to this address.

**Can it be the same as the deployer?** Yes, you can use one wallet for everything during testnet. But on mainnet, it's better to separate them so the treasury is a clean collection wallet.

**How to create:**
- Same process as above — create a new account in MetaMask or generate via CLI
- OR just use the deployer address for now (simpler for testing)

**Save this value:**
| Field | Value |
|-------|-------|
| Treasury Address | `0x_________________` |

> This address goes in `.env.local` as `NFT_TREASURY_WALLET`.

---

## 3. Create the Server Wallet (for Agent Mints)

**What it is:** When an AI agent mints via MPP, the server needs its own wallet to call `mintTo()` on the contract. This wallet is authorized as a "minter" on the contract.

**Can it be the same as the deployer?** Yes, for testnet you can reuse the deployer wallet. The deployer key serves double duty:
1. As the owner (admin functions)
2. As the minter (calling `mintTo()` for agent mints)

On mainnet, it's safer to use a separate wallet with limited permissions (only `mintTo()`, not admin).

**For testnet, simplest approach:** Use the same private key for `SERVER_PRIVATE_KEY` and the deployer. One wallet, three roles (owner + minter + server).

---

## 4. Fund All Wallets from the Testnet Faucet

**Where:** [https://docs.tempo.xyz/quickstart/faucet](https://docs.tempo.xyz/quickstart/faucet)

**What you get:** Free testnet pathUSD. This is used for:
- **Gas fees** when deploying the contract and calling admin functions
- **Minting** during testing (5 or 8 pathUSD per mint)
- **Agent testing** (the test mppx account needs funds too)

**Steps:**
1. Go to [https://docs.tempo.xyz/quickstart/faucet](https://docs.tempo.xyz/quickstart/faucet)
2. Enter your deployer wallet address
3. Click to receive testnet tokens (pathUSD, AlphaUSD, BetaUSD, ThetaUSD)
4. Repeat for each wallet that needs funds (treasury doesn't need initial funds — it receives payments)
5. Do the same for your WL test addresses (Step 5)

**How much do you need per wallet?**
| Wallet | Needs funds? | Why |
|--------|-------------|-----|
| Deployer | Yes | Gas for deploy + admin txs |
| Treasury | No | Receives payments, doesn't send |
| Server (if separate) | Yes | Gas for `mintTo()` calls |
| WL test address #1 | Yes | To test WL mint (5 pathUSD + gas) |
| WL test address #2 | Yes | To test public mint (8 pathUSD + gas) |
| Non-WL test address | Yes | To test public mint + WL rejection |

**Verify funding:**
1. Go to `https://explore.testnet.tempo.xyz`
2. Paste your wallet address
3. You should see pathUSD balance

> **Note:** On Tempo, gas fees are paid in pathUSD (not ETH). There's no native gas token. The faucet gives you pathUSD which covers both gas and minting costs.

---

## 5. Create Whitelist Test Addresses

**What it is:** A short list of wallet addresses that are "whitelisted" for the cheaper 5 pathUSD mint. We need real addresses to test the full WL flow.

**How many?** 2-3 addresses minimum for testing.

**Setup:**
1. Open MetaMask
2. Create 2-3 new accounts (or use existing ones)
3. Save each address

**Example whitelist (replace with your real addresses):**
```json
[
  "0xYOUR_FIRST_WL_ADDRESS",
  "0xYOUR_SECOND_WL_ADDRESS",
  "0xYOUR_THIRD_WL_ADDRESS"
]
```

**Testing plan:**
| Address | WL? | What we'll test |
|---------|-----|----------------|
| Address #1 | Yes | WL mint at 5 pathUSD — should succeed |
| Address #2 | Yes | WL mint — should succeed. Then try again — should fail ("already minted WL") |
| Address #3 | No (don't include in list) | WL mint — should fail ("not whitelisted"). Public mint at 8 pathUSD — should succeed |

**Save these addresses — you'll put them in `config/whitelist.json` when we start building.**

| # | Address | On WL? |
|---|---------|--------|
| 1 | `0x_________________` | Yes |
| 2 | `0x_________________` | Yes |
| 3 | `0x_________________` | No (test rejection) |

> **Important:** Fund the WL test addresses from the faucet (Step 4). They need pathUSD to pay for minting + gas.

---

## 6. Create Placeholder PNG Art Assets

**What they are:** Temporary images for each trait layer. They get stacked on top of each other to form the final NFT image. Real art will replace them later — zero code changes needed, just swap the files.

### Rules for all PNGs

| Rule | Value |
|------|-------|
| **Dimensions** | Exactly **1024 x 1024 pixels** |
| **Format** | PNG (with alpha/transparency channel) |
| **Color mode** | RGBA |
| **Background layer** | Opaque (no transparency — this is the bottom layer) |
| **All other layers** | Transparent background — only the trait element is visible |
| **"None" options** | Fully transparent 1024x1024 PNG (for optional traits like accessories) |

### What you need to create

**Layer 0 — Background** (3 files) — full 1024x1024 solid-color fills:
```
assets/layers/0-background/
├── bg_blue.png         ← solid blue (#3B82F6)
├── bg_red.png          ← solid red (#EF4444)
└── bg_green.png        ← solid green (#22C55E)
```

**Layer 1 — Body** (2 files) — simple shapes on transparent background:
```
assets/layers/1-body/
├── body_armor.png      ← e.g., a rectangle/shape representing an armored body
└── body_robe.png       ← e.g., a different shape for a robe
```

**Layer 2 — Head** (2 files) — on transparent background:
```
assets/layers/2-head/
├── head_helmet.png     ← e.g., a circle/shape at the top of the canvas
└── head_crown.png      ← e.g., a triangle/star shape
```

**Layer 3 — Eyes** (2 files) — on transparent background:
```
assets/layers/3-eyes/
├── eyes_laser.png      ← e.g., two small red dots/lines
└── eyes_normal.png     ← e.g., two small circles
```

**Layer 4 — Accessories** (3 files) — on transparent background:
```
assets/layers/4-accessories/
├── acc_wings.png       ← e.g., shapes on the sides
├── acc_shield.png      ← e.g., shape on one side
└── acc_none.png        ← FULLY TRANSPARENT (no visible pixels)
```

**Layer 5 — Color Overlay** (3 files) — semi-transparent color wash:
```
assets/layers/5-color/
├── color_gold.png      ← semi-transparent gold overlay (e.g., 20% opacity yellow fill)
├── color_silver.png    ← semi-transparent silver overlay
└── color_none.png      ← FULLY TRANSPARENT (no visible pixels)
```

### Total: 15 PNG files

```
backgrounds:    3 files (opaque)
bodies:         2 files (transparent bg)
heads:          2 files (transparent bg)
eyes:           2 files (transparent bg)
accessories:    3 files (2 visible + 1 fully transparent "none")
color overlays: 3 files (2 semi-transparent + 1 fully transparent "none")
─────────────────
Total:         15 files
```

### How to create them quickly

**Option A: Any image editor** (Photoshop, GIMP, Figma, Canva)
1. Create a 1024x1024 canvas
2. For backgrounds: fill with solid color, export as PNG
3. For other layers: draw a simple shape, keep background transparent, export as PNG
4. For "none" files: export an empty 1024x1024 transparent canvas

**Option B: Use an online tool**
- [Pixlr](https://pixlr.com/editor/) — free, browser-based, supports transparency
- Figma — create frames, export as PNG with transparent background

**Option C: Generate programmatically** (I can create a script that generates colored placeholder PNGs for you when we start Step 1 — just let me know)

### How they stack

The compositor loads layers in order (0 → 5) and composites them:

```
Layer 5: Color overlay  (semi-transparent gold wash)
Layer 4: Accessories     (wings on sides)
Layer 3: Eyes            (two laser dots)
Layer 2: Head            (helmet shape)
Layer 1: Body            (armor rectangle)
Layer 0: Background      (solid blue)
─────────────────────────────────────
Result:  Final composed 1024x1024 NFT image
```

### When you replace with real art

Later, when your designer delivers real art:
1. Replace the PNG files in `assets/layers/` with the real art
2. Keep the same filenames (or update `config/traits.json` to match new names)
3. That's it. No code changes. The preview endpoint and mint flow automatically use the new images.

If you add more trait options (e.g., 10 backgrounds instead of 3), just:
1. Add the new PNG files to the layer folder
2. Add the new options to `config/traits.json`
3. Done.

---

## 7. Check Node.js Version

**Required:** Node.js >= 20

```bash
node --version
# Should output v20.x.x or higher
```

**If you need to update:**
- Download from [nodejs.org](https://nodejs.org/) (LTS version)
- Or use nvm (Node Version Manager): `nvm install 20 && nvm use 20`

**Also check pnpm:**
```bash
pnpm --version
# If not installed:
npm install -g pnpm
```

---

## 8. Fill In the Env Var Checklist

Once you have all the wallets and addresses, fill in this table. These values go into `.env.local` when we start building.

| Env Variable | Your Value | Notes |
|-------------|-----------|-------|
| `SERVER_PRIVATE_KEY` | `0x___` | Deployer/server private key |
| `FEE_PAYER_KEY` | `0x___` | Same as SERVER_PRIVATE_KEY for testnet (or use sponsor URL) |
| `NFT_TREASURY_WALLET` | `0x___` | Address that receives mint payments |
| `IRYS_PRIVATE_KEY` | `0x___` | Key for Irys uploads (can be same as deployer for testnet) |

**These are pre-filled (don't change):**

| Env Variable | Value |
|-------------|-------|
| `NEXT_PUBLIC_TEMPO_CHAIN_ID` | `42431` |
| `NEXT_PUBLIC_TEMPO_RPC_URL` | `https://rpc.moderato.tempo.xyz` |
| `NEXT_PUBLIC_TEMPO_WS_URL` | `wss://rpc.moderato.tempo.xyz` |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://explore.testnet.tempo.xyz` |
| `NEXT_PUBLIC_PATHUSD_ADDRESS` | `0x20c0000000000000000000000000000000000000` |
| `IRYS_NODE` | `https://devnet.irys.xyz` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

**Filled after contract deploy (Step 2):**

| Env Variable | Value |
|-------------|-------|
| `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS` | Set after deploy |

---

## Ready Checklist

Before telling me to start, confirm:

- [ ] **Deployer wallet created** — have address + private key
- [ ] **Treasury address decided** — same wallet or separate
- [ ] **Wallets funded** — deployer + test addresses have testnet pathUSD from faucet
- [ ] **2-3 WL test addresses** — addresses noted + funded
- [ ] **1 non-WL test address** — to test public mint + WL rejection
- [ ] **15 placeholder PNGs created** — 1024x1024, correct transparency
  - OR tell me to generate them with a script (I can do this in Step 1)
- [ ] **Node.js >= 20 installed**
- [ ] **pnpm installed**
- [ ] **Private keys saved** for the env var table above

Once all boxes are checked, say **"start"** and I'll begin Step 1.
