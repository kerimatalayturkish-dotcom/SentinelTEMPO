// Constructor args for SentinelTEMPO verification (Sourcify / hardhat-verify).
// The constructor takes a single `Config` struct, which is encoded as a tuple.
// Update these values to match the exact values used at deploy time before
// running `npx hardhat verify --network <net> <addr> --constructor-args scripts/constructor-args.cjs`.
// MAINNET deploy values — keep in sync with .env.local MINT_* + addresses.
module.exports = [
  {
    paymentToken:  "0x20c0000000000000000000000000000000000000",                       // pathUSD on Tempo mainnet
    treasury:      "0x83bD0560e39d28Ae1dCb333f64736b6331d313Ed",                       // NFT_TREASURY_WALLET
    merkleRoot:    "0x36006011611eac96aaba565ac970537848e5e0170c304d7d9f264b130899c651", // 1,701-address production WL
    maxSupply:     10000,
    wlCap:         2000,
    agentCap:      3000,
    wlDuration:    10800, // 3h
    agentDuration: 10800, // 3h
    interval:      1800,  // 30m
    wlPrice:       2000000, // 2.00 pUSD (6 decimals)
    humanPrice:    4000000, // 4.00 pUSD
  },
]
