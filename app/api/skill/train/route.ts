import { TRAIN_SKILL_MD } from "@/lib/train-skill"

export const runtime = "edge"

export async function GET() {
  return new Response(TRAIN_SKILL_MD, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
