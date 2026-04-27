import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import * as dotenv from "dotenv"
import * as path from "path"

// Load env from project root .env.local
dotenv.config({ path: path.join(process.cwd(), '..', '.env.local') })

const rawKey = (process.env.SERVER_PRIVATE_KEY || "").trim()
const normalizedKey = rawKey.startsWith("0x") ? rawKey : (rawKey.length === 64 ? "0x" + rawKey : "")
const DEPLOYER_KEY = normalizedKey.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(normalizedKey)
  ? normalizedKey
  : "0x" + "0".repeat(64) // compile-only fallback

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
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
  sourcify: {
    enabled: true,
  },
}

export default config