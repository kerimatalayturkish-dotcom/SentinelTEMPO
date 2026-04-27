import hre from "hardhat"
const { ethers } = hre

/**
 * Calls startMint() to begin the autonomous on-chain phase timeline.
 * Run with: npx hardhat run scripts/set-phase.ts --network <moderato|tempo>
 */
async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error("Missing NEXT_PUBLIC_NFT_CONTRACT_ADDRESS")

  const [owner] = await ethers.getSigners()
  const contract = await ethers.getContractAt("SentinelTEMPO", contractAddress, owner)

  // Read the actual durations from the contract so the log line is honest.
  const [wlDur, agentDur, interval] = await Promise.all([
    contract.WL_DURATION(),
    contract.AGENT_DURATION(),
    contract.INTERVAL(),
  ])

  function fmt(secs: bigint): string {
    const s = Number(secs)
    if (s % 3600 === 0) return `${s / 3600}h`
    if (s % 60 === 0) return `${s / 60}m`
    return `${s}s`
  }

  console.log("Starting mint (autonomous on-chain timeline)...")
  const tx = await contract.startMint()
  const receipt = await tx.wait()
  console.log("Mint started! TX:", tx.hash)
  console.log(`Timeline: WL(${fmt(wlDur)}) ??? Interval(${fmt(interval)}) ??? Agent(${fmt(agentDur)}) ??? Interval(${fmt(interval)}) ??? Human(open)`)
  console.log("Block:", receipt?.blockNumber)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})