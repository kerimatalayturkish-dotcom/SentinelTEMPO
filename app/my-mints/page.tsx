"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useAccount } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { fetchJson } from "@/lib/fetch-json"

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explore.tempo.xyz"

interface Mint {
  tokenId: number
  txHash: string
  blockNumber: number
  tokenURI: string | null
  image: string | null
  name: string
}

export default function MyMintsPage() {
  const { address, isConnected } = useAccount()
  const [mints, setMints] = useState<Mint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!address) {
      setMints([])
      return
    }
    setLoading(true)
    setError("")
    fetchJson<{ mints?: Mint[] }>(`/api/nft/my-mints?address=${address}`)
      .then((data) => {
        setMints(data.mints || [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Lookup failed"))
      .finally(() => setLoading(false))
  }, [address])

  return (
    <main className="container mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-base sm:text-lg text-sentinel animate-text-glow">MY MINTS</h1>
          <span className="text-[8px] text-muted-foreground">// owned by your wallet</span>
        </div>
        <Link href="/mint">
          <Button variant="outline" className="border-sentinel/30 hover:bg-sentinel/10 text-[9px]">
            Mint →
          </Button>
        </Link>
      </div>

      {!isConnected && (
        <Card className="sentinel-card border-sentinel/10 bg-card/60">
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <p className="text-[10px] text-muted-foreground">
              Connect a wallet to see your SentinelTEMPO mints.
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      )}

      {isConnected && loading && (
        <p className="text-[10px] text-muted-foreground">Loading…</p>
      )}

      {isConnected && error && (
        <Card className="sentinel-card border-destructive/30 bg-destructive/5">
          <CardContent className="py-6">
            <p className="text-[10px] text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {isConnected && !loading && !error && mints.length === 0 && (
        <Card className="sentinel-card border-sentinel/10 bg-card/60">
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <p className="text-[10px] text-muted-foreground">
              No mints found for {address?.slice(0, 6)}…{address?.slice(-4)}.
            </p>
            <Link href="/mint">
              <Button className="bg-sentinel hover:bg-sentinel/90 text-[9px]">Mint your first →</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isConnected && mints.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {mints.map((m) => (
            <Card key={m.tokenId} className="sentinel-card border-sentinel/10 bg-card/60 overflow-hidden">
              <Link href={`/collection/${m.tokenId}`}>
                <div className="relative aspect-square bg-muted/30">
                  {m.image ? (
                    <Image
                      src={m.image}
                      alt={m.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[8px] text-muted-foreground">
                      no preview
                    </div>
                  )}
                </div>
              </Link>
              <CardContent className="p-3 space-y-1">
                <p className="text-[10px] font-bold text-foreground truncate">{m.name}</p>
                <p className="text-[8px] text-muted-foreground">#{m.tokenId}</p>
                {m.txHash && (
                  <a
                    href={`${EXPLORER}/tx/${m.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[8px] text-sentinel hover:underline block truncate"
                  >
                    tx: {m.txHash.slice(0, 8)}…{m.txHash.slice(-6)}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
