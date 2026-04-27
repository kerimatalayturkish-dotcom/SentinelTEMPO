"use client"

import { useEffect, useState } from "react"
import { fetchJson } from "@/lib/fetch-json"

interface StatusData {
  phase: string
  phaseEndsAt: number
  phaseRemaining: number
  totalSupply: number
  wlSupply: number
  agentSupply: number
  paused: boolean
}

const phaseConfig: Record<string, { label: string; color: string; glow: string }> = {
  closed: { label: "NOT STARTED", color: "text-muted-foreground", glow: "" },
  whitelist: { label: "WHITELIST", color: "text-yellow-400", glow: "shadow-[0_0_8px_rgba(250,204,21,0.3)]" },
  wl_agent_interval: { label: "INTERVAL", color: "text-orange-400", glow: "shadow-[0_0_8px_rgba(251,146,60,0.2)]" },
  agent_public: { label: "AGENT MINT", color: "text-blue-400", glow: "shadow-[0_0_8px_rgba(96,165,250,0.3)]" },
  agent_human_interval: { label: "INTERVAL", color: "text-orange-400", glow: "shadow-[0_0_8px_rgba(251,146,60,0.2)]" },
  human_public: { label: "PUBLIC MINT", color: "text-status-live", glow: "shadow-[0_0_8px_rgba(0,255,102,0.3)]" },
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function PhaseIndicator() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [countdown, setCountdown] = useState<number>(0)

  useEffect(() => {
    function fetchStatus() {
      fetchJson<StatusData>("/api/nft/status")
        .then((d) => {
          setStatus(d)
          if (d.phaseEndsAt > 0) {
            setCountdown(d.phaseEndsAt - Math.floor(Date.now() / 1000))
          } else {
            setCountdown(0)
          }
        })
        .catch((err) => console.warn("Status poll failed:", err))
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 15_000)
    return () => clearInterval(interval)
  }, [])

  // Tick countdown every second
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  if (!status) return null

  const config = phaseConfig[status.phase] || phaseConfig.closed
  const isActive = status.phase !== "closed"
  const dotColor = {
    whitelist: "#facc15",
    agent_public: "#60a5fa",
    human_public: "#00ff66",
    wl_agent_interval: "#fb923c",
    agent_human_interval: "#fb923c",
  }[status.phase]

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-current/10 ${config.glow}`}>
      <span
        className={`inline-block w-2 h-2 rounded-full ${!isActive ? "bg-muted-foreground" : ""}`}
        style={{
          backgroundColor: dotColor,
          boxShadow: isActive ? `0 0 6px currentColor` : undefined,
        }}
      />
      <span className={`text-[8px] font-bold ${config.color}`}>
        {status.paused ? "PAUSED" : config.label}
      </span>
      {isActive && countdown > 0 && (
        <span className="text-[8px] text-muted-foreground font-mono">
          {formatCountdown(countdown)}
        </span>
      )}
      {isActive && !status.paused && (
        <span className="text-[8px] text-muted-foreground animate-blink">●</span>
      )}
    </div>
  )
}
