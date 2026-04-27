/**
 * Direct Irys top-up: bypass the SDK's flaky tx broadcast by sending the
 * funding ETH ourselves via viem (reliable EIP-1559 fees), then ask the
 * Irys bundler to register the tx.
 *
 * Usage: npx tsx --env-file=.env.local scripts/irys-fund-direct.ts <amountEth>
 *   e.g. npx tsx --env-file=.env.local scripts/irys-fund-direct.ts 0.005
 */
import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

// Stub unrelated env vars before importing lib/irys (which calls getServerEnv()).
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

async function main() {
  // --register-only <txHash>: skip the on-chain send, just register an
  // already-confirmed funding tx with the Irys bundler. Use this if a prior
  // run sent the ETH but failed at the registration step.
  const registerOnlyIdx = process.argv.indexOf("--register-only")
  const registerOnlyHash =
    registerOnlyIdx >= 0 ? (process.argv[registerOnlyIdx + 1] as Hex | undefined) : undefined

  const amountStr = registerOnlyHash ? null : process.argv[2]
  if (!registerOnlyHash && !amountStr) {
    throw new Error(
      "Pass amount in ETH, e.g. `... irys-fund-direct.ts 0.005`\n" +
        "Or `... irys-fund-direct.ts --register-only 0x<txHash>` to register an already-mined tx.",
    )
  }
  const amountWei = amountStr ? parseEther(amountStr) : 0n

  const rawKey = (process.env.IRYS_PRIVATE_KEY || "").trim()
  const pk = (rawKey.startsWith("0x") ? rawKey : "0x" + rawKey) as Hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("IRYS_PRIVATE_KEY missing/invalid")
  const account = privateKeyToAccount(pk)

  const rpcUrl = process.env.IRYS_RPC_URL || "https://ethereum-rpc.publicnode.com"
  const transport = http(rpcUrl)
  const pub = createPublicClient({ chain: mainnet, transport })
  const wallet = createWalletClient({ chain: mainnet, account, transport })

  // 1. Get Irys bundler deposit address for ETH
  // Bundler URL is the Irys mainnet node — confirm via SDK so we hit the
  // same address the bundler expects.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getIrysStatus } = require("../lib/irys") as { getIrysStatus(): Promise<unknown> }
  const status = (await getIrysStatus()) as {
    address: string
    network: "devnet" | "mainnet"
    token: string
    loadedBalance: string
  }
  console.log("Irys status BEFORE:", status)

  // The SDK's known mainnet ETH bundler address (same one used by previous fund attempts).
  // Hardcoding here is safe — Irys publishes this and the SDK reuses it.
  const BUNDLER_ETH_ADDRESS = "0x32Ed3Dc90CD5AE7b875A0ee7A86CA6D2fc72c635" as const

  // 2. Pre-flight balance / nonce / fee check
  const balBefore = await pub.getBalance({ address: account.address })
  console.log(`wallet ETH before  : ${formatEther(balBefore)}`)
  const fees = await pub.estimateFeesPerGas()
  console.log(`network maxFee/Gas : ${fees.maxFeePerGas} wei (${(Number(fees.maxFeePerGas) / 1e9).toFixed(3)} gwei)`)

  // 3. Send the ETH (skip if --register-only)
  let hash: Hex
  if (registerOnlyHash) {
    hash = registerOnlyHash
    console.log(`\n[register-only] using existing tx: ${hash}`)
  } else {
    if (balBefore < amountWei + parseEther("0.001")) {
      throw new Error("Wallet ETH too low for amount + gas headroom")
    }
    console.log(`\nSending ${amountStr} ETH → ${BUNDLER_ETH_ADDRESS} ...`)
    hash = await wallet.sendTransaction({
      to: BUNDLER_ETH_ADDRESS,
      value: amountWei,
      // Bump 50% over network estimate to ensure inclusion.
      maxFeePerGas: (fees.maxFeePerGas * 3n) / 2n,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas
        ? (fees.maxPriorityFeePerGas * 3n) / 2n
        : 1_000_000_000n, // 1 gwei tip floor
    })
    console.log(`tx hash            : ${hash}`)
  }

  // 4. Wait for confirmation
  console.log("waiting for receipt (12 confirmations) ...")
  const receipt = await pub.waitForTransactionReceipt({
    hash,
    confirmations: 12,
    pollingInterval: 4_000,
    timeout: 10 * 60_000,
  })
  console.log(`mined in block     : ${receipt.blockNumber}`)
  console.log(`status             : ${receipt.status}`)
  if (receipt.status !== "success") throw new Error("Funding tx reverted")

  // 5. Register with Irys bundler
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Uploader } = await import("@irys/upload")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Ethereum } = await import("@irys/upload-ethereum")
  const irys = await Uploader(Ethereum).withWallet(pk).withRpc(rpcUrl)
  console.log("\nregistering tx with Irys bundler ...")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (irys as any).funder.submitFundTransaction(hash)
  console.log("bundler response status:", res?.status, res?.statusText)

  // 6. Confirm credit
  const after = (await getIrysStatus()) as { loadedBalance: string }
  console.log("\nIrys status AFTER:", after)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
