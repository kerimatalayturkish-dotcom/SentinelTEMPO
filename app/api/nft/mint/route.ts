import { NextResponse } from "next/server"
import { Mppx, tempo } from "mppx/nextjs"
import { privateKeyToAccount } from "viem/accounts"
import { createPublicClient, createWalletClient, http } from "viem"
import { getServerEnv } from "@/lib/env"
import { tempoChain, NFT_CONTRACT_ADDRESS, PATHUSD_ADDRESS } from "@/lib/chain"
import { validateTraits, getTraitAttributes, type TraitSelection } from "@/lib/traits"
import { composeImage } from "@/lib/compose"
import { uploadImage, uploadMetadata } from "@/lib/irys"
import { SENTINEL_ABI } from "@/lib/contract"

function createMppx() {
  const env = getServerEnv()
  return {
    env,
    mppx: Mppx.create({
      methods: [
        tempo.charge({
          currency: PATHUSD_ADDRESS,
          recipient: env.treasuryWallet,
          feePayer: env.feePayerKey
            ? privateKeyToAccount(env.feePayerKey)
            : undefined,
          testnet: false,
        }),
      ],
    }),
  }
}

export async function POST(request: Request) {
  const { env, mppx } = createMppx()
  const serverAccount = privateKeyToAccount(env.serverPrivateKey)

  const publicClient = createPublicClient({
    chain: tempoChain,
    transport: http(),
  })

  const walletClient = createWalletClient({
    account: serverAccount,
    chain: tempoChain,
    transport: http(),
  })

  const handler = mppx.charge({
    amount: "8",
  })(async () => {
  const { traits, recipient } = await request.json()

  // Validate recipient
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return NextResponse.json(
      { error: "Invalid recipient address" },
      { status: 400 },
    )
  }

  // Validate traits
  const validation = validateTraits(traits as TraitSelection)
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid traits", details: validation.errors },
      { status: 400 },
    )
  }

  // Get current supply for naming
  const totalSupply = await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "totalSupply",
  })

  // Compose image
  const imageBuffer = await composeImage(traits)
  const imageUrl = await uploadImage(imageBuffer)

  // Build and upload metadata
  const metadata = {
    name: `SentinelTEMPO #${totalSupply}`,
    description: "A Sentinel guarding the Tempo blockchain.",
    image: imageUrl,
    attributes: getTraitAttributes(traits),
  }
  const tokenURI = await uploadMetadata(metadata)

  // Mint on-chain via server wallet (mintTo)
  const txHash = await walletClient.writeContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: SENTINEL_ABI,
    functionName: "mintTo",
    args: [recipient as `0x${string}`, tokenURI],
  })

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

    return NextResponse.json({
      tokenId: Number(totalSupply),
      tokenURI,
      imageUrl,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      recipient,
      traits,
    })
  })

  return handler(request)
}
