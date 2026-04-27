"use client"

import { useState } from "react"
import { fetchJson } from "@/lib/fetch-json"
import type { Catalog } from "@/components/TraitPicker"
import type { TraitSelection } from "@/lib/traits"

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateRandomTraits(catalog: Catalog): TraitSelection {
  const traits: TraitSelection = {}
  for (const layer of catalog.layers) {
    if (layer.options.length === 0) continue
    if (layer.required) {
      // Always pick for required layers
      traits[layer.id] = pickRandom(layer.options).id
    } else {
      // ~65% chance of including an optional layer
      if (Math.random() < 0.65) {
        traits[layer.id] = pickRandom(layer.options).id
      }
    }
  }
  return traits
}

export function RandomizeButton({
  catalog,
  onRandomize,
}: {
  catalog: Catalog | null
  onRandomize: (traits: TraitSelection) => void
}) {
  const [rolling, setRolling] = useState(false)

  const handleClick = async () => {
    if (!catalog || rolling) return
    setRolling(true)

    const MAX_ATTEMPTS = 10
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const traits = generateRandomTraits(catalog)

      try {
        const data = await fetchJson<{ unique: boolean }>("/api/nft/check-unique", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traits }),
        })

        if (data.unique) {
          onRandomize(traits)
          setRolling(false)
          return
        }
        // Not unique — try again
      } catch {
        // Network error — use the traits anyway, uniqueness check on mint will catch it
        onRandomize(traits)
        setRolling(false)
        return
      }
    }

    // Exhausted retries (extremely unlikely) — use last generated set
    onRandomize(generateRandomTraits(catalog))
    setRolling(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={!catalog || rolling}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-sentinel/40 bg-sentinel/10 text-sentinel font-pixel text-[9px] tracking-wider hover:bg-sentinel/20 hover:border-sentinel/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className={rolling ? "animate-spin" : ""}>🎲</span>
      {rolling ? "ROLLING..." : "RANDOMIZE"}
    </button>
  )
}
