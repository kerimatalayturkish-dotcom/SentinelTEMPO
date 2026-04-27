/**
 * Quick read-only probe: report current Irys loaded balance + runway.
 * Usage: npx tsx --env-file=.env.local scripts/irys-status.ts
 */
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

const { getIrysStatus, getIrysPrice } = require("../lib/irys")

;(async () => {
  const status = await getIrysStatus()
  console.log("network         :", status.network)
  console.log("token           :", status.token)
  console.log("uploader address:", status.address)
  console.log("loaded balance  :", status.loadedBalance, status.token, `(atomic ${status.loadedBalanceAtomic})`)

  // Per-mint cost @ 200 KiB image + 1 KiB metadata (admin-dashboard upper bound)
  const img = await getIrysPrice(200 * 1024)
  const meta = await getIrysPrice(1024)
  const perMintAtomic = BigInt(img.priceAtomic) + BigInt(meta.priceAtomic)
  const balAtomic = BigInt(status.loadedBalanceAtomic)
  const runway = perMintAtomic > 0n ? balAtomic / perMintAtomic : 0n
  console.log("\nper-mint cost (200 KiB+1 KiB):", perMintAtomic.toString(), "atomic")
  console.log("≈ mints remaining          :", runway.toString())
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
