export const SENTINEL_ABI = [
  // ????????? Mint Functions ?????????
  {
    name: "mintWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes32[]" },
      { name: "uri", type: "string" },
      { name: "traitHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintPublic",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uri", type: "string" },
      { name: "traitHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintForAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "proof", type: "bytes32[]" },
      { name: "uri", type: "string" },
      { name: "traitHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },

  // ????????? View: Phase ?????????
  {
    name: "currentPhase",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "phaseInfo",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "phase", type: "uint8" },
      { name: "phaseEndsAt", type: "uint256" },
      { name: "phaseRemaining", type: "uint256" },
      { name: "_totalSupply", type: "uint256" },
      { name: "_wlSupply", type: "uint256" },
      { name: "_agentSupply", type: "uint256" },
    ],
  },

  // ????????? View: Immutable config ?????????
  {
    name: "paymentToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "treasury",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "MAX_SUPPLY",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "WL_CAP",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "AGENT_CAP",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "WL_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "AGENT_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "INTERVAL",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "WL_PRICE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "HUMAN_PRICE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "WL_MAX_PER_WALLET",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "PUBLIC_MAX_PER_WALLET",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "MAX_URI_LENGTH",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "MAX_PAUSES",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },

  // ????????? View: Supply ?????????
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "wlSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "agentSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "wlRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "agentRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },

  // ????????? View: Token + trait uniqueness ?????????
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "tokenTraitHash",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "usedTraitHash",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "traitHash", type: "bytes32" }],
    outputs: [{ type: "uint256" }], // tokenId + 1 (0 = unused)
  },
  {
    name: "isTraitHashUsed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "traitHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },

  // ????????? View: Per-Wallet ?????????
  {
    name: "wlMinted",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "agentMintCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "humanMintCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "minters",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },

  // ????????? View: Timing + pause ?????????
  {
    name: "mintStartTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "wlEndTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "agentEndTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "pausedAt",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalPausedDuration",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "pauseCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "merkleRoot",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },

  // ????????? Owner Functions ?????????
  {
    name: "startMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "emergencyPause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "unpause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setMerkleRoot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "setMinter",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "minter", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },

  // ????????? Events ?????????
  {
    name: "MintStarted",
    type: "event",
    anonymous: false,
    inputs: [{ name: "startTime", type: "uint256", indexed: false }],
  },
  {
    name: "PhaseAdvanced",
    type: "event",
    anonymous: false,
    inputs: [{ name: "phase", type: "uint8", indexed: true }],
  },
  {
    name: "Paused",
    type: "event",
    anonymous: false,
    inputs: [{ name: "pauseCount", type: "uint256", indexed: false }],
  },
  {
    name: "Unpaused",
    type: "event",
    anonymous: false,
    inputs: [{ name: "addedDuration", type: "uint256", indexed: false }],
  },
  {
    name: "MerkleRootUpdated",
    type: "event",
    anonymous: false,
    inputs: [{ name: "root", type: "bytes32", indexed: false }],
  },
  {
    name: "MinterUpdated",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "minter", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
    ],
  },
  {
    name: "AgentMint",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "traitHash", type: "bytes32", indexed: true },
    ],
  },
  {
    name: "TraitHashUsed",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "traitHash", type: "bytes32", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  {
    name: "Transfer",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const

export const PATHUSD_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const