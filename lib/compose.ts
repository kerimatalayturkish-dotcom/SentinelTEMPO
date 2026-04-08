import sharp from "sharp"
import path from "path"
import traitsConfig from "@/config/traits.json"
import { TraitSelection, getLayerFile } from "@/lib/traits"

const LAYERS_DIR = path.resolve(process.cwd(), "assets/layers")
const IMAGE_SIZE = 1024

export async function composeImage(selection: TraitSelection): Promise<Buffer> {
  // Collect layers in order
  const layers: sharp.OverlayOptions[] = []

  for (const layer of traitsConfig.layers) {
    const optionId = selection[layer.id]
    if (!optionId) continue

    const file = getLayerFile(layer.id, optionId)
    if (!file) continue

    const filePath = path.join(LAYERS_DIR, file)
    layers.push({ input: filePath })
  }

  if (layers.length === 0) {
    throw new Error("No layers selected")
  }

  // Start with the first layer (background) as base, composite the rest on top
  const [base, ...overlays] = layers

  const image = sharp(base.input as string)
    .resize(IMAGE_SIZE, IMAGE_SIZE)

  if (overlays.length > 0) {
    image.composite(overlays)
  }

  return image.png().toBuffer()
}
