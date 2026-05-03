// Fetch every metadata Irys txid uploaded by our funder for this collection.
// Paginates the Irys GraphQL endpoint (1000-per-page cap).
//
// Usage:
//   node scripts/list-irys-mints.mjs            # prints count + ids to stdout
//   node scripts/list-irys-mints.mjs > ids.txt  # save to file

const ENDPOINT = "https://uploader.irys.xyz/graphql"
const OWNER    = "0xe1aa770f006d4d8065b68a2551a5979474f3Adee"
const APP_NAME = "SentinelTEMPO"

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

const all = []
let after = null
let page  = 0

while (true) {
  page++
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { after } }),
  })
  const { data, errors } = await res.json()
  if (errors) {
    console.error("GraphQL error:", errors)
    process.exit(1)
  }
  const { edges, pageInfo } = data.transactions
  for (const e of edges) all.push(e.node)
  console.error(`  page ${page}: +${edges.length}  (running total ${all.length})`)
  if (!pageInfo.hasNextPage || edges.length === 0) break
  after = edges[edges.length - 1].cursor
}

console.error(`\nTotal metadata uploads: ${all.length}\n`)
for (const n of all) console.log(n.id)
