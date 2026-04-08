import hre from "hardhat"
const { ethers } = hre

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  // The server wallet that will call mintTo() for agent mints
  const minterAddress = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY!).address

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  console.log("Authorizing minter:", minterAddress)
  const tx = await contract.setMinter(minterAddress, true)
  await tx.wait()
  console.log("Minter authorized. TX:", tx.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
