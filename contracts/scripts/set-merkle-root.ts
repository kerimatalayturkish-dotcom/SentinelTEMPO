import hre from "hardhat"
const { ethers } = hre
import merkleData from "../../config/merkle-root.json"

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Setting Merkle root:", merkleData.root)
  const tx = await contract.setMerkleRoot(merkleData.root)
  await tx.wait()
  console.log("Merkle root set. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
