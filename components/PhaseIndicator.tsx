"use client"

import { useEffect, useState } from "react"

const phaseConfig: Record<string, { label: string; color: string; glow: string }> = {
  closed: { label: "CLOSED", color: "text-muted-foreground", glow: "" },
  whitelist: { label: "WHITELIST", color: "text-yellow-400", glow: "shadow-[0_0_8px_rgba(250,204,21,0.3)]" },
  public: { label: "PUBLIC", color: "text-status-live", glow: "shadow-[0_0_8px_rgba(0,255,102,0.3)]" },
}

export function PhaseIndicator() {
  const [phase, setPhase] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/nft/status")
      .then((r) => r.json())
      .then((d) => setPhase(d.phase))
      .catch(() => {})
  }, [])

  if (!phase) return null

  const config = phaseConfig[phase] || phaseConfig.closed

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-current/10 ${config.glow}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${config.color === "text-muted-foreground" ? "bg-muted-foreground" : ""}`}
        style={{
          backgroundColor: phase === "whitelist" ? "#facc15" : phase === "public" ? "#00ff66" : undefined,
          boxShadow: phase !== "closed" ? `0 0 6px currentColor` : undefined,
        }}
      />
      <span className={`text-[8px] font-bold ${config.color}`}>
        {config.label}
      </span>
      {phase !== "closed" && (
        <span className="text-[8px] text-muted-foreground animate-blink">●</span>
      )}
    </div>
  )
}
