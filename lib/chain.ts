import { defineChain } from 'viem'

// Build chain object from env vars — same code works for testnet and mainnet
export const tempoChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Tempo',
  nativeCurrency: {
    name: 'USD',
    symbol: 'USD',
    decimals: 18, // MetaMask quirk: must be 18 even though pathUSD is 6
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
