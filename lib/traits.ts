import { keccak256, toBytes } from "viem"
import traitsConfig from "@/config/traits.json"

export type Layer = typeof traitsConfig.layers[number]
export type TraitOption = Layer["options"][number]
export type TraitSelection = Record<string, string> // { layerId: optionId }

export function getTraitCatalog() {
  return traitsConfig
}

export function getLayer(layerId: string): Layer | undefined {
  return traitsConfig.layers.find(l => l.id === layerId)
}

export function validateTraits(selection: TraitSelection): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const layer of traitsConfig.layers) {
    const selectedOption = selection[layer.id]

    if (layer.required && !selectedOption) {
      errors.push(`Missing required layer: ${layer.name}`)
      continue
    }

    if (selectedOption) {
      const optionExists = layer.options.some(o => o.id === selectedOption)
      if (!optionExists) {
        errors.push(`Invalid option "${selectedOption}" for layer "${layer.name}"`)
      }
    }
  }

  // Check for unknown layers
  for (const layerId of Object.keys(selection)) {
    if (!traitsConfig.layers.some(l => l.id === layerId)) {
      errors.push(`Unknown layer: ${layerId}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function getLayerFile(layerId: string, optionId: string): string | null {
  const layer = traitsConfig.layers.find(l => l.id === layerId)
  if (!layer) return null
  const option = layer.options.find(o => o.id === optionId)
  return option ? option.file : null
}

export function getTraitAttributes(selection: TraitSelection) {
  return traitsConfig.layers
    .filter(layer => selection[layer.id])
    .map(layer => {
      const option = layer.options.find(o => o.id === selection[layer.id])
      return {
        trait_type: layer.name,
        value: option?.name ?? selection[layer.id],
      }
    })
}

/**
 * Deterministic keccak256 hash of a trait selection, returned as bytes32 hex.
 *
 * This is the SAME value that callers pass as the `traitHash` argument to
 * `mintWhitelist` / `mintPublic` / `mintForAgent`. Computed identically on
 * client and server so the server can check uniqueness off-chain before the
 * contract enforces it on-chain.
 *
 * Canonical form: layers in catalog order; each non-empty selection is
 * `"<layerId>:<optionId>"` joined by `"|"`.
 */
export function computeTraitHash(selection: TraitSelection): `0x${string}` {
  const parts: string[] = []
  for (const layer of traitsConfig.layers) {
    const opt = selection[layer.id]
    if (opt) parts.push(`${layer.id}:${opt}`)
  }
  return keccak256(toBytes(parts.join("|")))
}
