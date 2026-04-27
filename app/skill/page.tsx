import { promises as fs } from "fs"
import path from "path"

export default async function SkillPage() {
  const filePath = path.join(process.cwd(), "SKILL.md")
  const content = await fs.readFile(filePath, "utf-8")

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <h1 className="font-pixel text-sm text-sentinel mb-6">AI Agent Mint Skill</h1>
      <div className="rounded-xl border border-foreground/10 bg-muted/50 p-6 overflow-x-auto">
        <pre className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-foreground/90">
          {content}
        </pre>
      </div>
    </main>
  )
}
