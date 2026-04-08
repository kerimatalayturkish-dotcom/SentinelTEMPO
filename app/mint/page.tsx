"use client"

import { WhitelistChecker } from "@/components/WhitelistChecker"
import { TraitPicker } from "@/components/TraitPicker"
import { NFTPreview } from "@/components/NFTPreview"
import { MintButton } from "@/components/MintButton"
import { useState, useCallback } from "react"
import type { TraitSelection } from "@/lib/traits"

export default function MintPage() {
  const [selectedTraits, setSelectedTraits] = useState<TraitSelection>({})
  const handleTraitsChange = useCallback((t: TraitSelection) => setSelectedTraits(t), [])

  return (
    <main className="container mx-auto max-w-6xl p-6">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="font-pixel text-base sm:text-lg text-sentinel animate-text-glow">MINT</h1>
        <span className="text-[8px] text-muted-foreground">// deploy your sentinel</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <WhitelistChecker />
          <TraitPicker onTraitsChange={handleTraitsChange} />
        </div>

        <div className="space-y-6">
          <NFTPreview traits={selectedTraits} />
          <MintButton traits={selectedTraits} />
        </div>
      </div>
    </main>
  )
}
