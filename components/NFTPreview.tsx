"use client"

import { useEffect, useState, useRef } from "react"
import type { TraitSelection } from "@/lib/traits"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function NFTPreview({ traits }: { traits: TraitSelection }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const hasTraits = Object.keys(traits).length > 0

  useEffect(() => {
    if (!hasTraits) {
      setImageUrl(null)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)

    fetch("/api/nft/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traits }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Preview failed")
        return res.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [traits, hasTraits])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
          {loading && (
            <Skeleton className="absolute inset-0" />
          )}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="NFT Preview"
              className="w-full h-full object-cover"
            />
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
