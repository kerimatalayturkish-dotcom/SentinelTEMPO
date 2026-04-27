---
name: sentinel-tempo
description: >
  Mint custom SentinelTEMPO NFTs on the Tempo blockchain. Browse 7 trait layers,
  preview compositions, and mint with automatic payment via MPP (Machine
  Payments Protocol). 6-phase on-chain timeline: WL → Agent Public → Human Public.
  10,000-token mainnet collection.
---

# SentinelTEMPO — NFT Minting Service

A 10,000-token generative NFT collection on the **Tempo mainnet** (chainId
4217). Six on-chain phases gate who can mint when. AI agents can browse traits,
preview compositions, and mint NFTs by paying pathUSD via the MPP HTTP 402
flow. Seven trait layers per NFT, every combination unique.

---

## Network & Contract

| Field | Value |
|---|---|
| Blockchain | **Tempo mainnet** (EVM-compatible L1) |
| Chain ID | **4217** |
| RPC URL | `https://rpc.tempo.xyz` |
| Block Explorer | `https://explore.tempo.xyz` |
| NFT Contract | `0x8dbcd5627cDaAF11911f5E9F26eDB4eAea3F8b70` |
| Currency | pathUSD (TIP-20, 6 decimals) |
| pathUSD Address | `0x20c0000000000000000000000000000000000000` |

Contract is verified on Sourcify:
`https://repo.sourcify.dev/contracts/full_match/4217/0x8dbcd5627cDaAF11911f5E9F26eDB4eAea3F8b70/`

---

## Supply & Pricing

| | WL Mint (Human) | WL Mint (Agent) | Agent Public | Human Public |
|---|---|---|---|---|
| Price | 2.00 pathUSD | 2.00 pathUSD | 3.00 pathUSD | 4.00 pathUSD |
| Cap (cumulative) | 2,000 | 2,000 | 3,000 | 10,000 total |
| Per-wallet limit | 1 | 1 | 5 | 5 |
| **Total Supply** | **10,000** | | | |

- **Human WL** pays 2.00 pathUSD directly to the contract (`mintWhitelist`).
- **Human Public** pays 4.00 pathUSD directly to the contract (`mintPublic`).
- **Agents** pay via MPP HTTP 402 to the project treasury (NOT to the contract). The contract does not pull pathUSD on agent mints — payment is settled upstream.
  - In the WL phase, agents pay **2.00 pathUSD**.
  - In the Agent Public phase, agents pay **3.00 pathUSD**.

---

## 6-Phase On-Chain Timeline

The contract uses a fully on-chain phase system. Phases advance automatically based on time and supply, with no manual owner action required.

```
CLOSED → WHITELIST (3h) → WL_AGENT_INTERVAL (30min) → AGENT_PUBLIC (3h) → AGENT_HUMAN_INTERVAL (30min) → HUMAN_PUBLIC (open-ended)
```

| Phase | Who can mint | Duration | Notes |
|---|---|---|---|
| `closed` | Nobody | Until owner calls `startMint()` | Pre-launch |
| `whitelist` | WL addresses (human + agent) | 3 hours OR until WL cap (2,000) reached | 1 mint per wallet |
| `wl_agent_interval` | Nobody (cooldown) | 30 minutes | — |
| `agent_public` | AI agents only | 3 hours OR until agent cap (3,000) reached | Up to 5 per wallet |
| `agent_human_interval` | Nobody (cooldown) | 30 minutes | — |
| `human_public` | Humans only (wallet) | Until sold out | Up to 5 per wallet |

**AI agents can mint during:** `whitelist` (if recipient is whitelisted) and `agent_public` phases.

---

## Base URL

```
BASE_URL = https://sentineltempo.onrender.com
```

All API endpoints are prefixed with `/api/nft/`.

---

## What is MPP (Machine Payments Protocol)?

MPP lets AI agents pay for API calls automatically. Flow:

1. **Agent sends a normal request** to a paid endpoint (e.g. `POST /api/nft/mint`).
2. **Server returns HTTP 402** with a `WWW-Authenticate` header containing a payment challenge.
3. **Agent signs a payment transaction** using its private key (pathUSD transfer on Tempo mainnet).
4. **Agent re-sends the request** with an `Authorization` header containing the payment credential.
5. **Server verifies payment** and processes the request.

The `mppx` CLI automates steps 2–5. You just call `npx mppx` instead of `curl` and it handles the 402 flow transparently.

---

## Agent Wallet Setup

Each AI agent must use **its own wallet** to pay mint fees. Do NOT reuse another agent's key.

**Setup:**
1. Generate a new EVM wallet (Tempo is fully EVM-compatible).
2. Set your private key as an environment variable:
   - **Linux/macOS:** `export MPPX_PRIVATE_KEY=0xYOUR_KEY`
   - **Windows (cmd):** `set MPPX_PRIVATE_KEY=0xYOUR_KEY`
   - **Windows (PowerShell):** `$env:MPPX_PRIVATE_KEY="0xYOUR_KEY"`
3. Fund your wallet with pathUSD on **Tempo mainnet** (≥ 3.10 pathUSD recommended to cover one Agent-Public mint plus gas / buffer).
4. If your wallet has 0 pathUSD balance, ask the user to send pathUSD to your wallet address.

> **SECURITY:** Never hardcode your private key in files. Always use the `MPPX_PRIVATE_KEY` environment variable.

---

## How to Call the API

### Free endpoints — use curl:

```bash
curl -s https://sentineltempo.onrender.com/api/nft/status
```

### Paid endpoints (mint) — use npx mppx:

**Recommended cross-platform approach: file-based JSON** — avoids shell quoting issues on every OS.

**Step 1 — Write JSON body to a file:**

Linux/macOS:
```bash
cat > mint-body.json << 'EOF'
{"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"},"recipient":"0xRECIPIENT"}
EOF
```

Windows (PowerShell):
```powershell
'{"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"},"recipient":"0xRECIPIENT"}' | Out-File -Encoding utf8 mint-body.json
```

Windows (cmd):
```cmd
echo {"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"},"recipient":"0xRECIPIENT"} > mint-body.json
```

**Step 2 — Call mppx (same on all platforms):**
```bash
npx mppx -s -r https://rpc.tempo.xyz -X POST -H "Content-Type: application/json" -d @mint-body.json https://sentineltempo.onrender.com/api/nft/mint
```

> **IMPORTANT:** `npx mppx` handles the HTTP 402 payment challenge automatically. Never use plain `curl` for the mint endpoint — it will just return a 402 error.
>
> **CRITICAL:** Always include `-r https://rpc.tempo.xyz` so mppx uses the correct Tempo mainnet RPC. Without it, mppx may default to a different RPC and report 0 balance even if the wallet is funded.
>
> **SETUP:** You must have `MPPX_PRIVATE_KEY` set in your environment before calling mppx. See "Agent Wallet Setup" above.
>
> **SHELL QUOTING WARNING:** Do NOT use `-J` with inline JSON on Windows — the shell strips quotes. On Linux/macOS you can use inline JSON with single quotes (`-d '{"key":"value"}'`), but the file approach works everywhere.

---

## Endpoints

### 1. GET /api/nft/traits — List Available Traits (free)

Returns all 7 trait layers and their options.

```bash
curl -s https://sentineltempo.onrender.com/api/nft/traits
```

**Quick reference — all trait IDs (7 layers, 130 total options):**

| Layer | Required | Options |
|---|---|---|
| `background` | yes | `assembly_line`, `circuit_sky`, `code_waterfall`, `cyber_graveyard`, `data_stream`, `digital_forest`, `glitch_dimension`, `neon_alleyway`, `server_room`, `space_station`, `system_error`, `the_construct`, `the_core`, `the_grid`, `underground_bunker`, `0d190b`, `123d08`, `313540`, `421d03` |
| `back` | no | `battery_pack`, `cape_of_wires`, `cooling_radiator`, `cyber_katana`, `gravity_orb`, `hack_pack`, `jetpack`, `matrix_jack`, `oxygen_tanks`, `plasma_rifle`, `satellite_probe`, `shield_generator`, `solar_wings`, `spider_arms`, `spy_camera` |
| `body` | yes | `battle_damaged`, `carbon_fiber`, `chrome_plated`, `circuit_board`, `deep_sea`, `industrial_hazard`, `led_grid`, `matrix_rain`, `nano_suit`, `og_moltbook_blue`, `og_moltbook_grey`, `og_moltbook_red`, `og_moltbook_white`, `og_moltbook_yellow`, `og_mpp_blue`, `og_mpp_grey`, `og_mpp_red`, `og_mpp_white`, `og_mpp_yellow`, `og_tempo_blue`, `og_tempo_grey`, `og_tempo_red`, `og_tempo_white`, `og_tempo_yellow`, `og_with_lights`, `prototype`, `royal_gold`, `rusty_scraps`, `space_explorer`, `stealth_camo`, `void_armor` |
| `mouth` | no | `binary_stitches`, `bio_mechanical`, `data_port`, `energy_core_vent`, `exhaust_pipe`, `exposed_hydraulics`, `hazard_tape`, `heatsink_grille`, `liquid_metal`, `og`, `respirator`, `sealed_plate`, `serial_number`, `speaker_mesh`, `ventilation_fan`, `voice_waveform` |
| `eyes` | no | `binary_stream`, `cyclops_beam`, `dead_pixel`, `diamond_core`, `glitch_blink`, `heartbeat_monitor`, `heatmap`, `hexgrid_honeycomb`, `hollow_sockets`, `loading_ring`, `neural_link`, `og`, `radar_sweep`, `targeting_reticle`, `tempo`, `triple_threat`, `x_ray` |
| `eyewear` | no | `ar_glasses_moltbook`, `ar_glasses_mpp`, `ar_glasses`, `blindfold_overlay`, `carbon_fiber_band`, `data_visor`, `energy_crown`, `holographic_hud`, `magnifying_lens`, `night_vision`, `scanning_laser`, `scouter`, `shattered_shield`, `solar_shield`, `tactical_monocle`, `vr_goggles`, `welding_mask` |
| `head_items` | no | `armor_plating`, `brain_case`, `cooling_tubes`, `horn_vents`, `micro_drone_dock`, `mohawk_cables`, `neuro_link_cable`, `radar_fin`, `satellite_dish`, `security_camera`, `signal_jammer`, `tesla_coil`, `twin_antennas`, `warning_strobe`, `wi_fi_halo` |

**Only `background` and `body` are required.** All other layers are optional — omit them from the traits object to skip.

---

### 2. GET /api/nft/status — Collection Status (free)

Returns current supply, mint phase, pricing, and limits. All values come from the on-chain contract.

```bash
curl -s https://sentineltempo.onrender.com/api/nft/status
```

**Response shape:**
```json
{
  "totalSupply": 0,
  "maxSupply": 10000,
  "remaining": 10000,
  "phase": "whitelist",
  "phaseEndsAt": 1745100000,
  "phaseRemaining": 2000,
  "wlSupply": 0,
  "agentSupply": 0,
  "humanSupply": 0,
  "paused": false,
  "prices": {
    "whitelist": "2",
    "agent_public": "3",
    "human_public": "4",
    "currency": "pathUSD"
  },
  "limits": {
    "wl_per_wallet": 1,
    "public_per_wallet": 5,
    "wl_cap": 2000,
    "agent_cap": 3000
  }
}
```

Phase values: `"closed"`, `"whitelist"`, `"wl_agent_interval"`, `"agent_public"`, `"agent_human_interval"`, `"human_public"`.

---

### 3. GET /api/nft/wl/check — Whitelist Check (free)

Check if an address is whitelisted.

```bash
curl -s "https://sentineltempo.onrender.com/api/nft/wl/check?address=0xRECIPIENT"
```

**Response:**
```json
{ "address": "0xRECIPIENT", "whitelisted": true }
```

---

### 4. GET /api/nft/wl/proof — Merkle Proof (free)

Get the Merkle proof for a whitelisted address (used internally by the server during WL agent mint).

```bash
curl -s "https://sentineltempo.onrender.com/api/nft/wl/proof?address=0xRECIPIENT"
```

**Response:**
```json
{ "address": "0xRECIPIENT", "proof": ["0xabc...", "0xdef..."] }
```

Returns 404 if the address is not on the whitelist.

---

### 5. POST /api/nft/check-unique — Uniqueness Check (free)

Check if a trait combination has already been minted. Recommended before calling `/mint` to avoid 409 errors.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"traits":{"background":"circuit_sky","body":"og_tempo_blue"}}' \
  https://sentineltempo.onrender.com/api/nft/check-unique
```

**Response:**
```json
{ "unique": true, "number": 42, "name": "SentinelTEMPO #0042", "traitHash": "0xabc..." }
```

If `unique: false`, change one or more traits and retry.

---

### 6. POST /api/nft/preview — Preview Composition (free)

Compose and return a PNG preview image without minting.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"}}' \
  https://sentineltempo.onrender.com/api/nft/preview --output preview.png
```

**Request body:**
```json
{
  "traits": {
    "background": "circuit_sky",
    "back": "jetpack",
    "body": "og_tempo_blue",
    "mouth": "og",
    "eyes": "tempo",
    "eyewear": "ar_glasses",
    "head_items": "twin_antennas"
  }
}
```

Only `background` and `body` are required. All other layers are optional — omit to skip.

**Response:** PNG image binary (Content-Type: image/png).

---

### 7. POST /api/nft/mint — Mint an NFT (PAID)

This is the paid endpoint. Cost depends on phase:
- **Whitelist phase:** 2.00 pathUSD (recipient must be whitelisted)
- **Agent Public phase:** 3.00 pathUSD (any recipient)

**You must use `npx mppx` to call this endpoint** — it handles the HTTP 402 payment flow automatically.

**Request body:**
```json
{
  "traits": {
    "background": "circuit_sky",
    "back": "jetpack",
    "body": "og_tempo_blue",
    "mouth": "og",
    "eyes": "tempo",
    "eyewear": "ar_glasses",
    "head_items": "twin_antennas"
  },
  "recipient": "0xRECIPIENT_WALLET_ADDRESS"
}
```

- `traits` — object with trait selections (2 required: `background` + `body`, 5 optional: `back`, `mouth`, `eyes`, `eyewear`, `head_items`)
- `recipient` — the wallet address that will own the minted NFT (must be a valid 0x address)
- Trait combination must be unique (not previously minted)

**Full mint command (Windows) — use file-based JSON:**

Step 1 — Write body to file:
```cmd
echo {"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"},"recipient":"0xRECIPIENT"} > mint-body.json
```

Step 2 — Mint:
```bash
npx mppx -s -r https://rpc.tempo.xyz -X POST -H "Content-Type: application/json" -d @mint-body.json https://sentineltempo.onrender.com/api/nft/mint
```

> **DO NOT use `-J` with inline JSON on Windows.** The shell strips quotes and the server receives invalid JSON. Always use `-d @file.json`.

**Success response:**
```json
{
  "tokenId": "0042",
  "tokenURI": "https://gateway.irys.xyz/...",
  "imageUrl": "https://gateway.irys.xyz/...",
  "txHash": "0xabc123...",
  "blockNumber": 12345,
  "recipient": "0x...",
  "traits": { "background": "circuit_sky", "body": "og_tempo_blue", "eyes": "tempo" }
}
```

**What happens on the server during mint:**
1. Reads `currentPhase()` from the contract — only allows WHITELIST and AGENT_PUBLIC.
2. Validates traits and recipient address.
3. Looks up Merkle proof if WL phase (rejects non-WL recipients with 403).
4. Checks trait combination uniqueness (rejects duplicates with 409).
5. Verifies on-chain caps (`totalSupply`, per-wallet limits).
6. Issues HTTP 402 payment challenge via MPP. Agent pays pathUSD to treasury.
7. After payment settles: composes the NFT image (7 trait layers, PNG stacking).
8. Uploads the image to Irys (decentralized permanent storage on Arweave).
9. Builds ERC-721 metadata JSON and uploads it to Irys.
10. Calls `mintForAgent(recipient, proof, tokenURI)` on the smart contract via the authorized server wallet.
11. Waits for on-chain confirmation, registers the trait hash, returns token info.

---

## Step-by-Step Mint Guide for Agents

### When a user asks to mint an NFT:

**Step 1 — Check status:**
```bash
curl -s https://sentineltempo.onrender.com/api/nft/status
```
Check the `phase` field:
- If `"whitelist"` → agent can mint **for whitelisted recipients only** (2.00 pathUSD).
- If `"agent_public"` → agent can mint for any recipient (3.00 pathUSD).
- If `"closed"`, `"wl_agent_interval"`, `"agent_human_interval"`, or `"human_public"` → agent **cannot** mint right now. Tell the user which phase it is and when agent minting will be available again.

Also check `remaining > 0` and `phaseRemaining > 0`.

**Step 2 — Check whitelist (if WL phase):**
If the phase is `"whitelist"`, check if the recipient is whitelisted:
```bash
curl -s "https://sentineltempo.onrender.com/api/nft/wl/check?address=0xRECIPIENT"
```
If not whitelisted, the mint will be rejected with 403. Wait for the `agent_public` phase or use a whitelisted recipient.

**Step 3 — Show traits:**
```bash
curl -s https://sentineltempo.onrender.com/api/nft/traits
```
Present the options to the user. Let them pick, or pick randomly if they say "surprise me" or "random".

**Step 4 — Ask for recipient:**
The user must provide a wallet address (0x...) to receive the NFT. If they don't provide one, ask them.

**Step 5 — Check uniqueness (recommended):**
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"traits":{"background":"circuit_sky","body":"og_tempo_blue"}}' \
  https://sentineltempo.onrender.com/api/nft/check-unique
```
If `unique: false`, change one or more traits and retry.

**Step 6 — Mint:**

Write body to file:
```cmd
echo {"traits":{"background":"circuit_sky","body":"og_tempo_blue","eyes":"tempo"},"recipient":"0xUSER_ADDRESS"} > mint-body.json
```

Then mint:
```bash
npx mppx -s -r https://rpc.tempo.xyz -X POST -H "Content-Type: application/json" -d @mint-body.json https://sentineltempo.onrender.com/api/nft/mint
```

**Step 7 — Report result:**
Share the `tokenId`, `imageUrl`, and `txHash` with the user. The TX can be inspected on the explorer:
`https://explore.tempo.xyz/tx/<txHash>`

---

## Error Handling

| HTTP Code | Meaning | What to Do |
|---|---|---|
| 402 | Payment Required | You called `/mint` with curl instead of mppx. Use `npx mppx` |
| 403 `"Agent minting is not active"` | Wrong phase | Check `/api/nft/status` — agent can only mint during `whitelist` and `agent_public` phases |
| 403 `"Recipient not whitelisted"` | Non-WL address in WL phase | Wait for `agent_public` phase, or use a whitelisted recipient |
| 400 `"Invalid traits"` | Bad trait IDs | Check `/api/nft/traits` for valid options |
| 400 `"Invalid recipient"` | Bad wallet address | Must be `0x` + 40 hex characters |
| 400 `"Missing traits object"` | Empty or missing traits | Include the traits object in the body |
| 409 `"trait combination already minted"` | Duplicate combo | Change one or more traits and retry |
| 409 `"sold out"` / `"per-wallet cap reached"` | Supply or wallet limit hit | Use a different recipient, or wait for next phase |
| 404 `"Address not whitelisted"` | Proof requested for non-WL address | Only WL addresses have proofs |
| 500 | Server error | Check `/api/nft/status` and retry; if persistent, alert the user |

---

## User Intent → Action Mapping

| User says | What to do |
|---|---|
| "mint me an NFT" / "mint one" | Run the full mint workflow (Steps 1–7 above) |
| "what traits are available" | Call `GET /api/nft/traits` |
| "how many are minted" / "supply" | Call `GET /api/nft/status` |
| "am I whitelisted" | Call `GET /api/nft/wl/check?address=...` |
| "preview" / "show me" | Call `POST /api/nft/preview` and save the PNG |
| "random mint" / "surprise me" | Pick random traits from each layer (always include `background` + `body`), check uniqueness, then mint |
| "check balance" | Check your agent wallet's pathUSD balance on Tempo mainnet via RPC `https://rpc.tempo.xyz` (use the address derived from your `MPPX_PRIVATE_KEY`) |
| "what phase is it" | Call `GET /api/nft/status` — check the `phase` field |
| "when does this phase end" | Call `GET /api/nft/status` — check `phaseEndsAt` (unix timestamp) |

---

## Response Formatting

When presenting results to the user, format them nicely:

**Mint success:**
```
✅ NFT Minted!

🆔 Token: SentinelTEMPO #0042
🎨 Traits: Circuit Sky bg, Jetpack, OG Tempo Blue body, Tempo eyes
👛 Owner: 0x6Ee0...c55
🖼️ Image: https://gateway.irys.xyz/...
🔗 TX: https://explore.tempo.xyz/tx/0xabc...
```

**Status:**
```
📊 SentinelTEMPO Collection
Minted: 42 / 10,000
Phase: agent_public
Price (this phase, agent): 3.00 pathUSD
Phase ends: <countdown>
```
