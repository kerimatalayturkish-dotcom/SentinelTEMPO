import merkleProofs from "@/config/merkle-proofs.json"

const proofs = merkleProofs as Record<string, string[]>

export function isWhitelisted(address: string): boolean {
  return address.toLowerCase() in proofs
}

export function getMerkleProof(address: string): string[] | null {
  const proof = proofs[address.toLowerCase()]
  return proof ?? null
}
