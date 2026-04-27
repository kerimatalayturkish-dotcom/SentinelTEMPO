import hre from "hardhat"
const { ethers } = hre

/**
 * Deploys SentinelTEMPO with a 11-arg Config struct read from env.
 * Run with: npx hardhat run scripts/deploy.ts --network <moderato|tempo>
 */
async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying with:", deployer.address)

  const env = process.env

  function required(name: string): string {
    const v = env[name]
    if (!v) throw new Error(`Missing env var: ${name}`)
    return v
  }

  function requiredBigInt(name: string): bigint {
    return BigInt(required(name))
  }

  const cfg = {
    paymentToken:   required("NEXT_PUBLIC_PATHUSD_ADDRESS"),
    treasury:       required("NFT_TREASURY_WALLET"),
    merkleRoot:     required("MINT_MERKLE_ROOT"),         // must be the real root, not zero
    maxSupply:      requiredBigInt("MINT_MAX_SUPPLY"),
    wlCap:          requiredBigInt("MINT_WL_CAP"),
    agentCap:       requiredBigInt("MINT_AGENT_CAP"),
    wlDuration:     requiredBigInt("MINT_WL_DURATION_SECONDS"),
    agentDuration:  requiredBigInt("MINT_AGENT_DURATION_SECONDS"),
    interval:       requiredBigInt("MINT_INTERVAL_SECONDS"),
    wlPrice:        requiredBigInt("MINT_WL_PRICE_BASE_UNITS"),
    humanPrice:     requiredBigInt("MINT_HUMAN_PRICE_BASE_UNITS"),
  }

  if (cfg.merkleRoot === ethers.ZeroHash) {
    throw new Error("MINT_MERKLE_ROOT is zero hash. Generate it first via `pnpm generate-merkle`.")
  }

  console.log("Config:")
  console.log(`  paymentToken    = ${cfg.paymentToken}`)
  console.log(`  treasury        = ${cfg.treasury}`)
  console.log(`  merkleRoot      = ${cfg.merkleRoot}`)
  console.log(`  maxSupply       = ${cfg.maxSupply}`)
  console.log(`  wlCap           = ${cfg.wlCap}`)
  console.log(`  agentCap        = ${cfg.agentCap}`)
  console.log(`  wlDuration      = ${cfg.wlDuration}s`)
  console.log(`  agentDuration   = ${cfg.agentDuration}s`)
  console.log(`  interval        = ${cfg.interval}s`)
  console.log(`  wlPrice         = ${cfg.wlPrice}`)
  console.log(`  humanPrice      = ${cfg.humanPrice}`)

  const SentinelTEMPO = await ethers.getContractFactory("SentinelTEMPO")
  const contract = await SentinelTEMPO.deploy(cfg)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log("")
  console.log("SentinelTEMPO deployed to:", address)
  console.log("")
  console.log("Next steps:")
  console.log(`1. Add to .env.local:  NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=${address}`)
  console.log("2. Run set-minter to authorize the server wallet")
  console.log("3. Run set-phase (startMint) when ready to go live")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})