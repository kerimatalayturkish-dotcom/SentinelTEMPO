"use client"

import { useEffect, useState } from "react"
import { useAccount } from "wagmi"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { fetchJson } from "@/lib/fetch-json"

type Status = "idle" | "checking" | "yes" | "no" | "error"

export function WhitelistCheckWidget() {
  const { address } = useAccount()
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [checked, setChecked] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!address) return
    void check(address)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  async function check(addr: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setStatus("error")
      setError("Enter a valid 0x… 40-hex address")
      return
    }
    setStatus("checking")
    setError("")
    setChecked(addr)
    try {
      const data = await fetchJson<{ whitelisted: boolean }>(`/api/nft/wl/check?address=${addr}`)
      setStatus(data.whitelisted ? "yes" : "no")
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Check failed")
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void check(input.trim())
  }

  return (
    <Card className="sentinel-card border-sentinel/10 bg-card/60 backdrop-blur-sm">
      <CardContent className="pt-5 px-5 pb-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-pixel text-[9px] text-sentinel">WHITELIST CHECK</h3>
          {address && (
            <span className="text-[7px] text-muted-foreground">
              connected: {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x… (or use connected wallet)"
            className="flex-1 px-2 py-1.5 text-[10px] rounded border border-sentinel/20 bg-background/60 focus:outline-none focus:border-sentinel/60"
          />
          <button
            type="submit"
            disabled={status === "checking" || !input}
            className="px-3 py-1.5 text-[9px] font-pixel rounded bg-sentinel hover:bg-sentinel/90 disabled:opacity-40 text-white"
          >
            {status === "checking" ? "…" : "CHECK"}
          </button>
        </form>

        {status === "yes" && (
          <div className="rounded border border-status-live/40 bg-status-live/10 px-3 py-2 flex items-center justify-between">
            <span className="text-[9px] text-status-live font-bold">
              ✓ Whitelisted
              {checked && (
                <span className="ml-2 text-[8px] text-muted-foreground font-normal">
                  {checked.slice(0, 6)}…{checked.slice(-4)}
                </span>
              )}
            </span>
            <Link href="/mint">
              <span className="text-[8px] underline text-status-live hover:text-status-live/80">
                Mint →
              </span>
            </Link>
          </div>
        )}
        {status === "no" && (
          <div className="rounded border border-muted-foreground/30 bg-muted/30 px-3 py-2">
            <span className="text-[9px] text-muted-foreground font-bold">
              ✗ Not whitelisted
            </span>
            <p className="text-[8px] text-muted-foreground mt-1">
              You can still mint in the public phase.
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2">
            <span className="text-[9px] text-destructive">{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
