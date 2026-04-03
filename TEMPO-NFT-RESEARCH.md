# NFTs on Tempo — Research Report

> **Date**: March 29, 2026  
> **Status**: Research complete — no code implementation yet  
> **Network**: Tempo Mainnet (`rpc.tempo.xyz`) + Testnet Moderato (`rpc.moderato.tempo.xyz`)

---

## 1. Tempo EVM Compatibility for NFTs

Tempo targets the **Osaka EVM hard fork** — standard ERC-721 Solidity contracts deploy and work as-is. There is **no Tempo-specific NFT standard** (no "TIP-721"). You deploy a regular ERC-721 contract using Foundry, Hardhat, or any EVM toolchain.

### Key Tempo Quirks Affecting NFTs

| Aspect | Detail |
|--------|--------|
| **No native gas token** | Fees are paid in pathUSD or any TIP-20 stablecoin. Non-TIP-20 contract interactions (like ERC-721) default to pathUSD for fees. |
| **Higher state creation costs** | New storage slots: **250,000 gas** (vs 20,000 on Ethereum). Contract creation: **1,000 gas/byte** (vs 200). NFT deployment costs ~5-10x more gas than Ethereum, but gas is cheap on Tempo. |
| **No `msg.value`** | `CALLVALUE` always returns 0. NFT minting payments must use ERC-20 `transferFrom` pattern instead of `msg.value`. |
| **`eth_getBalance` quirk** | Returns an extremely large number (`4.24e75`). Don't use it for balance checks. |
| **Sub-second finality** | ~0.58s block time, deterministic finality (Simplex BFT consensus). |
| **Predeployed utilities** | CreateX (`0xba5E...`), Arachnid Create2 Factory, Multicall3, Permit2 all available. |

---

## 2. Reference NFT Contract: "Punk On Tempo"

**Contract**: `0xf5084BACA3bDdf7efF5f7d25FAB8A1618b5a9ABc`  
**Explorer**: https://explore.tempo.xyz/address/0xf5084BACA3bDdf7efF5f7d25FAB8A1618b5a9ABc?tab=interact  
**Network**: Tempo Mainnet

### Contract State (as of March 29, 2026)

| Property | Value |
|----------|-------|
| **Name** | Punk On Tempo |
| **Symbol** | PUNK |
| **Total Supply** | 3,348 minted |
| **Max Supply** | 10,000 (from metadata) |
| **Mint Price** | 1 pathUSD (1,000,000 raw / 1e6 decimals) |
| **Payment Token** | pathUSD (`0x20c0000000000000000000000000000000000000`) |
| **Owner** | `0x1f84662eECF70D2b125BAD2837fE37cd91C0Aabc` |
| **Mint Open** | `false` (currently closed) |
| **Revealed** | `true` |
| **Founder Allocation** | 155 |
| **Founder Minted** | 1 |
| **Metadata Storage** | Irys (Arweave gateway) |
| **Provenance Locked** | `false` |

### Interface Support

| Interface | Supported |
|-----------|-----------|
| ERC-165 | Yes |
| ERC-721 | Yes |
| ERC-721Metadata | Yes |
| ERC-721Enumerable | No |
| ERC-2981 (Royalties) | No |

### Sample Token Metadata (Token #1)

```json
{
  "name": "Punk On Tempo #1",
  "description": "One of 10,000 punks living on the Tempo blockchain.",
  "image": "https://gateway.irys.xyz/8UaAsH44pJ3b7GN5PVk8j4ucRr273Efcum6p44m4E41F/1.png",
  "attributes": [
    { "trait_type": "background", "value": "gris clair" },
    { "trait_type": "original index", "value": 1 }
  ]
}
```

Token URI pattern: `https://gateway.irys.xyz/7mCpwHDgRCvxDAzZJTgUtevLNvHKaLktqb1DPBVEpniK/{tokenId}.json`

---

## 3. Contract Functions (Full ABI)

### Write Functions

| Function | Description |
|----------|-------------|
| `mint(uint256 quantity)` | Public mint — pay `MINT_PRICE × quantity` in pathUSD |
| `founderMint(address to, uint256 quantity)` | Owner-only mint to any address (from `FOUNDER_ALLOCATION`) |
| `setMintOpen(bool open)` | Toggle public minting on/off |
| `reveal(string baseURI)` | Set revealed metadata base URI (one-time) |
| `setUnrevealedURI(string uri)` | Set placeholder URI before reveal |
| `setProvenanceHash(string hash)` | Set provenance hash for fairness verification |
| `withdraw()` | Owner withdraws collected pathUSD |
| `transferOwnership(address newOwner)` | Transfer contract ownership |
| `renounceOwnership()` | Renounce ownership permanently |
| `approve(address to, uint256 tokenId)` | Standard ERC-721 approve |
| `setApprovalForAll(address operator, bool approved)` | Standard ERC-721 operator approval |
| `transferFrom(address from, address to, uint256 tokenId)` | Standard ERC-721 transfer |
| `safeTransferFrom(address from, address to, uint256 tokenId)` | Safe transfer variant 1 |
| `safeTransferFrom(address from, address to, uint256 tokenId, bytes data)` | Safe transfer variant 2 |

### Read Functions

| Function | Return Value |
|----------|-------------|
| `name()` | "Punk On Tempo" |
| `symbol()` | "PUNK" |
| `totalSupply()` | 3348 |
| `MAX_SUPPLY()` | 10000 |
| `MINT_PRICE()` | 1000000 (= 1 pathUSD) |
| `FOUNDER_ALLOCATION()` | 155 |
| `founderMinted()` | 1 |
| `mintOpen()` | false |
| `revealed()` | true |
| `paymentToken()` | `0x20c0...` (pathUSD) |
| `owner()` | deployer address |
| `tokenURI(uint256 tokenId)` | Irys metadata URL |
| `ownerOf(uint256 tokenId)` | Owner of a specific token |
| `balanceOf(address owner)` | Token count for address |
| `provenanceHash()` | Hash string |
| `provenanceLocked()` | bool |
| `supportsInterface(bytes4 interfaceId)` | ERC-165 check |
| `getApproved(uint256 tokenId)` | Approved address |
| `isApprovedForAll(address owner, address operator)` | Operator approval |

---

## 4. On-Chain Activity Analysis

| Metric | Value |
|--------|-------|
| Total Transfer events | 2,535 |
| Mints (from 0x0) | 593 |
| Secondary transfers | 1,942 |
| Unique minters | 37 wallets |
| First mint block | 10,602,182 (~9 days ago) |
| Contract age | ~9 days |
| Burn address | `0x...dead` (token #1 owner) |

---

## 5. How Minting Works on Tempo

The mint flow is standard ERC-721, but **payment is in pathUSD** (not ETH):

1. User must hold **pathUSD** (`0x20c0...`) — Tempo's native stablecoin
2. User must **approve** the NFT contract to spend `MINT_PRICE × quantity` of pathUSD
3. User calls `mint(quantity)` — contract pulls pathUSD via `transferFrom`, mints NFT(s) to caller
4. Transaction **fees** are also paid in pathUSD (since ERC-721 is not a TIP-20 token, it falls back to pathUSD)

### Typical Mint Flow (Solidity Pattern)

```solidity
// In the NFT contract:
function mint(uint256 quantity) external {
    require(mintOpen, "Mint not open");
    require(totalSupply() + quantity <= MAX_SUPPLY, "Exceeds max");
    
    // Pull payment in pathUSD (ERC-20 transferFrom, NOT msg.value)
    IERC20(paymentToken).transferFrom(msg.sender, address(this), MINT_PRICE * quantity);
    
    for (uint256 i = 0; i < quantity; i++) {
        _mint(msg.sender, _nextTokenId++);
    }
}
```

---

## 6. How to Create an NFT Collection on Tempo

### Step-by-step

1. **Write a standard ERC-721 Solidity contract** — OpenZeppelin's ERC721 works fine
2. **Key difference**: Accept payment in a TIP-20 token (pathUSD) instead of `msg.value` (no native token on Tempo)
3. **Deploy** via Foundry/Hardhat targeting:
   - Mainnet: `https://rpc.tempo.xyz` (Chain ID: 42069)
   - Testnet: `https://rpc.moderato.tempo.xyz` (Chain ID: 42431)
4. **Budget extra gas** — contract deployment costs ~5-10x more gas than Ethereum due to state creation costs
5. **Metadata** — store on Irys/Arweave/IPFS as usual, set via `reveal()` or constructor
6. **Fees** — deployer wallet needs pathUSD to pay deployment fees

### Deployment Tools Available on Tempo

| Tool | Address | Use |
|------|---------|-----|
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` | Deterministic deployment |
| Arachnid Create2 | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | CREATE2 proxy |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | Batch calls |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` | Token approvals |

---

## 7. Key Differences from Ethereum NFTs

| Aspect | Ethereum | Tempo |
|--------|----------|-------|
| **Payment** | ETH via `msg.value` | pathUSD via ERC-20 `transferFrom` (requires prior approval) |
| **Gas token** | ETH | pathUSD (or any TIP-20 stablecoin) |
| **Deploy cost** | ~$5-50 in ETH | Higher gas units but USD-denominated (cheap in practice) |
| **Finality** | ~12 minutes | Deterministic, sub-second |
| **Block time** | ~12 seconds | ~0.58 seconds |
| **NFT standard** | ERC-721 | ERC-721 (identical, no Tempo-specific standard) |
| **Marketplace** | OpenSea, Blur, etc. | No established marketplace yet |
| **`msg.value`** | Used for mint payment | Always 0 — must use ERC-20 pattern |
| **State costs** | 20k gas/slot | 250k gas/slot |

---

## 8. Open Questions for the Project

- [ ] Is there a Tempo NFT marketplace or do we need to build one?
- [ ] What's the gas cost in USD to deploy a 10k collection contract?
- [ ] Can we use ERC-721A (Azuki) for batch-efficient minting on Tempo?
- [ ] Does Tempo support ERC-1155 (multi-token) as well?
- [ ] Royalty enforcement — no ERC-2981 on the reference contract. Is there a Tempo-native approach?
- [ ] What's the metadata storage strategy? (Irys/Arweave seems to be the pattern used by Punk On Tempo)
