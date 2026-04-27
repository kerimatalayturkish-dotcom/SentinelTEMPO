"use client"

import { useEffect, useState } from "react"
import type { TraitSelection } from "@/lib/traits"
import { fetchJson } from "@/lib/fetch-json"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export type Layer = {
  id: string
  name: string
  order: number
  required: boolean
  options: { id: string; name: string; file: string }[]
}

export type Catalog = { layers: Layer[] }

export function TraitPicker({
  onTraitsChange,
  externalTraits,
  onCatalogLoaded,
}: {
  onTraitsChange: (traits: TraitSelection) => void
  externalTraits?: TraitSelection
  onCatalogLoaded?: (catalog: Catalog) => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<TraitSelection>({})

  useEffect(() => {
    fetchJson<Catalog>("/api/nft/traits")
      .then((data) => {
        setCatalog(data)
        onCatalogLoaded?.(data)
      })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from external (randomize button)
  useEffect(() => {
    if (externalTraits) setSelected(externalTraits)
  }, [externalTraits])

  useEffect(() => {
    onTraitsChange(selected)
  }, [selected, onTraitsChange])

  if (!catalog) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Loading traits...</p>
        </CardContent>
      </Card>
    )
  }

  const handleChange = (layerId: string, value: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (value === "") {
        delete next[layerId]
      } else {
        next[layerId] = value
      }
      return next
    })
  }

  // Display required layers first (Background, Body), then optional layers,
  // preserving array order within each group. Compose order is unaffected —
  // it still iterates `traitsConfig.layers` in array order so the back layer
  // renders behind the body silhouette.
  const orderedLayers = [
    ...catalog.layers.filter((l) => l.required),
    ...catalog.layers.filter((l) => !l.required),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Choose Traits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {orderedLayers.map((layer) => (
          <div key={layer.id}>
            <div className="flex items-center gap-2 mb-1.5">
              <label
                htmlFor={`layer-${layer.id}`}
                className="text-sm font-medium"
              >
                {layer.name}
              </label>
              {layer.required ? (
                <Badge variant="outline" className="text-[10px]">
                  Required
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  optional
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {layer.options.length} options
              </span>
            </div>
            <select
              id={`layer-${layer.id}`}
              value={selected[layer.id] ?? ""}
              onChange={(e) => handleChange(layer.id, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">
                {layer.required ? "— Select —" : "— None —"}
              </option>
              {layer.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
