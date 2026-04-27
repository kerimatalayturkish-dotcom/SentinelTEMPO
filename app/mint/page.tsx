"use client"

import { WhitelistChecker } from "@/components/WhitelistChecker"
import { TraitPicker, type Catalog } from "@/components/TraitPicker"
import { NFTPreview } from "@/components/NFTPreview"
import { MintButton } from "@/components/MintButton"
import { RandomizeButton } from "@/components/RandomizeButton"
import { useState, useCallback, useEffect, useRef } from "react"
import type { TraitSelection } from "@/lib/traits"
import { fetchJson } from "@/lib/fetch-json"

type UniqueCheck = {
  unique: boolean
  number: string
  name: string
  traitHash: string
} | null

export default function MintPage() {
  const [selectedTraits, setSelectedTraits] = useState<TraitSelection>({})
  const [externalTraits, setExternalTraits] = useState<TraitSelection | undefined>()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [uniqueCheck, setUniqueCheck] = useState<UniqueCheck>(null)
  const [checking, setChecking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleTraitsChange = useCallback((t: TraitSelection) => setSelectedTraits(t), [])
  const handleCatalogLoaded = useCallback((c: Catalog) => setCatalog(c), [])
  const handleRandomize = useCallback((traits: TraitSelection) => {
    setExternalTraits(traits)
  }, [])

  // Check uniqueness whenever traits change (with debounce)
  useEffect(() => {
    setUniqueCheck(null)

    // Need at least background + body (2 required layers)
    const hasRequired = selectedTraits.background && selectedTraits.body
    if (!hasRequired) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const timer = setTimeout(() => {
      setChecking(true)
      fetchJson<UniqueCheck>("/api/nft/check-unique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits: selectedTraits }),
        signal: controller.signal,
      })
        .then((data) => setUniqueCheck(data))
        .catch((err) => {
          if (err.name !== "AbortError") console.error(err)
        })
        .finally(() => setChecking(false))
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [selectedTraits])

  return (
    <main className="container mx-auto max-w-6xl p-6">
      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-base sm:text-lg text-sentinel animate-text-glow">MINT</h1>
          <span className="text-[8px] text-muted-foreground">// deploy your sentinel</span>
        </div>
        <RandomizeButton catalog={catalog} onRandomize={handleRandomize} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <WhitelistChecker />
          <TraitPicker
            onTraitsChange={handleTraitsChange}
            externalTraits={externalTraits}
            onCatalogLoaded={handleCatalogLoaded}
          />
        </div>

        <div className="space-y-6">
          <NFTPreview
            traits={selectedTraits}
            name={uniqueCheck?.name ?? null}
            checking={checking}
            unique={uniqueCheck?.unique ?? null}
          />
          <MintButton traits={selectedTraits} disabled={uniqueCheck?.unique === false} />
        </div>
      </div>

    </main>
  )
}
