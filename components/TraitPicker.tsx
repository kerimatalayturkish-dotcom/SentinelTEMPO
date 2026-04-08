"use client"

import { useEffect, useState } from "react"
import type { TraitSelection } from "@/lib/traits"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Layer = {
  id: string
  name: string
  order: number
  required: boolean
  options: { id: string; name: string; file: string }[]
}

type Catalog = { layers: Layer[] }

export function TraitPicker({
  onTraitsChange,
}: {
  onTraitsChange: (traits: TraitSelection) => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<TraitSelection>({})

  useEffect(() => {
    fetch("/api/nft/traits")
      .then((r) => r.json())
      .then((data) => setCatalog(data))
      .catch(console.error)
  }, [])

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Choose Traits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {catalog.layers.map((layer) => (
          <div key={layer.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">{layer.name}</span>
              {layer.required && (
                <Badge variant="outline" className="text-xs">
                  Required
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {layer.options.map((option) => {
                const isSelected = selected[layer.id] === option.id
                return (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [layer.id]: option.id,
                      }))
                    }
                  >
                    {option.name}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
