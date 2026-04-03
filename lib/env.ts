function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

// Server-only env vars (called from API routes, not client components)
export function getServerEnv() {
  return {
    serverPrivateKey: requireEnv('SERVER_PRIVATE_KEY') as `0x${string}`,
    feePayerKey: requireEnv('FEE_PAYER_KEY') as `0x${string}`,
    treasuryWallet: requireEnv('NFT_TREASURY_WALLET') as `0x${string}`,
    irysPrivateKey: requireEnv('IRYS_PRIVATE_KEY') as `0x${string}`,
    irysNode: requireEnv('IRYS_NODE'),
  }
}
