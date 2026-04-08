"use client"

import { useAccount } from "wagmi"
import { useReadContract } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { tempoChain, PATHUSD_ADDRESS, PATHUSD_DECIMALS } from "@/lib/chain"
import { PATHUSD_ABI } from "@/lib/contract"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function WalletConnect() {
  const { address, isConnected, chain } = useAccount()

  const { data: balance } = useReadContract({
    address: PATHUSD_ADDRESS,
    abi: PATHUSD_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const isWrongChain = isConnected && chain?.id !== tempoChain.id

  const formattedBalance =
    balance !== undefined
      ? (Number(balance) / 10 ** PATHUSD_DECIMALS).toFixed(2)
      : "..."

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Connect Wallet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ConnectButton showBalance={false} />
        {isConnected && !isWrongChain && (
          <p className="text-sm text-muted-foreground">
            pathUSD Balance:{" "}
            <span className="font-medium text-foreground">
              {formattedBalance}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
