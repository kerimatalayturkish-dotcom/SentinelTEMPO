/**
 * Live Irys probe — exercises every Irys SDK method we depend on against the
 * configured network, prints a structured summary so we know exactly:
 *   • which network/token/address the uploader is talking to
 *   • the real cost-per-byte at this moment
 *   • the real cost for our actual median trait PNG (composed live)
 *   • whether fund() actually transfers
 *   • whether upload() returns a gateway URL that resolves
 *
 * Usage (PowerShell):
 *   npx tsx --env-file=.env.local scripts/irys-probe.ts
 *
 * Optional flags:
 *   --fund 0.0001    → actually call irys.fund() with this token-unit amount.
 *                      Off by default so a dry run never spends.
 *   --upload         → actually upload a small probe PNG. Off by default.
 *   --samples N      → compose N random trait combos to measure size (default 10).
 */

import { promises as fs } from "fs"
import path from "path"
import { fileURLToPath } from "url"

// lib/env.ts requires many unrelated server vars (admin, jwt, db, mpp, …) at
// import time via getServerEnv(). The probe only needs IRYS_* keys, so stub
// the rest with harmless placeholders BEFORE we import lib/irys (which
// transitively calls getServerEnv).
for (const [k, v] of Object.entries({
  SERVER_PRIVATE_KEY: "0x" + "11".repeat(32),
  FEE_PAYER_KEY: "0x" + "11".repeat(32),
  NFT_TREASURY_WALLET: "0x" + "00".repeat(20),
  MPP_SECRET_KEY: "probe",
  ADMIN_USERNAME: "probe",
  ADMIN_PASSWORD_HASH: "probe",
  JWT_SECRET: "probe-probe-probe-probe-probe-probe-probe",
  DATABASE_URL: "postgres://probe@localhost/probe",
})) {
  if (!process.env[k]) process.env[k] = v
}

const { composeImage } = require("../lib/compose")
const traitsConfig = require("../config/traits.json")
const { getIrysStatus, getIrysPrice, fundIrys, uploadImage } = require("../lib/irys")
type TraitSelection = import("../lib/traits").TraitSelection

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Args {
  fund: string | null
  upload: boolean
  samples: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const out: Args = { fund: null, upload: false, samples: 10 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--fund") out.fund = argv[++i] ?? null
    else if (a === "--upload") out.upload = true
    else if (a === "--samples") out.samples = Number(argv[++i] ?? 10)
  }
  return out
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomSelection(): TraitSelection {
  const sel: TraitSelection = {}
  for (const layer of traitsConfig.layers) {
    // Always pick required, ~70% chance for optional layers
    if (layer.required || Math.random() < 0.7) {
      sel[layer.id] = pickRandom(layer.options).id
    }
  }
  return sel
}

function fmtBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MiB`
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KiB`
  return `${n} B`
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function p95(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

async function main() {
  const args = parseArgs()
  console.log("\n══════════════════════════════════════════════════════════════")
  console.log(" Irys live probe")
  console.log("══════════════════════════════════════════════════════════════\n")

  // 1. Status
  console.log("▶ getIrysStatus()")
  const status = await getIrysStatus()
  console.log("  network              :", status.network)
  console.log("  token                :", status.token)
  console.log("  uploader address     :", status.address)
  console.log("  loaded balance (atom):", status.loadedBalanceAtomic)
  console.log("  loaded balance (disp):", status.loadedBalance, status.token)

  // 2. Price probes
  console.log("\n▶ getIrysPrice() — synthetic sizes")
  const sizes = [1, 1024, 100_000, 1_048_576, 5_242_880]
  for (const b of sizes) {
    const p = await getIrysPrice(b)
    console.log(`  ${fmtBytes(b).padStart(10)} → ${p.price} ${status.token} (atomic ${p.priceAtomic})`)
  }

  // 3. Compose real PNGs to learn our actual median size
  console.log(`\n▶ Composing ${args.samples} random trait combos to measure real PNG size`)
  const sampleSizes: number[] = []
  for (let i = 0; i < args.samples; i++) {
    const sel = randomSelection()
    const buf = await composeImage(sel)
    sampleSizes.push(buf.byteLength)
    process.stdout.write(`  [${i + 1}/${args.samples}] ${fmtBytes(buf.byteLength)}\n`)
  }
  const sMin = Math.min(...sampleSizes)
  const sMed = Math.round(median(sampleSizes))
  const sP95 = Math.round(p95(sampleSizes))
  const sMax = Math.max(...sampleSizes)
  console.log("  ──")
  console.log("  min   :", fmtBytes(sMin))
  console.log("  median:", fmtBytes(sMed))
  console.log("  p95   :", fmtBytes(sP95))
  console.log("  max   :", fmtBytes(sMax))

  // 4. Real-PNG price probe
  console.log("\n▶ getIrysPrice() — real PNG sizes")
  const priceMedian = await getIrysPrice(sMed)
  const pricePMax = await getIrysPrice(sMax)
  // Metadata is JSON, ~1 KiB upper bound
  const priceMeta = await getIrysPrice(1024)
  console.log(`  median PNG (${fmtBytes(sMed)}) → ${priceMedian.price} ${status.token}`)
  console.log(`  max PNG    (${fmtBytes(sMax)}) → ${pricePMax.price} ${status.token}`)
  console.log(`  metadata   (~1 KiB)         → ${priceMeta.price} ${status.token}`)

  const perMintAtomicMed = BigInt(priceMedian.priceAtomic) + BigInt(priceMeta.priceAtomic)
  const perMintAtomicMax = BigInt(pricePMax.priceAtomic) + BigInt(priceMeta.priceAtomic)
  const balAtomic = BigInt(status.loadedBalanceAtomic)
  const mintsMed = perMintAtomicMed === 0n ? "∞" : (balAtomic / perMintAtomicMed).toString()
  const mintsMax = perMintAtomicMax === 0n ? "∞" : (balAtomic / perMintAtomicMax).toString()

  console.log("\n▶ Runway estimates from current loaded balance")
  console.log(`  ≈ mints @ median size : ${mintsMed}`)
  console.log(`  ≈ mints @ max size    : ${mintsMax}`)
  console.log(`  per-mint cost (median): ${perMintAtomicMed} atomic`)
  console.log(`  per-mint cost (max)   : ${perMintAtomicMax} atomic`)

  // 5. Optional fund
  if (args.fund) {
    console.log(`\n▶ fundIrys("${args.fund}") — LIVE TRANSFER`)
    const result = await fundIrys(args.fund)
    console.log("  tx hash       :", result.txHash)
    console.log("  amount atomic :", result.amountAtomic)
    const after = await getIrysStatus()
    console.log("  balance after :", after.loadedBalance, after.token)
  } else {
    console.log("\n▶ fundIrys()  skipped (pass --fund <amount> to actually transfer)")
  }

  // 6. Optional upload + gateway resolve
  if (args.upload) {
    console.log("\n▶ uploadImage() — LIVE UPLOAD (1×1 transparent PNG)")
    const probeBuf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])
    const url = await uploadImage(probeBuf)
    console.log("  gateway URL   :", url)
    console.log("  fetching to confirm resolve…")
    try {
      const res = await fetch(url)
      console.log("  status        :", res.status, res.statusText)
      console.log("  content-type  :", res.headers.get("content-type"))
      console.log("  content-length:", res.headers.get("content-length"))
    } catch (err) {
      console.log("  ERROR fetching:", err instanceof Error ? err.message : err)
    }
  } else {
    console.log("\n▶ uploadImage() skipped (pass --upload to actually upload)")
  }

  // 7. Persist a JSON report next to the script for archival
  const reportPath = path.join(__dirname, `irys-probe-${Date.now()}.json`)
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        status,
        syntheticPrices: await Promise.all(
          sizes.map(async (b) => ({ bytes: b, ...(await getIrysPrice(b)) })),
        ),
        sampleSizes: { min: sMin, median: sMed, p95: sP95, max: sMax, count: sampleSizes.length, raw: sampleSizes },
        realPrices: { median: priceMedian, max: pricePMax, metadata: priceMeta },
        runway: {
          balanceAtomic: status.loadedBalanceAtomic,
          perMintAtomicMedian: perMintAtomicMed.toString(),
          perMintAtomicMax: perMintAtomicMax.toString(),
          mintsRemainingMedian: mintsMed,
          mintsRemainingMax: mintsMax,
        },
      },
      null,
      2,
    ),
  )
  console.log("\n▶ Report saved →", path.relative(process.cwd(), reportPath))
  console.log("\n══════════════════════════════════════════════════════════════\n")
}

main().catch((err) => {
  console.error("\n✖ Probe failed:", err)
  process.exit(1)
})
