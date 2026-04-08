"use client"

import { useState, useEffect } from "react"
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import type { TraitSelection } from "@/lib/traits"
import {
  NFT_CONTRACT_ADDRESS,
  PATHUSD_ADDRESS,
  WL_PRICE,
  PUBLIC_PRICE,
} from "@/lib/chain"
import { SENTINEL_ABI, PATHUSD_ABI } from "@/lib/contract"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type MintStep = "idle" | "preparing" | "approving" | "minting" | "confirming" | "done" | "error"

export function MintButton({ traits }: { traits: TraitSelection }) {
  const { address, isConnected } = useAccount()
  const [step, setStep] = useState<MintStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    tokenURI: string
    imageUrl: string
    txHash: string
  } | null>(null)

  // Check WL status
  const [isWhitelisted, setIsWhitelisted] = useState(false)
  const { data: wlAlreadyMinted } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "wlMinted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Determine price
  const canUseWl = isWhitelisted && !wlAlreadyMinted
  const price = canUseWl ? WL_PRICE : PUBLIC_PRICE

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: PATHUSD_ADDRESS,
    abi: PATHUSD_ABI,
    functionName: "allowance",
    args: address ? [address, NFT_CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address },
  })

  // Get WL proof
  const [proof, setProof] = useState<`0x${string}`[]>([])

  useEffect(() => {
    if (!address) return
    fetch(`/api/nft/wl/check?address=${address}`)
      .then((r) => r.json())
      .then((data) => setIsWhitelisted(data.whitelisted))
      .catch(() => setIsWhitelisted(false))
  }, [address])

  useEffect(() => {
    if (!address || !isWhitelisted) return
    fetch(`/api/nft/wl/proof?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.proof) setProof(data.proof)
      })
      .catch(() => {})
  }, [address, isWhitelisted])

  // Contract writes
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
  } = useWriteContract()

  const {
    writeContract: writeMint,
    data: mintHash,
    isPending: mintPending,
    error: mintError,
  } = useWriteContract()

  // Handle writeContract errors (rejected in wallet, gas estimation fail, etc.)
  useEffect(() => {
    if (approveError && step === "approving") {
      setStep("error")
      setError(approveError.message.split("\n")[0])
    }
  }, [approveError, step])

  useEffect(() => {
    if (mintError && (step === "minting" || step === "confirming")) {
      setStep("error")
      setError(mintError.message.split("\n")[0])
    }
  }, [mintError, step])

  // Wait for approve
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // Wait for mint
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({
    hash: mintHash,
  })

  // Handle approve confirmation → trigger mint
  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      refetchAllowance()
      executeMint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed])

  // Handle mint confirmation
  useEffect(() => {
    if (mintConfirmed && mintHash && step === "confirming") {
      setStep("done")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintConfirmed])

  const hasRequiredTraits = Object.keys(traits).length >= 3 // at least background, body, head

  async function handleMint() {
    if (!address) return
    setError(null)

    try {
      // Step 1: Prepare (compose + upload to Irys)
      setStep("preparing")
      const prepRes = await fetch("/api/nft/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits }),
      })
      if (!prepRes.ok) {
        const err = await prepRes.json()
        throw new Error(err.error || "Failed to prepare NFT")
      }
      const { tokenURI, imageUrl } = await prepRes.json()

      // Step 2: Check allowance, approve if needed
      const currentAllowance = allowance ?? 0n
      if (currentAllowance < price) {
        setStep("approving")
        writeApprove({
          address: PATHUSD_ADDRESS,
          abi: PATHUSD_ABI,
          functionName: "approve",
          args: [NFT_CONTRACT_ADDRESS, price],
          gas: 21_000_000n,
        })
        // The rest continues in the approveConfirmed effect
        // Store the tokenURI for the mint step
        setResult({ tokenURI, imageUrl, txHash: "" })
        return
      }

      // Already approved — go straight to mint
      setResult({ tokenURI, imageUrl, txHash: "" })
      executeMintWithUri(tokenURI)
    } catch (err) {
      setStep("error")
      setError(err instanceof Error ? err.message : "Mint failed")
    }
  }

  function executeMint() {
    if (result?.tokenURI) {
      executeMintWithUri(result.tokenURI)
    }
  }

  function executeMintWithUri(tokenURI: string) {
    setStep("minting")
    try {
      if (canUseWl) {
        writeMint({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "mintWhitelist",
          args: [proof, tokenURI],
          gas: 21_000_000n,
        })
      } else {
        writeMint({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "mintPublic",
          args: [tokenURI],
          gas: 21_000_000n,
        })
      }
      setStep("confirming")
      setResult((prev) => prev ? { ...prev, txHash: "" } : null)
    } catch (err) {
      setStep("error")
      setError(err instanceof Error ? err.message : "Mint transaction failed")
    }
  }

  // Update txHash when available
  useEffect(() => {
    if (mintHash && result) {
      setResult((prev) => prev ? { ...prev, txHash: mintHash } : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintHash])

  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL

  const stepLabels: Record<MintStep, string> = {
    idle: canUseWl ? "Mint (WL — 5 pathUSD)" : "Mint (8 pathUSD)",
    preparing: "Uploading to Irys...",
    approving: "Approve pathUSD in wallet...",
    minting: "Confirm mint in wallet...",
    confirming: "Waiting for confirmation...",
    done: "Minted!",
    error: "Try Again",
  }

  const isProcessing = step !== "idle" && step !== "done" && step !== "error"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Mint</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
          size="lg"
          disabled={!isConnected || !hasRequiredTraits || isProcessing || approvePending || mintPending}
          onClick={step === "done" || step === "error" ? () => setStep("idle") : handleMint}
        >
          {stepLabels[step]}
        </Button>

        {isProcessing && (
          <p className="text-sm text-muted-foreground animate-pulse">
            {stepLabels[step]}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {step === "done" && result && (
          <div className="space-y-2 text-sm">
            <p className="text-green-600 font-medium">Successfully minted!</p>
            {result.txHash && (
              <a
                href={`${explorerUrl}/tx/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline block"
              >
                View on Explorer
              </a>
            )}
            {result.imageUrl && (
              <a
                href={result.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline block"
              >
                View NFT Image
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
