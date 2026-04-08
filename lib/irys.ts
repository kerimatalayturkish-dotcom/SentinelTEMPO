import { getServerEnv } from "@/lib/env"

const GATEWAY = {
  devnet: "https://devnet.irys.xyz",
  mainnet: "https://gateway.irys.xyz",
} as const

async function getIrysUploader() {
  const { Uploader } = await import("@irys/upload")
  const { Ethereum } = await import("@irys/upload-ethereum")

  const env = getServerEnv()

  if (env.irysNetwork === "devnet") {
    return Uploader(Ethereum)
      .withWallet(env.irysPrivateKey)
      .withRpc(env.irysRpcUrl)
      .devnet()
  }

  return Uploader(Ethereum).withWallet(env.irysPrivateKey)
}

function gatewayUrl(id: string): string {
  const env = getServerEnv()
  const base = env.irysNetwork === "devnet" ? GATEWAY.devnet : GATEWAY.mainnet
  return `${base}/${id}`
}

export async function uploadImage(imageBuffer: Buffer): Promise<string> {
  const irys = await getIrysUploader()

  const receipt = await irys.upload(imageBuffer, {
    tags: [
      { name: "Content-Type", value: "image/png" },
      { name: "App-Name", value: "SentinelTEMPO" },
    ],
  })

  return gatewayUrl(receipt.id)
}

export async function uploadMetadata(metadata: {
  name: string
  description: string
  image: string
  attributes: { trait_type: string; value: string }[]
}): Promise<string> {
  const irys = await getIrysUploader()

  const receipt = await irys.upload(JSON.stringify(metadata), {
    tags: [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SentinelTEMPO" },
    ],
  })

  return gatewayUrl(receipt.id)
}
