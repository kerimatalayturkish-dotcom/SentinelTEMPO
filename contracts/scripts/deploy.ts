import hre from "hardhat"
const { ethers } = hre

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
