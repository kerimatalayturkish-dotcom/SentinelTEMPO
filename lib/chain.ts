import { defineChain } from 'viem'

// Only include webSocket rpcUrl when the env var is actually set.
// Passing `[undefined]` upstream breaks viem's transport resolution.
const wsUrl = process.env.NEXT_PUBLIC_TEMPO_WS_URL
const rpcUrls = {
  default: {
    http: [process.env.NEXT_PUBLIC_TEMPO_RPC_URL!],
    ...(wsUrl ? { webSocket: [wsUrl] } : {}),
  },
}

// Build chain object from env vars — same code works for Moderato (42431) and mainnet (4217)
export const tempoChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Tempo',
  nativeCurrency: {
    name: 'USD',
    symbol: 'USD',
    decimals: 18, // MetaMask quirk: must be 18 even though pathUSD is 6
  },
  rpcUrls,
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

// ─── Prices (locked 2026-04-27 for mainnet) ───
// Base units (6 decimals). These MUST match the MINT_*_PRICE_BASE_UNITS env vars
// that were fed into the contract constructor at deploy time.
export const WL_PRICE = 2_000_000n       // 2.00 pathUSD — human WL
export const HUMAN_PRICE = 4_000_000n    // 4.00 pathUSD — human public

// Human-readable (for UI)
export const WL_PRICE_DISPLAY = '2.00'
export const HUMAN_PRICE_DISPLAY = '4.00'

// MPP off-chain charge amounts (strings in pathUSD). Agent pays these amounts
// via MPP 402 to treasury directly. Contract does NOT pull pathUSD for agents.
// In WL phase: agents pay the same as humans (2.00).
// In agent public phase: distinct 3.00 tier.
export const AGENT_CHARGE_WL = '2.00'
export const AGENT_CHARGE_PUBLIC = '3.00'

// Per-wallet limits (mirror contract)
export const WL_MAX_PER_WALLET = 1
export const PUBLIC_MAX_PER_WALLET = 5

// Phase enum matching contract
export enum Phase {
  CLOSED = 0,
  WHITELIST = 1,
  WL_AGENT_INTERVAL = 2,
  AGENT_PUBLIC = 3,
  AGENT_HUMAN_INTERVAL = 4,
  HUMAN_PUBLIC = 5,
}

export const PHASE_NAMES: Record<number, string> = {
  [Phase.CLOSED]: 'closed',
  [Phase.WHITELIST]: 'whitelist',
  [Phase.WL_AGENT_INTERVAL]: 'wl_agent_interval',
  [Phase.AGENT_PUBLIC]: 'agent_public',
  [Phase.AGENT_HUMAN_INTERVAL]: 'agent_human_interval',
  [Phase.HUMAN_PUBLIC]: 'human_public',
}

