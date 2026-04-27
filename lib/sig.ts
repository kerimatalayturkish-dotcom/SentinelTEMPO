import { verifyMessage } from "viem"

/**
 * Thin wrapper around viem's EIP-191 `verifyMessage`.
 *
 * Used by `/api/nft/prepare` to authenticate a human mint request:
 * the wallet signs a canonical challenge string (address + traitHash + nonce),
 * the server verifies the signature came from the claimed address, and only
 * then spends Irys storage on the Irys upload.
 *
 * Always pass the EXACT same string the client signed — any whitespace diff
 * breaks verification.
 */
export async function verifyAddressSignature(params: {
  address: `0x${string}`
  message: string
  signature: `0x${string}`
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: params.address,
      message: params.message,
      signature: params.signature,
    })
  } catch {
    return false
  }
}

/**
 * Build the canonical message a human mint request must sign.
 *
 * Deliberately explicit so it's hard to confuse with any other signed
 * message in the app (phishing / replay protection).
 */
export function buildMintChallenge(params: {
  address: `0x${string}`
  traitHash: `0x${string}`
  nonce: string
  chainId: number
  contract: `0x${string}`
}): string {
  return [
    "SentinelTEMPO mint request",
    `address: ${params.address.toLowerCase()}`,
    `contract: ${params.contract.toLowerCase()}`,
    `chainId: ${params.chainId}`,
    `traitHash: ${params.traitHash.toLowerCase()}`,
    `nonce: ${params.nonce}`,
  ].join("\n")
}
