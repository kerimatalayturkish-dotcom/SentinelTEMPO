// Pulls every metadata upload tagged App-Name=SentinelTEMPO from Irys,
// then fetches each metadata JSON and prints a summary.
//
// Usage:
//   node scripts/dump-irys-mints.mjs                    # summary + table to stdout
//   node scripts/dump-irys-mints.mjs --json out.json    # also write full dump
//   node scripts/dump-irys-mints.mjs --concurrency 20   # tweak fetch parallelism

const ENDPOINT = "https://uploader.irys.xyz/graphql"
const GATEWAY  = "https://gateway.irys.xyz"
const OWNER    = "0xe1aa770f006d4d8065b68a2551a5979474f3Adee"
const APP_NAME = "SentinelTEMPO"

const args = process.argv.slice(2)
const jsonIdx = args.indexOf("--json")
const jsonOut = jsonIdx > -1 ? args[jsonIdx + 1] : null
const concIdx = args.indexOf("--concurrency")
const CONCURRENCY = concIdx > -1 ? Number(args[concIdx + 1]) : 10

const QUERY = `
query ($after: String) {
  transactions(
    owners: ["${OWNER}"]
    tags: [
      { name: "App-Name",     values: ["${APP_NAME}"] }
      { name: "Content-Type", values: ["application/json"] }
    ]
    limit: 1000
    order: ASC
    after: $after
  ) {
    edges {
      cursor
      node { id timestamp }
    }
    pageInfo { hasNextPage }
  }
}`

// ── 1. Paginate Irys GraphQL ──
const txs = []
let after = null
let page  = 0
process.stderr.write("Querying Irys GraphQL…\n")
while (true) {
  page++
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { after } }),
  })
  const { data, errors } = await res.json()
  if (errors) { console.error("GraphQL error:", errors); process.exit(1) }
  const { edges, pageInfo } = data.transactions
  for (const e of edges) txs.push({ id: e.node.id, timestamp: e.node.timestamp })
  process.stderr.write(`  page ${page}: +${edges.length}  (running total ${txs.length})\n`)
  if (!pageInfo.hasNextPage || edges.length === 0) break
  after = edges[edges.length - 1].cursor
}
process.stderr.write(`\nFound ${txs.length} metadata uploads.\n\n`)

// ── 2. Fetch each metadata JSON in parallel batches ──
process.stderr.write(`Fetching metadata JSONs (concurrency ${CONCURRENCY})…\n`)
const results = []
let done = 0
for (let i = 0; i < txs.length; i += CONCURRENCY) {
  const batch = txs.slice(i, i + CONCURRENCY)
  const settled = await Promise.allSettled(batch.map(async (t) => {
    const url = `${GATEWAY}/${t.id}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { ...t, url, meta: await r.json() }
  }))
  for (let j = 0; j < settled.length; j++) {
    const s = settled[j]
    if (s.status === "fulfilled") results.push(s.value)
    else results.push({ ...batch[j], url: `${GATEWAY}/${batch[j].id}`, error: s.reason?.message || String(s.reason) })
  }
  done += batch.length
  process.stderr.write(`  ${done}/${txs.length}\r`)
}
process.stderr.write(`\n\n`)

// ── 3. Summary ──
const ok      = results.filter(r => r.meta)
const failed  = results.filter(r => r.error)
const numbers = ok.map(r => {
  const n = String(r.meta.name || "").match(/#(\d+)/)
  return n ? Number(n[1]) : null
}).filter(n => n != null).sort((a, b) => a - b)
const uniqNumbers = [...new Set(numbers)]

console.log("─── SentinelTEMPO Irys mints ───")
console.log(`Total metadata uploads:   ${results.length}`)
console.log(`Fetched OK:               ${ok.length}`)
console.log(`Fetch failed:             ${failed.length}`)
console.log(`Unique #NNNN seen:        ${uniqNumbers.length}`)
if (uniqNumbers.length) {
  console.log(`Number range:             #${uniqNumbers[0]} → #${uniqNumbers[uniqNumbers.length - 1]}`)
}
if (ok.length) {
  console.log(`First upload (UTC):       ${new Date(Math.min(...ok.map(r => r.timestamp))).toISOString()}`)
  console.log(`Last  upload (UTC):       ${new Date(Math.max(...ok.map(r => r.timestamp))).toISOString()}`)
}
console.log("")
console.log("number  | metadata id                                           | image id")
console.log("--------+-------------------------------------------------------+--------------------------------------------------")
for (const r of ok.slice(0, 50)) {
  const num   = String(r.meta.name || "").match(/#(\d+)/)?.[1] ?? "?"
  const imgId = (r.meta.image || "").split("/").pop() ?? ""
  console.log(`#${num.padStart(4, "0")}   | ${r.id.padEnd(53)} | ${imgId}`)
}
if (ok.length > 50) console.log(`… (${ok.length - 50} more — pass --json out.json to dump everything)`)

if (failed.length) {
  console.log(`\n${failed.length} fetch failure(s) (first 10):`)
  for (const f of failed.slice(0, 10)) console.log(`  ${f.id}  ${f.error}`)
}

// ── 4. Optional full dump ──
if (jsonOut) {
  const { writeFileSync } = await import("fs")
  writeFileSync(jsonOut, JSON.stringify(results, null, 2))
  console.log(`\nFull dump written to ${jsonOut}`)
}
