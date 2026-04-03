# MPP — Machine Payments Protocol on Tempo

> Deep investigation compiled from mpp.dev, docs.tempo.xyz, and paymentauth.org  
> Date: June 2025

---

## 1. What Is MPP?

**Machine Payments Protocol (MPP)** is an HTTP-native payment protocol that enables machines, AI agents, and software to pay for services programmatically — without human intervention, API keys, or credit cards.

- **Co-designed by**: Tempo × Stripe
- **Core mechanism**: HTTP 402 (`Payment Required`) status code
- **Payment method agnostic**: Supports Tempo (stablecoin), Stripe (fiat), Lightning (Bitcoin), Solana, and Card
- **IETF standardization**: Active drafts at [paymentauth.org](https://paymentauth.org)
  - `draft-httpauth-payment-00` — Core HTTP authentication scheme
  - `draft-payment-transport-mcp-00` — MCP transport binding
  - `draft-payment-intent-charge-00` — Charge intent
  - `draft-tempo-session-00` — Session intent

---

## 2. Protocol Flow (Challenge → Credential → Receipt)

```
Client                    Server                 Payment Network
  |                         |                         |
  |-- GET /resource ------->|                         |
  |<-- 402 + Challenge -----|                         |
  |    (WWW-Authenticate:   |                         |
  |     Payment)            |                         |
  |                         |                         |
  |-- Fulfill payment ------|------------------------>|
  |                         |                         |
  |-- GET /resource ------->|                         |
  |   (Authorization:       |                         |
  |    Payment <credential>)|                         |
  |                         |-- Settle payment ------>|
  |                         |<-- Confirmed -----------|
  |<-- 200 OK + Receipt ----|                         |
  |    (Payment-Receipt)    |                         |
```

### HTTP Headers

| Step | Header | Value |
|------|--------|-------|
| Challenge (402) | `WWW-Authenticate` | `Payment intent="charge", amount="0.10", currency="0x20c0…", recipient="0x…", chainId=42069` |
| Credential (retry) | `Authorization` | `Payment credential="<proof>"` |
| Receipt (200) | `Payment-Receipt` | `reference="<txHash>", status="success", method="tempo"` |

### Key Properties
- **TLS required** — all payment headers must travel over HTTPS
- **Single-use proofs** — credentials cannot be replayed
- **Digest binding** — POST bodies are bound to the credential via HTTP Digest
- **No caching** — 402 responses must not be cached

---

## 3. Payment Intents

### 3a. Charge (One-Time Payment)

| Property | Value |
|----------|-------|
| Pattern | One payment per request |
| Latency overhead | ~500ms (on-chain confirmation) |
| On-chain cost | ~$0.001 per request |
| Settlement | Immediate on-chain transaction |
| Best for | Single API calls, content access, MCP tool invocations, downloads |

**Request schema:**
```
amount      string  Required  Payment amount in base units
currency    string  Required  Token address or currency code
description string  Optional  Human-readable description
expires     string  Optional  ISO 8601 expiry timestamp
externalId  string  Optional  Server-defined idempotency key
recipient   string  Optional  Recipient address
```

**Server code (Next.js):**
```typescript
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [tempo({
    recipient: '0xYourAddress',
  })],
})

export async function GET(request: Request) {
  const result = await mppx.charge({ amount: '0.10' })(request)
  if (result.status === 402) return result.challenge
  return result.withReceipt(Response.json({ data: 'paid content' }))
}
```

### 3b. Session (Pay-As-You-Go)

| Property | Value |
|----------|-------|
| Pattern | Continuous pay-as-you-go over payment channel |
| Latency overhead | **Near-zero** (off-chain vouchers) |
| Throughput | Hundreds of vouchers/second/channel |
| On-chain cost | ~$0.001 **total** (amortized across all requests) |
| Settlement | Off-chain EIP-712 vouchers, periodic on-chain batch settlement |
| Best for | LLM APIs, metered services, usage-based billing, streaming |

**Session lifecycle:**

```
Phase 1 — OPEN
  Client deposits tokens into on-chain escrow → channel created (unique channelId)

Phase 2 — SESSION
  Client signs EIP-712 vouchers with increasing cumulative amounts
  "I have now consumed up to X total"
  Server verifies via ecrecover (~microseconds, no RPC calls)
  
Phase 3 — TOP UP
  If channel runs low, client deposits more tokens without closing
  
Phase 4 — CLOSE
  Either party calls close() on escrow with highest voucher
  On-chain settlement → refund unused deposit to client
```

**Why sessions are fast:**
- Voucher verification = single `ecrecover` call
- No RPC calls, no database lookups in the hot path
- Server batches hundreds/thousands of vouchers into 1 on-chain settlement tx

**Server code:**
```typescript
import { Mppx, Store, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [
    tempo({
      recipient: '0xYourAddress',
      store: Store.memory(),
    }),
  ],
})

export async function handler(request: Request) {
  const result = await mppx.session({
    amount: '25',
    unitType: 'llm_token',
  })(request)
  if (result.status === 402) return result.challenge
  return result.withReceipt(Response.json({ data: '...' }))
}
```

### 3c. Streamed Payments (SSE)

For Server-Sent Events (like LLM token streaming):
- `stream.charge()` is called per token/word/chunk
- If the channel runs low mid-stream, a `payment-need-voucher` event fires
- Client auto-signs a new voucher and streaming continues
- At ~$0.001/word, a 1 pathUSD deposit covers ~1,000 words

---

## 4. Escrow Contracts

The `TempoStreamChannel` escrow contract handles on-chain deposits, settlement, and channel close.

| Network | Chain ID | Contract Address |
|---------|----------|------------------|
| **Mainnet** | 42069 | `0x33b901018174DDabE4841042ab76ba85D4e24f25` |
| **Testnet (Moderato)** | 42431 | `0xe1c4d3dce17bc111181ddf716f75bae49e61a336` |

Reference implementation: [github.com/tempoxyz/tempo/blob/main/tips/ref-impls/src/TempoStreamChannel.sol](https://github.com/tempoxyz/tempo/blob/main/tips/ref-impls/src/TempoStreamChannel.sol)

---

## 5. Why Tempo for Payments

| Feature | Benefit |
|---------|---------|
| **~500ms finality** | Deterministic confirmation, no probabilistic waiting |
| **Sub-cent fees** | Transaction costs low enough for micropayments |
| **Fee sponsorship** | Server pays gas on behalf of client — client needs no gas tokens |
| **2D nonces** | Parallel nonce lanes — payment txs don't block other account activity |
| **Payment lane** | Dedicated tx ordering for channel ops |
| **High throughput** | Handles settlement volume at scale without congestion |
| **TIP-20 (enshrined tokens)** | Precompile-based, not smart contracts — cheaper & more predictable than ERC-20 |

### pathUSD
- Address: `0x20c0000000000000000000000000000000000000`
- Tempo's native stablecoin used for all MPP payments
- TIP-20 precompile (not an ERC-20 smart contract)

---

## 6. SDKs & Tools

### TypeScript (mppx) — Primary SDK
```bash
npm install mppx viem
```

**Client setup:**
```typescript
import { Mppx, tempo } from 'mppx'

const mppx = Mppx.create({
  methods: [tempo({ account })],
})

// Polyfills global fetch — all subsequent fetches auto-handle 402
const response = await mppx.fetch('https://api.example.com/data')
```

**Server middleware** — works with Next.js, Hono, Express:
```typescript
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [tempo({
    recipient: '0xYourAddress',
  })],
})
```

**Fee sponsorship (server pays gas):**
```typescript
import { privateKeyToAccount } from 'viem/accounts'

const mppx = Mppx.create({
  methods: [tempo({
    feePayer: privateKeyToAccount('0x…'),
    // OR point to a fee service:
    // feePayer: 'https://sponsor.example.com',
  })],
})
```

### Python (pympp)
```bash
pip install pympp
```

### Rust (mpp-rs)
```bash
cargo add mpp-rs
```

### Tempo CLI (for AI agents)
```bash
curl -fsSL https://tempo.xyz/install | bash

tempo wallet login
tempo wallet services --search ai
tempo request --dry-run https://api.example.com/data
tempo request https://api.example.com/data
```

### Agent SKILL.md
AI agents can consume the MPP skill file at:  
`https://tempo.xyz/SKILL.md`

---

## 7. Client Integration Patterns

### Wagmi (React)
```typescript
import { useAccount, useWalletClient } from 'wagmi'
import { Mppx, tempo } from 'mppx'
import { custom } from 'viem'

const { data: walletClient } = useWalletClient()
const mppx = Mppx.create({
  methods: [tempo({
    account: walletClient.account,
    transport: custom(walletClient.transport),
  })],
})
```

### Per-Request Account
```typescript
const mppx = Mppx.create({
  methods: [tempo({ account: accountA })],
})

// Override account for specific request
const response = await mppx.fetch(url, {
  payment: { account: accountB },
})
```

### Manual Flow (no polyfill)
```typescript
const mppx = Mppx.create({ methods: [tempo({ account })] })

// Step 1: Make request, get 402
const res = await fetch(url)

// Step 2: Parse challenge
const challenge = mppx.parseChallenge(res)

// Step 3: Fulfill payment
const credential = await mppx.fulfill(challenge)

// Step 4: Retry with credential
const paid = await fetch(url, {
  headers: { Authorization: `Payment ${credential}` },
})
```

---

## 8. Server Integration Patterns

### Next.js App Router
```typescript
// app/api/paid-endpoint/route.ts
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [tempo({ recipient: process.env.WALLET_ADDRESS! })],
})

export async function GET(request: Request) {
  const result = await mppx.charge({ amount: '0.05' })(request)
  if (result.status === 402) return result.challenge
  return result.withReceipt(
    Response.json({ answer: 42 })
  )
}
```

### Session with Storage
```typescript
import { Mppx, Store, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [
    tempo({
      recipient: process.env.WALLET_ADDRESS!,
      store: Store.memory(), // or Store.redis(), Store.postgres(), etc.
    }),
  ],
})
```

### Push vs Pull Modes
- **Push mode**: Client includes payment proof in the initial request
- **Pull mode**: Server returns 402 challenge, client pays, then retries

---

## 9. MCP (Model Context Protocol) Integration

MPP has a dedicated IETF draft for MCP transport binding:  
`draft-payment-transport-mcp-00`

This enables:
- **Paid MCP tools** — each tool invocation can require payment via charge intent
- **Metered MCP sessions** — session intent for high-frequency tool usage
- AI agents discover paid tools and autonomously pay for them

### Agent Workflow
1. Agent discovers MCP server with paid tools
2. Agent calls tool → receives 402 challenge
3. Agent's MPP client auto-fulfills payment (charge or session)
4. Tool executes and returns result + payment receipt
5. Agent continues workflow with tool output

---

## 10. Live Ecosystem (80+ Services)

### AI / LLM
| Service | Endpoint |
|---------|----------|
| OpenAI | `openai.mpp.tempo.xyz` |
| Anthropic | `anthropic.mpp.tempo.xyz` |
| Google Gemini | `gemini.mpp.tempo.xyz` |
| DeepSeek | `deepseek.mpp.paywithlocus.com` |
| Mistral | `mistral.mpp.paywithlocus.com` |
| Groq | `groq.mpp.paywithlocus.com` |
| Grok (xAI) | `grok.mpp.paywithlocus.com` |
| OpenRouter | `openrouter.mpp.tempo.xyz` |
| Perplexity | `perplexity.mpp.paywithlocus.com` |
| fal.ai | `fal.mpp.tempo.xyz` |

### Blockchain / Data
| Service | Endpoint |
|---------|----------|
| Alchemy | `mpp.alchemy.com` |
| Codex | `graph.codex.io` |
| Dune | `api.dune.com` |
| CoinGecko | `coingecko.mpp.paywithlocus.com` |
| Allium | `agents.allium.so` |

### Web / Search
| Service | Endpoint |
|---------|----------|
| Parallel Search | `parallelmpp.dev` |
| Exa | `exa.mpp.tempo.xyz` |
| Brave Search | `brave.mpp.paywithlocus.com` |
| Firecrawl | `firecrawl.mpp.tempo.xyz` |
| Browserbase | `mpp.browserbase.com` |

### Compute / Storage
| Service | Endpoint |
|---------|----------|
| Modal (GPU) | `modal.mpp.tempo.xyz` |
| Object Storage | `storage.mpp.tempo.xyz` |
| Code Storage (Git) | `codestorage.mpp.tempo.xyz` |
| Judge0 (code exec) | `judge0.mpp.paywithlocus.com` |

### Other Notable
| Service | Endpoint |
|---------|----------|
| Stripe Climate | `climate.stripe.dev` |
| AgentMail | `mpp.api.agentmail.to` |
| PostalForm (mail letters) | `postalform.com` |
| Prospect Butcher (order food) | `agents.prospectbutcher.shop` |
| Google Maps | `googlemaps.mpp.tempo.xyz` |
| Deepgram (speech) | `deepgram.mpp.paywithlocus.com` |
| 2Captcha | `twocaptcha.mpp.tempo.xyz` |

Service discovery: [mpp.dev/services](https://mpp.dev/services)  
Agent-readable: [mpp.dev/services/llms.txt](https://mpp.dev/services/llms.txt)

---

## 11. Session Receipts vs Charge Receipts

| Field | Charge Receipt | Session Receipt |
|-------|---------------|-----------------|
| `reference` | Transaction hash | Channel ID (bytes32) |
| `status` | `"success"` | `"success"` |
| `method` | `"tempo"` | `"tempo"` |

To get the settlement tx hash for a session, call `session.close()` and read `txHash` from the returned receipt.

---

## 12. Security Model

| Concern | Mitigation |
|---------|------------|
| Replay attacks | Single-use credentials, nonce binding |
| Man-in-the-middle | TLS required for all payment headers |
| Body tampering | HTTP Digest binding for POST requests |
| Credential reuse | Server-side idempotency via `externalId` |
| Channel draining | Escrow contract holds funds; only highest voucher settles |
| Response caching | 402 responses must not be cached |

---

## 13. Cost Economics

### One-Time Payments (Charge)
- Gas cost: ~$0.001 per transaction
- Tempo finality: ~500ms
- Each request = 1 on-chain tx

### Sessions (Pay-As-You-Go)
- Channel open: ~$0.001 (one-time)
- Per-voucher cost: **$0** (off-chain signature, CPU only)
- Periodic settlement: ~$0.001 (batched)
- Channel close: ~$0.001
- **Total for 10,000 requests**: ~$0.003 vs $10 for charge

### Streaming
- Per-token billing at ~$0.001/word
- 1 pathUSD deposit ≈ 1,000 words
- Mid-stream top-up via `payment-need-voucher` event

---

## 14. Comparison: MPP vs Traditional Payment Models

| Aspect | API Keys / Credits | Stripe Subscriptions | MPP |
|--------|-------------------|---------------------|-----|
| Setup | Manual signup, billing | Checkout flow | Zero — automatic 402 handling |
| Auth | API key in header | Session cookie | Payment credential per request |
| Billing granularity | Monthly/credit-based | Monthly subscription | Per-request or per-token |
| Agent-compatible | Needs key management | No | Yes — native HTTP flow |
| Overpayment risk | Credit expiry | Unused subscription | Pay exact amount consumed |
| Settlement | 30-60 day net terms | Monthly charge | Instant (charge) or batched (session) |

---

## 15. Key Takeaways for UTXO / Agent Integration

1. **Any Next.js API route can become MPP-enabled** — add `mppx/server` middleware, wrap handler with `mppx.charge()` or `mppx.session()`.

2. **AI agents pay autonomously** — no API keys needed. Agent's wallet + `mppx` client auto-handles 402 flows.

3. **Session intent is ideal for our use case** — if building an agent that queries LLMs or blockchain data, sessions amortize cost to near-zero per request.

4. **Fee sponsorship eliminates UX friction** — server can pay all gas costs so the agent/client never needs gas tokens.

5. **80+ services already live** — OpenAI, Anthropic, Alchemy, Firecrawl, etc. are all available via MPP endpoints today.

6. **MCP + MPP = paid AI tools** — the IETF draft `draft-payment-transport-mcp-00` standardizes how MCP tools can require payment. Our agent could both consume and provide paid MCP tools.

7. **Escrow contracts are deployed** — Mainnet (`0x33b901…`) and Testnet Moderato (`0xe1c4d3…`) are ready for session-based payments.

8. **pathUSD is the currency** — `0x20c0000000000000000000000000000000000000`, Tempo's enshrined stablecoin.

---

## Appendix: Quick Reference

```
Install:        npm install mppx viem
Client import:  import { Mppx, tempo } from 'mppx'
Server import:  import { Mppx, tempo } from 'mppx/server'
CLI install:    curl -fsSL https://tempo.xyz/install | bash
Agent skill:    https://tempo.xyz/SKILL.md
Service list:   https://mpp.dev/services
Protocol spec:  https://mpp.dev/protocol
IETF drafts:    https://paymentauth.org
Escrow mainnet: 0x33b901018174DDabE4841042ab76ba85D4e24f25
Escrow testnet: 0xe1c4d3dce17bc111181ddf716f75bae49e61a336
pathUSD:        0x20c0000000000000000000000000000000000000
```
