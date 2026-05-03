import { readFileSync } from "fs"
import { createPublicClient, http, isAddress, parseAbiItem, getAddress } from "viem"

// ── Load .env.local ──
for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=['"]?(.*?)['"]?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const RPC      = process.env.MINT_RPC_URL || process.env.NEXT_PUBLIC_TEMPO_RPC_URL
const LOGS_RPC = process.env.NEXT_PUBLIC_TEMPO_RPC_URL
const CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS

const addr = process.argv[2]
if (!addr || !isAddress(addr)) {
  console.error("Usage: node scripts/check-user-mints.mjs 0xUSER_ADDRESS [--from <block>]")
  process.exit(1)
}

const fromArgIdx = process.argv.indexOf("--from")
const userFrom = fromArgIdx > -1 ? BigInt(process.argv[fromArgIdx + 1]) : null

const abi = [
  { name: "tokenURI", type: "function", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
  { name: "ownerOf",  type: "function", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
]

const client     = createPublicClient({ transport: http(RPC) })
const logsClient = createPublicClient({ transport: http(LOGS_RPC) })

// ── Find tokenIds where this user was the recipient of a mint (Transfer from 0x0) ──
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
)

const latest = await client.getBlockNumber()
const DEFAULT_LOOKBACK = 2_000_000n
const startBlock = userFrom ?? (latest > DEFAULT_LOOKBACK ? latest - DEFAULT_LOOKBACK : 0n)

console.log("")
console.log(`Contract: ${CONTRACT}`)
console.log(`User:     ${addr}`)
console.log(`Scanning Transfer logs blocks ${startBlock} → ${latest}…`)

const CHUNK = 10_000n
let fromBlock = startBlock
const mintedTokenIds = []

while (fromBlock <= latest) {
  const toBlock = fromBlock + CHUNK - 1n > latest ? latest : fromBlock + CHUNK - 1n
  try {
    const logs = await logsClient.getLogs({
      address: CONTRACT,
      event: transferEvent,
      args: {
        from: "0x0000000000000000000000000000000000000000",
        to: getAddress(addr),
      },
      fromBlock,
      toBlock,
    })
    for (const l of logs) mintedTokenIds.push({ tokenId: l.args.tokenId, txHash: l.transactionHash, block: l.blockNumber })
  } catch (err) {
    console.error(`  (log scan ${fromBlock}-${toBlock} failed: ${err.shortMessage || err.message})`)
  }
  fromBlock = toBlock + 1n
}

if (mintedTokenIds.length === 0) {
  console.log("")
  console.log(`  → No mints found for this address in blocks ${startBlock} → ${latest}.`)
  console.log("    If the mint is older than that, rerun with --from 0")
  process.exit(0)
}

console.log("")
console.log(`Found ${mintedTokenIds.length} mint(s) to this address.`)
console.log("")

for (const { tokenId, txHash, block } of mintedTokenIds) {
  const tokenIdN = Number(tokenId)
  let metadataUrl, currentOwner
  try {
    metadataUrl = await client.readContract({ address: CONTRACT, abi, functionName: "tokenURI", args: [tokenId] })
    currentOwner = await client.readContract({ address: CONTRACT, abi, functionName: "ownerOf",  args: [tokenId] })
  } catch (err) {
    console.log(`  Token #${tokenIdN}  (could not read tokenURI/ownerOf: ${err.shortMessage || err.message})`)
    continue
  }

  // Fetch metadata JSON to extract image URL.
  let imageUrl = "(unknown — could not fetch metadata)"
  let name     = ""
  try {
    const res = await fetch(metadataUrl)
    if (res.ok) {
      const meta = await res.json()
      imageUrl = meta.image  || imageUrl
      name     = meta.name   || ""
    }
  } catch {
    // ignore — leave defaults
  }

  console.log(`  Token #${tokenIdN}${name ? `  (${name})` : ""}`)
  console.log(`    mint tx:        ${txHash}`)
  console.log(`    mint block:     ${block}`)
  console.log(`    current owner:  ${currentOwner}${currentOwner.toLowerCase() === addr.toLowerCase() ? "  (still held)" : "  (transferred away)"}`)
  console.log(`    metadata URI:   ${metadataUrl}`)
  console.log(`    image URL:      ${imageUrl}`)
  console.log("")
}
