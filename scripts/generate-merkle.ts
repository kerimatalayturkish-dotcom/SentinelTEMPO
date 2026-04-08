import { keccak256, encodePacked, concatHex, type Hex } from "viem"
import fs from "fs"
import path from "path"

const whitelistPath = path.resolve(__dirname, "../config/whitelist.json")
const whitelist: string[] = JSON.parse(fs.readFileSync(whitelistPath, "utf-8"))

// Match contract: keccak256(abi.encodePacked(address))
function hashLeaf(addr: string): Hex {
  return keccak256(encodePacked(["address"], [addr.toLowerCase() as `0x${string}`]))
}

function hashPair(a: Hex, b: Hex): Hex {
  // Sort pair to get deterministic ordering (same as OZ MerkleProof)
  return a < b
    ? keccak256(concatHex([a, b]))
    : keccak256(concatHex([b, a]))
}

function buildTree(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) throw new Error("Empty leaves")
  const layers: Hex[][] = [leaves.slice().sort()]
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1]
    const next: Hex[] = []
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(hashPair(current[i], current[i + 1]))
      } else {
        next.push(current[i]) // odd leaf promoted
      }
    }
    layers.push(next)
  }
  return layers
}

function getProof(layers: Hex[][], leaf: Hex): Hex[] {
  const proof: Hex[] = []
  let idx = layers[0].indexOf(leaf)
  if (idx === -1) throw new Error("Leaf not in tree")
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i]
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1
    if (siblingIdx < layer.length) {
      proof.push(layer[siblingIdx])
    }
    idx = Math.floor(idx / 2)
  }
  return proof
}

// Build
const leaves = whitelist.map(addr => hashLeaf(addr))
const layers = buildTree(leaves)
const root = layers[layers.length - 1][0]

console.log("Merkle Root:", root)
console.log("Whitelisted addresses:", whitelist.length)

// Save root
const rootPath = path.resolve(__dirname, "../config/merkle-root.json")
fs.writeFileSync(rootPath, JSON.stringify({ root }, null, 2))
console.log("Root saved to:", rootPath)

// Save proofs per address
const proofs: Record<string, string[]> = {}
for (const addr of whitelist) {
  const leaf = hashLeaf(addr)
  proofs[addr.toLowerCase()] = getProof(layers, leaf)
}
const proofsPath = path.resolve(__dirname, "../config/merkle-proofs.json")
fs.writeFileSync(proofsPath, JSON.stringify(proofs, null, 2))
console.log("Proofs saved to:", proofsPath)
