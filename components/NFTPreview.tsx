"use client"

import { useEffect, useState } from "react"
import type { TraitSelection } from "@/lib/traits"
import { fetchJson } from "@/lib/fetch-json"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Layer = {
  id: string
  name: string
  order: number
  required: boolean
  options: { id: string; name: string; file: string }[]
}

type Catalog = { layers: Layer[] }

interface NFTPreviewProps {
  traits: TraitSelection
  name: string | null
  checking: boolean
  unique: boolean | null
}

export function NFTPreview({ traits, name, checking, unique }: NFTPreviewProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)

  useEffect(() => {
    fetchJson<Catalog>("/api/nft/traits")
      .then((data) => setCatalog(data))
      .catch(console.error)
  }, [])

  const hasTraits = Object.keys(traits).length > 0

  // Build ordered list of layer image paths
  const layerImages: { key: string; src: string }[] = []
  if (catalog && hasTraits) {
    for (const layer of catalog.layers) {
      const optionId = traits[layer.id]
      if (!optionId) continue
      const option = layer.options.find((o) => o.id === optionId)
      if (!option) continue
      layerImages.push({
        key: `${layer.id}-${optionId}`,
        src: `/layers/${option.file}`,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">Preview</CardTitle>
          {checking && (
            <span className="text-[10px] text-muted-foreground animate-pulse">
              checking...
            </span>
          )}
          {!checking && unique === true && name && (
            <span className="text-[10px] text-green-500 font-medium">
              {name} — unique ✓
            </span>
          )}
          {!checking && unique === false && (
            <span className="text-[10px] text-red-500 font-medium">
              Combo already minted — change traits
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
          {layerImages.length > 0 ? (
            layerImages.map((layer) => (
              <img
                key={layer.key}
                src={layer.src}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                Select traits to see preview
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
