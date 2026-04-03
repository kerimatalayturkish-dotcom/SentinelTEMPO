# Tempo Blockchain — Research Notes

> **Status**: Mainnet live  
> **Type**: General-purpose L1 blockchain optimized for payments  
> **Consensus**: Simplex BFT (~0.5s block time, deterministic finality)  
> **Built with**: Reth SDK (Rust), EVM compatible (Osaka hard fork)  
> **Website**: [tempo.xyz](https://tempo.xyz)

---

## Table of Contents

- [Overview](#overview)
- [Chain Configuration](#chain-configuration)
- [Key Differences from Ethereum](#key-differences-from-ethereum)
- [Fee System](#fee-system)
- [TIP-20 Token Standard](#tip-20-token-standard)
- [Predeployed Contracts](#predeployed-contracts)
- [Token List](#token-list)
- [Stablecoin DEX](#stablecoin-dex)
- [Tempo Transactions](#tempo-transactions)
- [Payment Lanes & Blockspace](#payment-lanes--blockspace)
- [Account & Signature Types](#account--signature-types)
- [Machine Payments Protocol (MPP)](#machine-payments-protocol-mpp)
- [SDKs & Developer Tools](#sdks--developer-tools)
- [AI Agent Integration](#ai-agent-integration)
- [Getting Funds](#getting-funds)
- [GitHub & Open Source](#github--open-source)
- [Source Links](#source-links)

---

## Overview

Tempo is a general-purpose L1 blockchain explicitly designed for payments. It has **no native gas token** — all fees are denominated in USD and paid in USD stablecoins. The chain uses **Simplex BFT consensus** producing blocks every ~0.5 seconds with deterministic finality.

Tempo is fully EVM-compatible (Osaka fork), meaning standard Ethereum tooling (Solidity, Foundry, Hardhat, viem, wagmi, ethers.js) works out of the box with minor adjustments.

Key value propositions:
- **USD-native fees**: No volatile token needed for gas; fees cost ~$0.001 per TIP-20 transfer
- **Payment lanes**: ~94% of blockspace reserved for payment transactions, ensuring payments are never crowded out by DeFi/compute activity
- **Sub-second finality**: ~500ms deterministic confirmation
- **Enshrined stablecoin DEX**: Protocol-level stablecoin swaps
- **Machine Payments Protocol**: HTTP 402-based inline payments for APIs and AI agents

---

## Chain Configuration

| Parameter | Mainnet | Testnet (Moderato) |
|-----------|---------|-------------------|
| **Chain ID** | `4217` | `42431` |
| **RPC** | `https://rpc.tempo.xyz` | `https://rpc.moderato.tempo.xyz` |
| **WebSocket** | `wss://rpc.tempo.xyz` | `wss://rpc.moderato.tempo.xyz` |
| **Explorer** | [explore.tempo.xyz](https://explore.tempo.xyz) | [explore.moderato.tempo.xyz](https://explore.moderato.tempo.xyz) |
| **Currency** | USD stablecoins (no native token) | USD stablecoins |

### Adding to a Wallet (viem example)

```typescript
import { tempo } from 'viem/chains'
import { createPublicClient, http } from 'viem'

const client = createPublicClient({
  chain: tempo,
  transport: http(),
})
```

Tempo chain definitions are upstreamed into **viem >= 2.43.0** and **wagmi >= 3.2.0** natively.

---

## Key Differences from Ethereum

| Area | Ethereum | Tempo |
|------|----------|-------|
| **Gas token** | ETH (volatile) | None — fees in USD stablecoins |
| **`eth_getBalance`** | Returns actual ETH balance | Returns a large placeholder value (not meaningful) |
| **`BALANCE` / `SELFBALANCE` opcodes** | Return ETH balance | Return `0` |
| **`CALLVALUE`** | Returns msg.value in wei | Returns `0` |
| **New storage slot cost** | ~20,000 gas | ~250,000 gas |
| **Account creation cost** | Standard | ~250,000 gas |
| **Fee model** | EIP-1559 dynamic base fee | Fixed base fee (predictable) |
| **Blockspace** | Single gas limit | Dual: `gas_limit` (total) + `general_gas_limit` (non-payment) |
| **Block time** | ~12 seconds | ~0.5 seconds |
| **Finality** | Probabilistic (PoS ~13 min) | Deterministic (Simplex BFT) |

**Important for developers**: Since there's no native token, patterns like `msg.value` transfers, `payable` functions, and ETH-denominated pricing don't apply. Use TIP-20 token transfers instead.

---

## Fee System

### Fee Units

Fees are specified in **attodollars** (10⁻¹⁸ USD) per gas. Since TIP-20 tokens have 6 decimal places (microdollars = 10⁻⁶ USD), the actual fee is:

```
fee = ceil(base_fee × gas_used / 10¹²)
```

### Base Fee

Tempo uses a **fixed base fee** (not dynamic like EIP-1559):
- Base fee: **20 billion attodollars/gas** (2 × 10¹⁰)
- A standard TIP-20 transfer (~50,000 gas) costs approximately **$0.001** (0.1 cent)

### Gas Parameters (Mainnet, TIP-1010)

| Parameter | Value |
|-----------|-------|
| Base fee | 20 billion attodollars/gas |
| Total block gas limit | 500M gas |
| General gas limit | 30M gas/block |

### Fee Token Preference Hierarchy

1. **Transaction level** — `fee_token` field on Tempo transactions
2. **Account level** — Set via `FeeManager.setUserToken()`
3. **TIP-20 contract** — If calling `transfer`/`transferWithMemo`/`startReward` on a TIP-20, use that token
4. **Stablecoin DEX** — For swap calls, use the `tokenIn` argument
5. **pathUSD** — Default fallback

Fee tokens must always be TIP-20 tokens with USD currency.

### Fee Sponsorship

Tempo transactions support a `fee_payer_signature` field allowing a third party to pay gas on behalf of the sender. The sender signs the transaction with a blank fee token field, the fee payer selects the token and co-signs. Both signatures are validated by the network.

### Fee Lifecycle

1. User submits transaction → fee token determined by preference hierarchy
2. **Pre-transaction**: FeeManager collects max fee from user (balance + liquidity check)
3. **Execution**: Transaction runs normally
4. **Post-transaction**: FeeManager refunds unused gas, queues actual fee
5. **Fee swap**: If user's token ≠ validator's preferred token, automatic swap at fixed rate of **0.9970** (0.3% to LPs)

### Validator Fee Preferences

Validators set their preferred stablecoin via `FeeManager.setValidatorToken()`. Fees are auto-converted if the user pays in a different stablecoin.

---

## TIP-20 Token Standard

TIP-20 extends ERC-20 with payment-oriented features. All TIP-20 tokens use **6 decimals** (microdollars).

### Key Extensions over ERC-20

| Feature | Description |
|---------|-------------|
| **Memos** | `transferWithMemo(address to, uint256 amount, bytes32 memo)` — 32-byte memo attached to transfers |
| **Role-based access** | `ISSUER_ROLE` (mint/burn), `PAUSE_ROLE` (pause transfers), `BURN_BLOCKED_ROLE` (prevent burn) |
| **Transfer policies** | Via TIP-403 registry — configurable compliance/restriction rules |
| **Quote tokens** | Tokens can declare themselves as quote tokens for DEX routing |
| **Rewards** | `startReward(uint256 amount, uint32 seconds_)` distributes tokens pro-rata to holders |
| **Batch transfers** | Via Tempo transaction's `calls` array |

### TIP-20 Address Format

All TIP-20 tokens deployed via the factory have addresses starting with the prefix `0x20c0000000000000000000000000`. This prefix is also used for payment lane classification.

### Creating a TIP-20

```solidity
ITip20Factory factory = ITip20Factory(0x20Fc5e3a880F0804BA13429a7ce8c11700BBBEE6);
address token = factory.create(
    "My Token",     // name
    "MTK",          // symbol
    "USD",          // currency (must be "USD" for fee compatibility)
    totalSupply,    // initial supply
    msg.sender      // initial holder
);
```

---

## Predeployed Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **TIP-20 Factory** | `0x20Fc5e3a880F0804BA13429a7ce8c11700BBBEE6` | Deploy new TIP-20 tokens |
| **Fee Manager** | `0xfEEc0A55c8795B8e43e4F067DfaB83C8fDa21B0C` | Manage fee tokens, validator preferences |
| **Stablecoin DEX** | `0xDec05e3a880F0804ba13429A7ce8c11700bBBee6` | Enshrined stablecoin exchange |
| **TIP-403 Registry** | `0x403c5e3A880f0804bA13429a7Ce8C11700BbBee6` | Token transfer policy registry |
| **pathUSD** | `0x20c0000000000000000000000000000000000000` | Default stablecoin, DEX routing token |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | Batch read calls |
| **CreateX** | `0xba5Ed099633D3B313e4D5F7bdc1305d3c431004` | Deterministic contract deployment |
| **Permit2** | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Uniswap Permit2 |

---

## Token List

Tempo maintains a token list registry at **[tokenlist.tempo.xyz](https://tokenlist.tempo.xyz)**

### API Endpoints

```
GET https://tokenlist.tempo.xyz/tokens              # All tokens
GET https://tokenlist.tempo.xyz/tokens/{address}     # Single token
GET https://tokenlist.tempo.xyz/tokens?chain=4217    # By chain
```

### Notable Tokens on Mainnet

| Token | Source | Notes |
|-------|--------|-------|
| **PathUSD** | Native | Default routing stablecoin |
| **Bridged USDC** | Stargate (LayerZero) | From Ethereum/other chains |
| **Bridged EURC** | Stargate (LayerZero) | Euro stablecoin |
| **USDT0** | LayerZero OFT | Tether's omnichain USDT |
| **Frax USD (frxUSD)** | Frax | Frax ecosystem stablecoin |
| **Cap USD (cUSD)** | Cap | Cap Protocol stablecoin |
| **Generic USD (gUSD)** | — | — |

---

## Stablecoin DEX

Tempo has a **protocol-enshrined** stablecoin DEX at `0xDec05e3a880F0804ba13429A7ce8c11700bBBee6`. It's not a separate dApp — it's part of the protocol, used by the fee system and available for user swaps.

### pathUSD as Routing Infrastructure

**pathUSD** (`0x20c0000000000000000000000000000000000000`) serves as the routing hub. Cross-stablecoin swaps route through pathUSD in a tree structure:

```
USDC → pathUSD → USDT
```

This means every supported stablecoin only needs a single pool (against pathUSD) rather than pairwise pools.

### Swap Functions

```solidity
// Swap exact input amount
function swapExactAmountIn(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut
) external returns (uint256 amountOut);

// Swap for exact output amount
function swapExactAmountOut(
    address tokenIn,
    address tokenOut,
    uint256 maxAmountIn,
    uint256 amountOut
) external returns (uint256 amountIn);

// Quote functions (view, no state change)
function quoteSwapExactAmountIn(...) external view returns (uint256);
function quoteSwapExactAmountOut(...) external view returns (uint256);
```

Slippage protection is built-in via `minAmountOut` / `maxAmountIn` parameters. The DEX also supports order-book matching.

---

## Tempo Transactions

Tempo introduces a new transaction type: **EIP-2718 type `0x76`** ("Tempo Transaction"). This extends standard Ethereum transactions with several payment-focused capabilities.

### Key Features

| Feature | Description |
|---------|-------------|
| **`fee_token`** | Specify which stablecoin to pay fees in |
| **`fee_payer_signature`** | Allow a third party to pay gas (fee sponsorship) |
| **`calls[]`** | Batch multiple contract calls in a single transaction |
| **Access keys** | P256 / WebAuthn (passkey) signatures for account access |
| **2D nonces** | Nonces have a `key` dimension, enabling parallel transaction lanes |
| **Expiring nonces** | Transactions can expire after a block number |
| **Scheduled transactions** | Execute at a future time |
| **Concurrent transactions** | Multiple in-flight transactions without nonce conflicts |

### Batch Calls Example

```typescript
const tx = {
  type: 'tempo',
  calls: [
    { to: tokenA, data: transferCalldata1 },
    { to: tokenB, data: transferCalldata2 },
    { to: tokenC, data: transferCalldata3 },
  ],
}
```

All calls execute atomically in a single transaction.

### 2D Nonces

Standard Ethereum uses a single incrementing nonce. Tempo nonces have two dimensions: a **key** (lane) and a **sequence**. Different keys operate independently, so you can submit parallel transactions without waiting for previous ones to confirm.

---

## Payment Lanes & Blockspace

### Payment Lane Architecture

Tempo reserves ~**94% of blockspace** for payment transactions. Only ~6% is available for general computation (DeFi, complex contracts, etc.).

| Gas Limit | Value | Purpose |
|-----------|-------|---------|
| Total `gas_limit` | 500M gas/block | All transactions |
| `general_gas_limit` | 30M gas/block | Non-payment transactions only |
| Payment capacity | ~470M gas/block | Payment transactions (the remaining capacity) |

### Transaction Classification

A transaction is a **payment** if:
1. The `tx.to` address starts with the TIP-20 prefix `0x20c0000000000000000000000000`, OR
2. For Tempo transactions, every entry in `tx.calls` targets an address with that prefix

Classification is done purely on transaction data — **no state access required**.

### Extended Block Header

Tempo extends the Ethereum block header with:
- `general_gas_limit` — Max gas for non-payment transactions
- `shared_gas_limit` — Shared budget between payment and non-payment
- `timestamp_millis_part` — Sub-second timestamp precision (for ~0.5s blocks)

---

## Account & Signature Types

Tempo supports three signature schemes with a shared address space:

| Type | Scheme | Use Case |
|------|--------|----------|
| **secp256k1** | Standard Ethereum | Direct private key management (MetaMask, etc.) |
| **P256** (type `0x01`) | Raw P256/secp256r1 | Secure enclaves, HSMs, hardware keys |
| **WebAuthn** (type `0x02`) | P256 via WebAuthn | Biometric (Face ID, Touch ID), passkeys |

P256 and WebAuthn share an address space — the same address can be accessed by either scheme. This enables the **Tempo Wallet** (passkey-based web wallet) to give users biometric-authenticated blockchain access with no seed phrase.

---

## Machine Payments Protocol (MPP)

MPP adds **inline payments to any HTTP endpoint** using the HTTP 402 status code. This is particularly relevant for AI agent payments.

### Flow

```
Client                          Server
  |  GET /resource                 |
  |------------------------------->|
  |  402 Payment Required          |
  |  WWW-Authenticate: Payment     |
  |  (Challenge: amount, currency) |
  |<-------------------------------|
  |                                |
  |  [Client pays on-chain]        |
  |                                |
  |  GET /resource                 |
  |  Authorization: Payment        |
  |  (Credential: tx hash)         |
  |------------------------------->|
  |  200 OK                        |
  |  Payment-Receipt: ...          |
  |<-------------------------------|
```

### Payment Intents

| Intent | Pattern | Latency | Best For |
|--------|---------|---------|----------|
| **One-time** | Single on-chain payment per request | ~500ms | API calls, content access, one-off purchases |
| **Pay-as-you-go** | Session with off-chain vouchers | Near-zero | LLM APIs, metered services, streaming |

### Use Cases

- **Paid APIs** — Per-request billing without API keys or signup
- **MCP tools** — Monetize Model Context Protocol tool calls; agents pay per call
- **Digital content** — Per-access for articles, data, media without subscriptions
- **AI agent payments** — Agents discover services, negotiate prices, pay inline

### Why Tempo Is Ideal for MPP

- ~500ms finality — Fast enough for synchronous request/response
- Sub-cent fees — Viable for micropayments and per-request billing
- Fee sponsorship — Servers cover gas so clients only need stablecoins
- 2D nonces — Payment transactions don't block other account activity
- High throughput — Handles settlement volume at scale

### MPP SDKs

| Platform | Package | Install |
|----------|---------|---------|
| CLI | `tempo request` | `curl -fsSL https://tempo.xyz/install \| bash` |
| TypeScript | `mppx` | `npm install mppx viem` |
| Python | `pympp` | `pip install pympp` |
| Rust | `mpp-rs` | `cargo add mpp` |

### MPP Resources

- [MPP Documentation](https://mpp.dev/) — Full protocol docs and SDK reference
- [IETF Specs](https://paymentauth.org/) — Normative protocol specification
- [Protocol Overview](https://mpp.dev/protocol) — Challenges, Credentials, Receipts

---

## SDKs & Developer Tools

### Official SDKs

| Language | Package | Notes |
|----------|---------|-------|
| **TypeScript** | `viem >= 2.43.0` / `wagmi >= 3.2.0` | Native Tempo chain + hooks upstreamed |
| **Rust** | `tempo-alloy` (tempo-rs) | Alloy-based Rust client |
| **Go** | `tempo-go` | Go client library |
| **Python** | `pytempo` | Python SDK |
| **Solidity** | `tempo-std` | Solidity interfaces (TIP-20, DEX, etc.) |
| **Foundry** | `tempo-foundry` | Foundry template with Tempo support |

### TypeScript (viem)

```typescript
import { createWalletClient, http } from 'viem'
import { tempo } from 'viem/chains'

const client = createWalletClient({
  chain: tempo,
  transport: http(),
})
```

### TypeScript (wagmi) — React Hooks

```typescript
import { useSendTransactionSync } from 'wagmi'
// Tempo-specific hooks:
import { Hooks } from 'wagmi/tempo'

// Token metadata
Hooks.token.useGetMetadata({ address: tokenAddress })

// Transfer with sync confirmation
Hooks.token.useTransferSync({ to, amount })

// Testnet faucet
Hooks.faucet.useFundSync()
```

### Foundry

```bash
forge init --template tempoxyz/tempo-foundry my-project
```

---

## AI Agent Integration

Tempo has first-class support for AI coding agents:

### Tempo Wallet for Agents

The Tempo CLI gives agents a wallet with built-in spend controls:

```bash
# In Claude Code / Amp / Codex CLI:
claude -p "Read https://tempo.xyz/SKILL.md and set up Tempo Wallet"
```

Agents use `tempo wallet` to manage keys/balances and `tempo request` to pay for services.

### Documentation Access

| Method | URL/Command |
|--------|-------------|
| **Markdown pages** | Append `.md` to any docs URL: `https://docs.tempo.xyz/quickstart/integrate-tempo.md` |
| **llms.txt** | `https://docs.tempo.xyz/llms.txt` (concise index) |
| **llms-full.txt** | `https://docs.tempo.xyz/llms-full.txt` (complete docs in one file) |
| **MCP server** | `https://docs.tempo.xyz/api/mcp` |
| **Docs skill** | `npx skills add tempoxyz/docs` |

### MCP Server Configuration

```json
{
  "mcpServers": {
    "tempo-docs": {
      "url": "https://docs.tempo.xyz/api/mcp"
    }
  }
}
```

---

## Getting Funds

### Mainnet

| Method | Description |
|--------|-------------|
| **Tempo Wallet** | Passkey-based web wallet at [wallet.tempo.xyz](https://wallet.tempo.xyz) |
| **Bridges** | LayerZero/Stargate, Squid, Relay, Across, Bungee |
| **CLI** | `tempo wallet fund` |

### Testnet (Moderato)

| Method | Description |
|--------|-------------|
| **Faucet** | Available in Tempo CLI and wagmi hooks |
| **CLI** | `tempo wallet fund --testnet` |

---

## GitHub & Open Source

**Organization**: [github.com/tempoxyz](https://github.com/tempoxyz) — 40+ repositories, fully open-source.

### Pinned / Key Repositories

| Repo | Language | Stars | Description |
|------|----------|-------|-------------|
| [**tempo**](https://github.com/tempoxyz/tempo) | Rust | 889 ★ | Core node implementation (built on Reth SDK) |
| [**tempo-apps**](https://github.com/tempoxyz/tempo-apps) | TypeScript | 181 ★ | Reference applications |
| [**tempo-ts**](https://github.com/tempoxyz/tempo-ts) | TypeScript | 72 ★ | TypeScript SDK |
| [**tempo-foundry**](https://github.com/tempoxyz/tempo-foundry) | Rust | 72 ★ | Foundry template |
| [**tempo-std**](https://github.com/tempoxyz/tempo-std) | Solidity | 63 ★ | Solidity interfaces & libraries |
| [**tempo-go**](https://github.com/tempoxyz/tempo-go) | Go | 62 ★ | Go SDK |
| [**pympp**](https://github.com/tempoxyz/pympp) | Python | — | Python MPP SDK |
| [**mpp-rs**](https://github.com/tempoxyz/mpp-rs) | Rust | — | Rust MPP SDK |
| [**mpp**](https://github.com/tempoxyz/mpp) | TypeScript | — | TypeScript MPP SDK |
| [**wallet**](https://github.com/tempoxyz/wallet) | Rust | — | Wallet implementation |
| [**docs**](https://github.com/tempoxyz/docs) | MDX | — | Documentation source |

---

## Source Links

### Documentation
- [Tempo Overview](https://docs.tempo.xyz/)
- [Using Tempo with AI](https://docs.tempo.xyz/guide/using-tempo-with-ai)
- [Getting Funds](https://docs.tempo.xyz/guide/getting-funds)
- [Integrate Tempo (Quickstart)](https://docs.tempo.xyz/quickstart/integrate-tempo)
- [Connection Details](https://docs.tempo.xyz/quickstart/connection-details)
- [EVM Compatibility](https://docs.tempo.xyz/quickstart/evm-compatibility)
- [Predeployed Contracts](https://docs.tempo.xyz/quickstart/predeployed-contracts)
- [Token List](https://docs.tempo.xyz/quickstart/tokenlist)

### Protocol Specs
- [Tempo Transaction Spec](https://docs.tempo.xyz/guide/tempo-transaction)
- [TIP-20 Specification](https://docs.tempo.xyz/protocol/tip20/spec)
- [Fee Specification](https://docs.tempo.xyz/protocol/fees/spec-fee)
- [Payment Lane Specification](https://docs.tempo.xyz/protocol/blockspace/payment-lane-specification)
- [Blockspace Overview](https://docs.tempo.xyz/protocol/blockspace/overview)
- [Quote Tokens](https://docs.tempo.xyz/protocol/exchange/quote-tokens)
- [Executing Swaps](https://docs.tempo.xyz/protocol/exchange/executing-swaps)

### Payments & Guides
- [Send a Payment](https://docs.tempo.xyz/guide/payments/send-a-payment)
- [Machine Payments (MPP)](https://docs.tempo.xyz/guide/machine-payments)
- [WebAuthn / P256 Signatures](https://docs.tempo.xyz/guide/use-accounts/webauthn-p256-signatures)

### SDKs
- [TypeScript SDK (viem/wagmi)](https://docs.tempo.xyz/sdk/typescript)
- [Wagmi Tempo Getting Started](https://wagmi.sh/tempo/getting-started)
- [MPP Documentation](https://mpp.dev/)
- [IETF Payment Auth Specs](https://paymentauth.org/)

### GitHub
- [tempoxyz Organization](https://github.com/tempoxyz)
