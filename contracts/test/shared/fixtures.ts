import hre from "hardhat"
import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
const { ethers } = hre

export const Phase = {
  CLOSED: 0,
  WHITELIST: 1,
  WL_AGENT_INTERVAL: 2,
  AGENT_PUBLIC: 3,
  AGENT_HUMAN_INTERVAL: 4,
  HUMAN_PUBLIC: 5,
} as const

export interface DeployConfig {
  maxSupply: bigint
  wlCap: bigint
  agentCap: bigint
  wlDuration: bigint        // seconds
  agentDuration: bigint     // seconds
  interval: bigint          // seconds
  wlPrice: bigint           // base units (6 decimals)
  humanPrice: bigint        // base units (6 decimals)
}

export const TESTNET_CONFIG: DeployConfig = {
  maxSupply:     50n,
  wlCap:         10n,
  agentCap:      20n,
  wlDuration:    3600n,
  agentDuration: 3600n,
  interval:      600n,
  wlPrice:       1_150_000n, // 1.15 pathUSD
  humanPrice:    3_150_000n, // 3.15 pathUSD
}

export const MAINNET_CONFIG: DeployConfig = {
  maxSupply:     10_000n,
  wlCap:         2_000n,
  agentCap:      3_000n,
  wlDuration:    3n * 3600n,
  agentDuration: 3n * 3600n,
  interval:      30n * 60n,
  wlPrice:       2_000_000n, // 2.00 pathUSD
  humanPrice:    4_000_000n, // 4.00 pathUSD
}

/**
 * Build an OpenZeppelin StandardMerkleTree from a list of addresses.
 * Leaf encoding matches what SentinelTEMPO verifies on-chain:
 *     keccak256(bytes.concat(keccak256(abi.encode(address))))
 */
export function buildTree(addresses: string[]) {
  const tree = StandardMerkleTree.of(
    addresses.map((a) => [a]),
    ["address"]
  )
  return tree
}

export function proofFor(tree: ReturnType<typeof buildTree>, address: string): string[] {
  for (const [i, v] of tree.entries()) {
    if ((v[0] as string).toLowerCase() === address.toLowerCase()) {
      return tree.getProof(i) as string[]
    }
  }
  throw new Error(`Address ${address} not in tree`)
}

export async function deploySentinel(cfg: DeployConfig) {
  const signers = await ethers.getSigners()
  const [owner, treasury, user1, user2, user3, user4, minter] = signers

  const MockPathUSD = await ethers.getContractFactory("MockPathUSD")
  const token = await MockPathUSD.deploy()
  await token.waitForDeployment()

  // Whitelist user1 + user2 + user4. user3 stays off-list for negative tests.
  const tree = buildTree([user1.address, user2.address, user4.address])

  const SentinelTEMPO = await ethers.getContractFactory("SentinelTEMPO")
  const contract = await SentinelTEMPO.deploy({
    paymentToken:  await token.getAddress(),
    treasury:      treasury.address,
    merkleRoot:    tree.root,
    maxSupply:     cfg.maxSupply,
    wlCap:         cfg.wlCap,
    agentCap:      cfg.agentCap,
    wlDuration:    cfg.wlDuration,
    agentDuration: cfg.agentDuration,
    interval:      cfg.interval,
    wlPrice:       cfg.wlPrice,
    humanPrice:    cfg.humanPrice,
  })
  await contract.waitForDeployment()

  const proof1 = proofFor(tree, user1.address)
  const proof2 = proofFor(tree, user2.address)
  const proof4 = proofFor(tree, user4.address)

  return {
    contract,
    token,
    tree,
    owner,
    treasury,
    user1,
    user2,
    user3,
    user4,
    minter,
    proof1,
    proof2,
    proof4,
  }
}

let counter = 0
/** Deterministic, non-zero, never-repeats trait hash for tests. */
export function nextTraitHash(): string {
  counter += 1
  return ethers.keccak256(ethers.toUtf8Bytes(`trait-${counter}-${Date.now()}-${Math.random()}`))
}

export const URI = (n: number | string = 0) => `https://devnet.irys.xyz/test-${n}`
