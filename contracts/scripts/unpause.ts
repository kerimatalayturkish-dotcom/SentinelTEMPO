import hre from "hardhat"
const { ethers } = hre

// Usage: npx hardhat run scripts/unpause.ts --network moderato
// Resumes the mint timeline. All phase deadlines shift by the total paused duration.
async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Unpausing contract...")
  const tx = await contract.unpause()
  await tx.wait()
  console.log("Contract UNPAUSED. TX:", tx.hash)
  console.log("Phase timeline has been shifted by total paused duration.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
