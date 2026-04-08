"use client"

import { useEffect, useState } from "react"

interface StatusData {
  totalSupply: number
  maxSupply: number
  remaining: number
  phase: string
  prices: { whitelist: string; public: string; currency: string }
}

export function SupplyCounter() {
  const [status, setStatus] = useState<StatusData | null>(null)

  useEffect(() => {
    fetch("/api/nft/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  if (!status) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-full rounded-full bg-muted animate-pulse" />
      </div>
    )
  }

  const pct = (status.totalSupply / status.maxSupply) * 100

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[9px]">
        <span className="font-mono text-sentinel">
          {status.totalSupply.toLocaleString()}
          <span className="text-muted-foreground"> / {status.maxSupply.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground">{status.remaining.toLocaleString()} left</span>
      </div>
      <div className="h-3 w-full rounded-full bg-sentinel/10 overflow-hidden relative">
        <div
          className="h-full rounded-full bg-sentinel transition-all duration-700 animate-pulse-glow"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <p className="text-[7px] text-muted-foreground text-center">
        {pct.toFixed(2)}% MINTED
      </p>
    </div>
  )
}
