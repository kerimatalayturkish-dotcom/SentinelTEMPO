import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import * as dotenv from "dotenv"
import * as path from "path"

// Load env from root project
dotenv.config({ path: path.join(process.cwd(), '..', '.env.local') })

const rawKey = process.env.SERVER_PRIVATE_KEY || ""
const DEPLOYER_KEY = rawKey.length === 66 && rawKey.startsWith("0x")
  ? rawKey
  : "0x" + "0".repeat(64) // fallback for compilation-only

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
}

export default config
