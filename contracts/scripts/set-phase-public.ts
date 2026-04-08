import hre from "hardhat"
const { ethers } = hre

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Setting mint phase to PUBLIC (2)...")
  const tx = await contract.setMintPhase(2)
  await tx.wait()
  console.log("Phase set to PUBLIC. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
