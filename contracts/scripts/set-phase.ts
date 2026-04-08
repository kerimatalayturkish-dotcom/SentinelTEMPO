import hre from "hardhat"
const { ethers } = hre

// Usage: npx hardhat run scripts/set-phase.ts --network moderato
// Set MINT_PHASE env var: 0=CLOSED, 1=WHITELIST, 2=PUBLIC
async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const phase = Number(process.env.MINT_PHASE ?? 0)
  const phaseNames = ["CLOSED", "WHITELIST", "PUBLIC"]

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log(`Setting phase to: ${phaseNames[phase]} (${phase})`)
  const tx = await contract.setMintPhase(phase)
  await tx.wait()
  console.log("Phase set. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
