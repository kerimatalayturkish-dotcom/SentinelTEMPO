"use client"

import { useState, useEffect } from "react"
import { useAccount, useChainId, useReadContract, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { computeTraitHash, type TraitSelection } from "@/lib/traits"
import {
  NFT_CONTRACT_ADDRESS,
  PATHUSD_ADDRESS,
  WL_PRICE,
  HUMAN_PRICE,
  Phase,
} from "@/lib/chain"
import { SENTINEL_ABI, PATHUSD_ABI } from "@/lib/contract"
import { fetchJson } from "@/lib/fetch-json"
import { buildMintChallenge } from "@/lib/sig"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type MintStep = "idle" | "signing" | "preparing" | "approving" | "minting" | "confirming" | "done" | "error"

export function MintButton({ traits, disabled }: { traits: TraitSelection; disabled?: boolean }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signMessageAsync } = useSignMessage()
  const [step, setStep] = useState<MintStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    tokenURI: string
    imageUrl: string
    traitHash: `0x${string}`
    txHash: string
  } | null>(null)

  // Fetch current phase from contract
  const { data: phaseRaw } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "currentPhase",
    query: { refetchInterval: 15_000 },
  })
  const phase = phaseRaw !== undefined ? Number(phaseRaw) : null

  // Human can only mint during WHITELIST and HUMAN_PUBLIC
  const isHumanPhase = phase === Phase.WHITELIST || phase === Phase.HUMAN_PUBLIC
  const isWlPhase = phase === Phase.WHITELIST

  // Check WL status
  const [isWhitelisted, setIsWhitelisted] = useState(false)
  const { data: wlAlreadyMinted } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "wlMinted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Check per-wallet human mint count
  const { data: humanMintCountRaw, refetch: refetchHumanMintCount } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "humanMintCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  const humanMints = humanMintCountRaw !== undefined ? Number(humanMintCountRaw) : 0

  // Check per-wallet max
  const { data: maxPerWalletRaw } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "PUBLIC_MAX_PER_WALLET",
    query: { refetchInterval: false },
  })
  const maxPerWallet = maxPerWalletRaw !== undefined ? Number(maxPerWalletRaw) : 5

  // Check total supply + max supply for sold-out
  const { data: totalSupplyRaw, refetch: refetchTotalSupply } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "totalSupply",
    query: { refetchInterval: 15_000 },
  })
  const { data: maxSupplyRaw } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "MAX_SUPPLY",
    query: { refetchInterval: false },
  })
  const totalSupply = totalSupplyRaw !== undefined ? Number(totalSupplyRaw) : 0
  const maxSupply = maxSupplyRaw !== undefined ? Number(maxSupplyRaw) : 0
  const isSoldOut = maxSupply > 0 && totalSupply >= maxSupply
  const walletLimitReached = phase === Phase.HUMAN_PUBLIC && humanMints >= maxPerWallet

  // During WL: need proof + WL check. During HUMAN_PUBLIC: anyone can mint (if under limits)
  const canMintWl = isWlPhase && isWhitelisted && !wlAlreadyMinted
  const canMintPublic = phase === Phase.HUMAN_PUBLIC && !walletLimitReached && !isSoldOut

  // Determine which function and price
  const mintFunction = canMintWl ? "mintWhitelist" : "mintPublic"
  const price = canMintWl ? WL_PRICE : HUMAN_PRICE

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
    fetchJson<{ whitelisted: boolean }>(`/api/nft/wl/check?address=${address}`)
      .then((data) => setIsWhitelisted(data.whitelisted))
      .catch((err) => {
        console.warn("WL check failed:", err)
        setIsWhitelisted(false)
      })
  }, [address])

  useEffect(() => {
    if (!address || !isWhitelisted) return
    fetchJson<{ proof?: `0x${string}`[] }>(`/api/nft/wl/proof?address=${address}`)
      .then((data) => {
        if (data.proof) setProof(data.proof)
      })
      .catch((err) => console.warn("WL proof fetch failed:", err))
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

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({
    hash: mintHash,
  })

  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      refetchAllowance()
      executeMint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed])

  useEffect(() => {
    if (mintConfirmed && mintHash && step === "confirming") {
      setStep("done")
      // Fire-and-forget: persist an off-chain receipt so /collection,
      // /collection/[tokenId], and /my-mints can show the source tx.
      // Server re-fetches the receipt from chain — no client trust.
      void fetch("/api/nft/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: mintHash }),
      }).catch((err) => console.warn("receipt persist failed:", err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintConfirmed])

  const hasRequiredTraits = Object.keys(traits).length >= 3

  // Determine if user can mint at all
  const canMint = isHumanPhase && (canMintWl || canMintPublic)

  // Phase-specific messaging
  function getPhaseMessage(): string | null {
    if (phase === null) return null
    if (phase === Phase.CLOSED) return "Minting has not started yet"
    if (phase === Phase.WL_AGENT_INTERVAL) return "Interval — minting resumes shortly"
    if (phase === Phase.AGENT_PUBLIC) return "AI Agent mint phase — human minting is paused"
    if (phase === Phase.AGENT_HUMAN_INTERVAL) return "Interval — human minting starts shortly"
    if (isWlPhase && wlAlreadyMinted) return "You already minted your WL allocation — wait for the public phase"
    if (isWlPhase && !isWhitelisted) return "Whitelist phase — your wallet is not whitelisted"
    if (isSoldOut) return "Sold out!"
    if (walletLimitReached) return `Wallet limit reached (${humanMints}/${maxPerWallet})`
    return null
  }

  async function handleMint() {
    if (!address || !canMint) return
    setError(null)

    try {
      // 1. Compute trait hash client-side (same function the server + contract see).
      const traitHash = computeTraitHash(traits)

      // 2. Sign the canonical challenge so the prepare endpoint trusts us.
      setStep("signing")
      const nonce = crypto.randomUUID()
      const message = buildMintChallenge({
        address,
        traitHash,
        nonce,
        chainId,
        contract: NFT_CONTRACT_ADDRESS,
      })
      const signature = await signMessageAsync({ message })

      // 3. Prepare: compose + pin to Irys.
      setStep("preparing")
      const prepRes = await fetch("/api/nft/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, traitHash, nonce, signature, traits }),
      })
      if (!prepRes.ok) {
        const err = await prepRes.json()
        throw new Error(err.error || "Failed to prepare NFT")
      }
      const { tokenURI, imageUrl } = await prepRes.json()

      const currentAllowance = allowance ?? 0n
      if (currentAllowance < price) {
        setStep("approving")
        writeApprove({
          address: PATHUSD_ADDRESS,
          abi: PATHUSD_ABI,
          functionName: "approve",
          args: [NFT_CONTRACT_ADDRESS, price],
        })
        setResult({ tokenURI, imageUrl, traitHash, txHash: "" })
        return
      }

      setResult({ tokenURI, imageUrl, traitHash, txHash: "" })
      executeMintWithUri(tokenURI, traitHash)
    } catch (err) {
      setStep("error")
      setError(err instanceof Error ? err.message : "Mint failed")
    }
  }

  function executeMint() {
    if (result?.tokenURI && result?.traitHash) {
      executeMintWithUri(result.tokenURI, result.traitHash)
    }
  }

  function executeMintWithUri(tokenURI: string, traitHash: `0x${string}`) {
    setStep("minting")
    try {
      if (canMintWl) {
        writeMint({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "mintWhitelist",
          args: [proof, tokenURI, traitHash],
        })
      } else {
        writeMint({
          address: NFT_CONTRACT_ADDRESS,
          abi: SENTINEL_ABI,
          functionName: "mintPublic",
          args: [tokenURI, traitHash],
        })
      }
      setStep("confirming")
      setResult((prev) => prev ? { ...prev, txHash: "" } : null)
    } catch (err) {
      setStep("error")
      setError(err instanceof Error ? err.message : "Mint transaction failed")
    }
  }

  // Refetch counts after successful mint
  useEffect(() => {
    if (step === "done") {
      refetchHumanMintCount()
      refetchTotalSupply()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    if (mintHash && result) {
      setResult((prev) => prev ? { ...prev, txHash: mintHash } : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintHash])

  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL

  const priceLabel = canMintWl ? "2 pathUSD (WL)" : "4 pathUSD"
  const stepLabels: Record<MintStep, string> = {
    idle: `Mint — ${priceLabel}`,
    signing: "Sign mint request in wallet...",
    preparing: "Uploading to Irys...",
    approving: "Approve pathUSD in wallet...",
    minting: "Confirm mint in wallet...",
    confirming: "Waiting for confirmation...",
    done: "Minted!",
    error: "Try Again",
  }

  const isProcessing = step !== "idle" && step !== "done" && step !== "error"
  const phaseMessage = getPhaseMessage()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Mint</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {phaseMessage && !canMint && (
          <p className="text-sm text-yellow-500">{phaseMessage}</p>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!isConnected || !hasRequiredTraits || !canMint || isProcessing || approvePending || mintPending || disabled}
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
