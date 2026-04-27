function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

/**
 * Server-only env vars (called from API routes, not client components).
 *
 * Keys are separated by role per audit decision 2026-04-21:
 *  - OWNER_PRIVATE_KEY: contract owner (cold; only for setMerkleRoot, setMinter, startMint, pause). Optional in dev.
 *  - SERVER_PRIVATE_KEY: authorised minter (hot; signs mintForAgent)
 *  - FEE_PAYER_KEY: sponsors MPP gas only
 *  - IRYS_PRIVATE_KEY: funds Irys node only
 *
 * Treasury is an ADDRESS ONLY — no key on server.
 */
export function getServerEnv() {
  return {
    // Wallet keys (role-separated)
    ownerPrivateKey: process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined,
    serverPrivateKey: requireEnv('SERVER_PRIVATE_KEY') as `0x${string}`,
    feePayerKey: requireEnv('FEE_PAYER_KEY') as `0x${string}`,
    irysPrivateKey: requireEnv('IRYS_PRIVATE_KEY') as `0x${string}`,

    // Addresses
    treasuryWallet: requireEnv('NFT_TREASURY_WALLET') as `0x${string}`,

    // Irys
    irysRpcUrl: requireEnv('IRYS_RPC_URL'),
    irysNetwork: (process.env.IRYS_NETWORK || 'devnet') as 'devnet' | 'mainnet',

    // MPP
    mppSecretKey: requireEnv('MPP_SECRET_KEY'),

    // Admin
    adminUsername: requireEnv('ADMIN_USERNAME'),
    adminPassword: requireEnv('ADMIN_PASSWORD'), // plaintext, compared in constant time
    jwtSecret: requireEnv('JWT_SECRET'),

    // Postgres
    databaseUrl: requireEnv('DATABASE_URL'),
  }
}

/**
 * Optional-variant used in contexts that should NOT crash at import time
 * if an env var is missing (e.g. build-time static analysis).
 */
export function getOptionalServerEnv() {
  return {
    ownerPrivateKey: process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined,
    serverPrivateKey: process.env.SERVER_PRIVATE_KEY as `0x${string}` | undefined,
    feePayerKey: process.env.FEE_PAYER_KEY as `0x${string}` | undefined,
    irysPrivateKey: process.env.IRYS_PRIVATE_KEY as `0x${string}` | undefined,
    treasuryWallet: process.env.NFT_TREASURY_WALLET as `0x${string}` | undefined,
    irysRpcUrl: process.env.IRYS_RPC_URL,
    irysNetwork: (process.env.IRYS_NETWORK || 'devnet') as 'devnet' | 'mainnet',
    mppSecretKey: process.env.MPP_SECRET_KEY,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL,
  }
}
