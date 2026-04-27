import hre from "hardhat"
const { ethers } = hre

// Usage: npx hardhat run scripts/emergency-pause.ts --network current
// Emergency pause — freezes the timeline until unpause is called.
// The contract self-advances phases (WL → interval → agent → interval → public)
// purely by time/supply, so there is no "go public" script — this is the only
// owner-driven phase control we ship, and it's an emergency brake.
async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Emergency pausing contract...")
  const tx = await contract.emergencyPause()
  await tx.wait()
  console.log("Contract PAUSED. TX:", tx.hash)
  console.log("Run unpause.ts to resume the mint timeline.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
