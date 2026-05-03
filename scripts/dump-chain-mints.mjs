// Canonical mint dump from the contract.
// Scans Transfer(from=0x0) events on the NFT contract, then for each tokenId
// reads tokenURI + ownerOf and fetches the Irys metadata JSON.
//
// Usage:
//   node scripts/dump-chain-mints.mjs                    # summary + first 50 rows
//   node scripts/dump-chain-mints.mjs --json out.json    # also write full dump
//   node scripts/dump-chain-mints.mjs --from <block>     # override scan start
//   node scripts/dump-chain-mints.mjs --concurrency 20

import { readFileSync, writeFileSync } from "fs"
import { createPublicClient, http, parseAbiItem } from "viem"

for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=['"]?(.*?)['"]?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const RPC      = process.env.MINT_RPC_URL || process.env.NEXT_PUBLIC_TEMPO_RPC_URL 
const LOGS_RPC = process.env.NEXT_PUBLIC_TEMPO_RPC_URL
const CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS

const args      = process.argv.slice(2)
const jsonIdx   = args.indexOf("--json")
const jsonOut   = jsonIdx > -1 ? args[jsonIdx + 1] : null
const fromIdx   = args.indexOf("--from")
const userFrom  = fromIdx > -1 ? BigInt(args[fromIdx + 1]) : null
const concIdx   = args.indexOf("--concurrency")
const CONCURRENCY = concIdx > -1 ? Number(args[concIdx + 1]) : 10

const abi = [
  { name: "tokenURI", type: "function", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
  { name: "ownerOf",  type: "function", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { name: "totalSupply", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
]

const client     = createPublicClient({ transport: http(RPC) })
const logsClient = createPublicClient({ transport: http(LOGS_RPC) })

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
)

const latest = await client.getBlockNumber()
const DEFAULT_LOOKBACK = 2_000_000n
const startBlock = userFrom ?? (latest > DEFAULT_LOOKBACK ? latest - DEFAULT_LOOKBACK : 0n)

let totalSupply
try { totalSupply = await client.readContract({ address: CONTRACT, abi, functionName: "totalSupply" }) }
catch { totalSupply = null }

console.error(`Contract:     ${CONTRACT}`)
console.error(`totalSupply:  ${totalSupply ?? "(unknown)"}`)
console.error(`Scanning Transfer(from=0x0) blocks ${startBlock} → ${latest}…`)

// ── 1. Scan mint events in 10k chunks ──
const CHUNK = 10_000n
let fromBlock = startBlock
const mints = []   // { tokenId, minter, mintTx, mintBlock }
while (fromBlock <= latest) {
  const toBlock = fromBlock + CHUNK - 1n > latest ? latest : fromBlock + CHUNK - 1n
  try {
    const logs = await logsClient.getLogs({
      address: CONTRACT,
      event: transferEvent,
      args: { from: "0x0000000000000000000000000000000000000000" },
      fromBlock,
      toBlock,
    })
    for (const l of logs) {
      mints.push({
        tokenId:   l.args.tokenId,
        minter:    l.args.to,
        mintTx:    l.transactionHash,
        mintBlock: l.blockNumber,
      })
    }
    if (logs.length) process.stderr.write(`  ${fromBlock}-${toBlock}: +${logs.length}  (total ${mints.length})\n`)
  } catch (err) {
    console.error(`  (log scan ${fromBlock}-${toBlock} failed: ${err.shortMessage || err.message})`)
  }
  fromBlock = toBlock + 1n
}
console.error(`\nFound ${mints.length} mint events.\n`)

// ── 2. For each tokenId, read tokenURI + ownerOf, fetch metadata ──
console.error(`Fetching tokenURI / ownerOf / metadata (concurrency ${CONCURRENCY})…`)
const results = []
let done = 0
for (let i = 0; i < mints.length; i += CONCURRENCY) {
  const batch = mints.slice(i, i + CONCURRENCY)
  const settled = await Promise.allSettled(batch.map(async (m) => {
    const [tokenURI, currentOwner] = await Promise.all([
      client.readContract({ address: CONTRACT, abi, functionName: "tokenURI", args: [m.tokenId] }),
      client.readContract({ address: CONTRACT, abi, functionName: "ownerOf",  args: [m.tokenId] }),
    ])
    let meta = null, image = null, metaError = null
    try {
      const r = await fetch(tokenURI)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      meta  = await r.json()
      image = meta.image || null
    } catch (e) { metaError = e.message }
    return {
      tokenId:      m.tokenId.toString(),
      minter:       m.minter,
      currentOwner,
      transferred:  currentOwner.toLowerCase() !== m.minter.toLowerCase(),
      mintTx:       m.mintTx,
      mintBlock:    m.mintBlock.toString(),
      tokenURI,
      image,
      name:         meta?.name ?? null,
      meta,
      metaError,
    }
  }))
  for (let j = 0; j < settled.length; j++) {
    const s = settled[j]
    if (s.status === "fulfilled") results.push(s.value)
    else results.push({
      tokenId: batch[j].tokenId.toString(),
      minter:  batch[j].minter,
      mintTx:  batch[j].mintTx,
      mintBlock: batch[j].mintBlock.toString(),
      error:   s.reason?.message || String(s.reason),
    })
  }
  done += batch.length
  process.stderr.write(`  ${done}/${mints.length}\r`)
}
process.stderr.write(`\n\n`)

// ── 3. Summary ──
const ok       = results.filter(r => r.tokenURI)
const failed   = results.filter(r => !r.tokenURI)
const metaFail = ok.filter(r => r.metaError)
const minters  = new Set(ok.map(r => r.minter.toLowerCase()))
const transferred = ok.filter(r => r.transferred).length

console.log("─── SentinelTEMPO on-chain mints ───")
console.log(`Mints (Transfer from 0x0):    ${results.length}`)
console.log(`totalSupply():                ${totalSupply ?? "?"}`)
console.log(`tokenURI/ownerOf reads OK:    ${ok.length}`)
console.log(`Read failures:                ${failed.length}`)
console.log(`Metadata fetch failures:      ${metaFail.length}`)
console.log(`Unique minters:               ${minters.size}`)
console.log(`Transferred away from minter: ${transferred}`)
console.log("")
console.log("tokenId | name                        | minter                                       | current owner")
console.log("--------+-----------------------------+----------------------------------------------+----------------------------------------------")
for (const r of ok.slice(0, 50)) {
  const name = (r.name || "").padEnd(27).slice(0, 27)
  console.log(`${r.tokenId.padStart(6)}  | ${name} | ${r.minter} | ${r.currentOwner}${r.transferred ? "  →" : ""}`)
}
if (ok.length > 50) console.log(`… (${ok.length - 50} more — pass --json out.json to dump everything)`)

if (failed.length) {
  console.log(`\n${failed.length} read failure(s) (first 10):`)
  for (const f of failed.slice(0, 10)) console.log(`  token ${f.tokenId}  ${f.error}`)
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(results, null, 2))
  console.log(`\nFull dump written to ${jsonOut}`)
}
