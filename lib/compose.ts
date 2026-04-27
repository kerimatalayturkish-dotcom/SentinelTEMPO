import sharp from "sharp"
import path from "path"
import { fileURLToPath } from "url"
import traitsConfig from "@/config/traits.json"
import { TraitSelection, getLayerFile } from "@/lib/traits"

// Anchor to this module's directory so moves under .next/ or monorepo builds
// don't break when process.cwd() differs from the repo root.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const LAYERS_DIR = path.resolve(MODULE_DIR, "..", "assets", "layers")
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
    // Resize every overlay to match the base so sharp doesn't throw
    const resizedOverlays = await Promise.all(
      overlays.map(async (o) => ({
        input: await sharp(o.input as string)
          .resize(IMAGE_SIZE, IMAGE_SIZE)
          .toBuffer(),
      })),
    )
    image.composite(resizedOverlays)
  }

  return image.png().toBuffer()
}
