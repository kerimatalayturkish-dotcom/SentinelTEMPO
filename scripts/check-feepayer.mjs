import { readFileSync } from "fs"
import { createPublicClient, http, formatUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"

for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=['"]?(.*?)['"]?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const PATHUSD = process.env.NEXT_PUBLIC_PATHUSD_ADDRESS
const RPC = process.env.NEXT_PUBLIC_TEMPO_RPC_URL
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID)
const FEE_PAYER = process.env.FEE_PAYER_KEY
const SERVER = process.env.SERVER_PRIVATE_KEY
const TREASURY = process.env.NFT_TREASURY_WALLET

const k = (s) => (s.startsWith("0x") ? s : `0x${s}`)
const feePayerAddr = privateKeyToAccount(k(FEE_PAYER)).address
const serverAddr = privateKeyToAccount(k(SERVER)).address

const client = createPublicClient({ transport: http(RPC) })

const erc20 = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
]

async function bal(addr) {
  return client.readContract({ address: PATHUSD, abi: erc20, functionName: "balanceOf", args: [addr] })
}

console.log(`Chain: ${CHAIN_ID}  RPC: ${RPC}`)
console.log(`pathUSD: ${PATHUSD}`)
console.log("")
console.log(`Fee payer:  ${feePayerAddr}`)
console.log(`  pathUSD:  ${formatUnits(await bal(feePayerAddr), 6)}`)
console.log(`Server:     ${serverAddr}`)
console.log(`  pathUSD:  ${formatUnits(await bal(serverAddr), 6)}`)
console.log(`Treasury:   ${TREASURY}`)
console.log(`  pathUSD:  ${formatUnits(await bal(TREASURY), 6)}`)
