"use client"

import { CollectionGrid } from "@/components/CollectionGrid"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CollectionPage() {
  return (
    <main className="container mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-base sm:text-lg text-sentinel animate-text-glow">COLLECTION</h1>
          <span className="text-[8px] text-muted-foreground">// on-chain registry</span>
        </div>
        <Link href="/mint">
          <Button variant="outline" className="border-sentinel/30 hover:bg-sentinel/10 text-[9px]">Mint →</Button>
        </Link>
      </div>
      <CollectionGrid />
    </main>
  )
}
