import { readFileSync } from "fs"
import { createPublicClient, http, isAddress, parseAbiItem, formatUnits, getAddress } from "viem"

// ── Load .env.local ──
for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=['"]?(.*?)['"]?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const RPC      = process.env.MINT_RPC_URL || process.env.NEXT_PUBLIC_TEMPO_RPC_URL
const LOGS_RPC = process.env.NEXT_PUBLIC_TEMPO_RPC_URL // public Tempo RPC handles getLogs
const CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
const PATHUSD  = process.env.NEXT_PUBLIC_PATHUSD_ADDRESS
const TREASURY = process.env.NFT_TREASURY_WALLET

// ── Address from CLI arg ──
const addr = process.argv[2]
if (!addr || !isAddress(addr)) {
  console.error("Usage: node scripts/check-minter.mjs 0xADDRESS")
  process.exit(1)
}

const abi = [
  { name: "wlMinted",       type: "function", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "bool"    }] },
  { name: "humanMintCount", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "agentMintCount", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "balanceOf",      type: "function", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
]

const client = createPublicClient({ transport: http(RPC) })
const logsClient = createPublicClient({ transport: http(LOGS_RPC) })

const read = (fn) =>
  client.readContract({ address: CONTRACT, abi, functionName: fn, args: [addr] })

const [wl, human, agent, bal] = await Promise.all([
  read("wlMinted"),
  read("humanMintCount"),
  read("agentMintCount"),
  read("balanceOf"),
])

const wlN     = wl ? 1 : 0
const humanN  = Number(human)
const agentN  = Number(agent)
const totalEverMinted = wlN + humanN + agentN

console.log("")
console.log(`Contract: ${CONTRACT}`)
console.log(`Address:  ${addr}`)
console.log("")
console.log(`  wlMinted (bool):       ${wl}`)
console.log(`  humanMintCount:        ${humanN}`)
console.log(`  agentMintCount:        ${agentN}`)
console.log(`  ─────────────────────────`)
console.log(`  total ever minted:     ${totalEverMinted}`)
console.log(`  current balance held:  ${Number(bal)}`)
console.log("")
console.log(
  totalEverMinted === 0
    ? "  → NEVER minted. Refund OK."
    : `  → DID mint ${totalEverMinted}. Do NOT refund (or refund partial only).`,
)

// ── pathUSD payments from this address → treasury ──
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
)

// Tempo block range can be large; chunk to avoid RPC -32005 limits.
// Default to scanning the last ~500k blocks (~3 days at 0.5s blocks).
// Override with: node scripts/check-minter.mjs <addr> --from <blockNumber>
const latest = await client.getBlockNumber()
const fromArgIdx = process.argv.indexOf("--from")
const userFrom = fromArgIdx > -1 ? BigInt(process.argv[fromArgIdx + 1]) : null
const DEFAULT_LOOKBACK = 500_000n
const startBlock = userFrom ?? (latest > DEFAULT_LOOKBACK ? latest - DEFAULT_LOOKBACK : 0n)

const CHUNK  = 10_000n
let fromBlock = startBlock
const transfers = []

console.log("")
console.log(`Scanning pathUSD transfers blocks ${startBlock} → ${latest} via ${LOGS_RPC}…`)

while (fromBlock <= latest) {
  const toBlock = fromBlock + CHUNK - 1n > latest ? latest : fromBlock + CHUNK - 1n
  try {
    const logs = await logsClient.getLogs({
      address: PATHUSD,
      event: transferEvent,
      args: { from: getAddress(addr), to: getAddress(TREASURY) },
      fromBlock,
      toBlock,
    })
    transfers.push(...logs)
  } catch (err) {
    console.error(`  (log scan ${fromBlock}-${toBlock} failed: ${err.shortMessage || err.message})`)
  }
  fromBlock = toBlock + 1n
}

const totalPaid = transfers.reduce((acc, l) => acc + l.args.value, 0n)

console.log("")
console.log(`Treasury: ${TREASURY}`)
console.log(`  pathUSD transfers from this address → treasury: ${transfers.length}`)
console.log(`  total pathUSD sent:                              ${formatUnits(totalPaid, 6)}`)

if (transfers.length > 0) {
  console.log("")
  console.log("  Individual payments:")
  for (const l of transfers) {
    console.log(
      `    block ${l.blockNumber}  tx ${l.transactionHash}  amount ${formatUnits(l.args.value, 6)} pathUSD`,
    )
  }
}
