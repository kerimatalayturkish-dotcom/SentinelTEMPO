"use client"

import { useAccount, useReadContract } from "wagmi"
import { useEffect, useState } from "react"
import { NFT_CONTRACT_ADDRESS, WL_PRICE_DISPLAY, HUMAN_PRICE_DISPLAY, Phase, PHASE_NAMES } from "@/lib/chain"
import { SENTINEL_ABI } from "@/lib/contract"
import { fetchJson } from "@/lib/fetch-json"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function WhitelistChecker() {
  const { address, isConnected } = useAccount()
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)

  const { data: wlAlreadyMinted } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "wlMinted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: mintPhase } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "currentPhase",
  })

  useEffect(() => {
    if (!address) {
      setIsWhitelisted(null)
      return
    }
    fetchJson<{ whitelisted: boolean }>(`/api/nft/wl/check?address=${address}`)
      .then((data) => setIsWhitelisted(data.whitelisted))
      .catch((err) => {
        console.warn("WL check failed:", err)
        setIsWhitelisted(false)
      })
  }, [address])

  if (!isConnected) return null

  const phase = mintPhase !== undefined ? Number(mintPhase) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">Mint Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {phase !== null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Phase:</span>
            <Badge variant={phase === Phase.CLOSED ? "destructive" : "secondary"}>
              {PHASE_NAMES[phase] ?? "Unknown"}
            </Badge>
          </div>
        )}

        {isWhitelisted === null ? (
          <p className="text-sm text-muted-foreground">Checking whitelist...</p>
        ) : isWhitelisted ? (
          <div className="space-y-1">
            <Badge className="bg-green-600">Whitelisted</Badge>
            {wlAlreadyMinted ? (
              <p className="text-sm text-muted-foreground">WL mint already used. Public mint: {HUMAN_PRICE_DISPLAY} pathUSD</p>
            ) : (
              <p className="text-sm text-muted-foreground">Mint for {WL_PRICE_DISPLAY} pathUSD</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <Badge variant="outline">Not Whitelisted</Badge>
            <p className="text-sm text-muted-foreground">Public mint: {HUMAN_PRICE_DISPLAY} pathUSD</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
