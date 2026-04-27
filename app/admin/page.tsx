"use client"

import { useState, useEffect, useCallback } from "react"

interface ContractStatus {
  contract: {
    address: string
    treasury: string
    serverMinter: string | null
    ownerSigner: string | null
    ownerConfigured: boolean
    merkleRoot: string
    phase: string
    phaseIndex: number
    phaseEndsAt: number
    phaseRemaining: number
    paused: boolean
    pausedAt: number
    totalPausedDuration: number
    pauseCount: number
    maxPauses: number
    mintStartTime: number
    wlEndTime: number
    agentEndTime: number
  }
  constants: {
    maxSupply: number
    wlCap: number
    agentCap: number
    humanCap: number
    wlPrice: string
    humanPrice: string
    wlMaxPerWallet: number
    publicMaxPerWallet: number
  }
  supply: {
    total: number
    max: number
    wl: number
    wlCap: number
    agent: number
    agentCap: number
    human: number
    remaining: number
  }
  balances: {
    treasuryPathUsd: string | null
    serverPathUsd: string | null
  }
  refundQueue: {
    unsettled: number
    total: number
  }
  timing: {
    now: number
    mintStarted: boolean
    wlEnded: boolean
    agentEnded: boolean
  }
}

interface RefundRow {
  id: number
  agent: string
  amount: string
  mpp_tx: string | null
  reason: string | null
  created_at: number
  settled: boolean
  settled_at: number | null
  settled_tx: string | null
}

interface WalletHistory {
  address: string
  counters: {
    wlMinted: boolean
    agentMints: number
    humanMints: number
    totalMints: number
  }
  mints: Array<{
    tokenId: number
    mintTxHash: string
    mintSigner: string | null
    blockNumber: number
    mintedAt: number
    kind: "wl_human" | "public_human" | "wl_agent" | "agent_public" | null
    treasuryReceive: {
      txHash: string
      payer: string | null
      feePayer: string | null
      amount: string | null
      source: "in_mint_tx" | "mpp"
    } | null
  }>
  lookbackFromBlock: number
  lookbackToBlock: number
}

interface IrysStatus {
  address: string
  network: "devnet" | "mainnet"
  token: string
  loadedBalanceAtomic: string
  loadedBalance: string
  estimate: {
    bytes: number
    priceAtomic: string
    price: string
    estimatedMintsRemaining: number | null
  } | null
}

const PHASE_COLORS: Record<string, string> = {
  closed: "bg-gray-500",
  whitelist: "bg-yellow-500",
  wl_agent_interval: "bg-orange-500",
  agent_public: "bg-blue-500",
  agent_human_interval: "bg-orange-500",
  human_public: "bg-green-500",
}

const PHASE_LABELS: Record<string, string> = {
  closed: "CLOSED",
  whitelist: "WHITELIST",
  wl_agent_interval: "WL → AGENT INTERVAL",
  agent_public: "AGENT PUBLIC",
  agent_human_interval: "AGENT → HUMAN INTERVAL",
  human_public: "HUMAN PUBLIC",
}

function formatTime(ts: number): string {
  if (ts === 0) return "—"
  return new Date(ts * 1000).toLocaleString()
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [status, setStatus] = useState<ContractStatus | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [fetchError, setFetchError] = useState("")
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [refundFilter, setRefundFilter] = useState<"unsettled" | "settled" | "all">("unsettled")
  const [refundError, setRefundError] = useState("")
  const [settlingId, setSettlingId] = useState<number | null>(null)
  const [pauseBusy, setPauseBusy] = useState(false)
  const [pauseError, setPauseError] = useState("")
  const [walletQuery, setWalletQuery] = useState("")
  const [walletData, setWalletData] = useState<WalletHistory | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletError, setWalletError] = useState("")
  const [irysStatus, setIrysStatus] = useState<IrysStatus | null>(null)
  const [irysError, setIrysError] = useState("")
  const [irysAmount, setIrysAmount] = useState("")
  const [irysBusy, setIrysBusy] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/status")
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setStatus(data)
      setFetchError("")
      if (data.contract.phaseEndsAt > 0) {
        setCountdown(data.contract.phaseEndsAt - data.timing.now)
      } else {
        setCountdown(0)
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error")
    }
  }, [])

  const fetchRefunds = useCallback(async (filter: "unsettled" | "settled" | "all") => {
    try {
      const res = await fetch(`/api/admin/refunds?filter=${filter}`)
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      if (!res.ok) throw new Error("Failed to fetch refunds")
      const data = await res.json()
      setRefunds(data.refunds ?? [])
      setRefundError("")
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Error")
    }
  }, [])

  async function handleSettle(id: number) {
    const settledTx = window.prompt(
      `Settle refund #${id}\n\nPaste the on-chain settlement tx hash (0x + 64 hex), or leave blank to mark settled without a tx.`,
      "",
    )
    if (settledTx === null) return // cancelled
    setSettlingId(id)
    try {
      const res = await fetch("/api/admin/refunds/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, settledTx: settledTx.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Settle failed")
      await fetchRefunds(refundFilter)
      await fetchStatus()
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Settle failed")
    } finally {
      setSettlingId(null)
    }
  }

  async function handlePauseAction(action: "pause" | "unpause") {
    if (!status) return
    const verb = action === "pause" ? "PAUSE" : "UNPAUSE"
    const tail =
      action === "pause"
        ? `\n\nThis halts ALL minting (WL, agent, public) and consumes 1 of ${status.contract.maxPauses} pause slots (currently ${status.contract.pauseCount} used).`
        : "\n\nThis resumes minting and shifts every phase deadline by the paused duration."
    if (!window.confirm(`Are you sure you want to ${verb} the contract?${tail}`)) return

    setPauseBusy(true)
    setPauseError("")
    try {
      const res = await fetch("/api/admin/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${action} failed`)
      await fetchStatus()
    } catch (err) {
      setPauseError(err instanceof Error ? err.message : `${action} failed`)
    } finally {
      setPauseBusy(false)
    }
  }

  async function handleWalletLookup(e: React.FormEvent) {
    e.preventDefault()
    const addr = walletQuery.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setWalletError("Enter a valid 0x… 40-hex address")
      return
    }
    setWalletBusy(true)
    setWalletError("")
    try {
      const res = await fetch(`/api/admin/wallet?address=${addr}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Lookup failed")
      setWalletData(data)
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Lookup failed")
      setWalletData(null)
    } finally {
      setWalletBusy(false)
    }
  }

  const fetchIrys = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/irys")
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Irys status failed")
      setIrysStatus(data)
      setIrysError("")
    } catch (err) {
      setIrysError(err instanceof Error ? err.message : "Irys status failed")
    }
  }, [])

  async function handleIrysFund(e: React.FormEvent) {
    e.preventDefault()
    const amt = irysAmount.trim()
    if (!/^\d+(\.\d+)?$/.test(amt) || Number(amt) <= 0) {
      setIrysError("Enter a positive token amount (e.g. 0.05)")
      return
    }
    if (!window.confirm(
      `Fund the Irys uploader with ${amt} ${irysStatus?.token ?? "tokens"}?\n\nThis transfers from IRYS_PRIVATE_KEY to the Irys node and is non-refundable except via Irys' own withdraw flow.`,
    )) return
    setIrysBusy(true)
    setIrysError("")
    try {
      const res = await fetch("/api/admin/irys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Fund failed")
      setIrysAmount("")
      await fetchIrys()
    } catch (err) {
      setIrysError(err instanceof Error ? err.message : "Fund failed")
    } finally {
      setIrysBusy(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError("")
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    if (res.ok) {
      setAuthed(true)
      setPassword("")
      fetchStatus()
    } else {
      const data = await res.json()
      setLoginError(data.error || "Login failed")
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" })
    setAuthed(false)
    setStatus(null)
  }

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!authed) return
    fetchStatus()
    fetchRefunds(refundFilter)
    fetchIrys()
    const interval = setInterval(() => {
      fetchStatus()
      fetchRefunds(refundFilter)
      fetchIrys()
    }, 10_000)
    return () => clearInterval(interval)
  }, [authed, fetchStatus, fetchRefunds, fetchIrys, refundFilter])

  // Countdown tick
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // ── Login Screen ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-zinc-900 p-8 rounded-lg border border-zinc-700 w-80 space-y-4">
          <h1 className="text-white text-lg font-bold text-center">Admin Monitor</h1>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white text-sm"
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white text-sm"
            autoComplete="current-password"
          />
          {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium">
            Login
          </button>
        </form>
      </div>
    )
  }

  // ── Dashboard ──
  const s = status
  const c = s?.contract
  const sup = s?.supply

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">SentinelTEMPO Admin Monitor</h1>
          <button onClick={handleLogout} className="text-xs text-zinc-400 hover:text-white px-3 py-1 border border-zinc-700 rounded">
            Logout
          </button>
        </div>

        {fetchError && (
          <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300 text-sm">
            {fetchError}
          </div>
        )}

        {c && sup && (
          <>
            {/* Phase Banner */}
            <div className={`${PHASE_COLORS[c.phase] || "bg-gray-700"} rounded-lg p-6 text-center`}>
              <div className="text-3xl font-bold">{PHASE_LABELS[c.phase] || c.phase.toUpperCase()}</div>
              {c.paused && <div className="text-xl mt-2 text-red-200 font-bold animate-pulse">PAUSED</div>}
              {countdown > 0 && !c.paused && (
                <div className="text-2xl font-mono mt-2">{formatCountdown(countdown)}</div>
              )}
              {c.phaseRemaining > 0 && (
                <div className="text-lg mt-1 opacity-90">{c.phaseRemaining.toLocaleString()} mints remaining in phase</div>
              )}
              <div className="mt-4 flex items-center justify-center gap-3">
                {!c.paused ? (
                  <button
                    onClick={() => handlePauseAction("pause")}
                    disabled={pauseBusy || !c.ownerConfigured || c.pauseCount >= c.maxPauses}
                    title={
                      !c.ownerConfigured
                        ? "OWNER_PRIVATE_KEY not configured on server"
                        : c.pauseCount >= c.maxPauses
                          ? "Pause limit reached"
                          : "Halt all minting"
                    }
                    className="px-4 py-2 text-sm font-bold rounded bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pauseBusy ? "Working…" : "Emergency Pause"}
                  </button>
                ) : (
                  <button
                    onClick={() => handlePauseAction("unpause")}
                    disabled={pauseBusy || !c.ownerConfigured}
                    title={!c.ownerConfigured ? "OWNER_PRIVATE_KEY not configured on server" : "Resume minting"}
                    className="px-4 py-2 text-sm font-bold rounded bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pauseBusy ? "Working…" : "Unpause"}
                  </button>
                )}
                {!c.ownerConfigured && (
                  <span className="text-xs opacity-75">Owner key not configured</span>
                )}
              </div>
              {pauseError && <div className="mt-2 text-xs text-red-200">{pauseError}</div>}
            </div>

            {/* Supply Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Minted" value={sup.total} max={sup.max} color="text-white" />
              <StatCard label="WL Minted" value={sup.wl} max={sup.wlCap} color="text-yellow-400" />
              <StatCard label="Agent Minted" value={sup.agent} max={sup.agentCap} color="text-blue-400" />
              <StatCard label="Human Minted" value={sup.human} max={sup.max - sup.wlCap - sup.agentCap} color="text-green-400" />
            </div>

            {/* Progress Bars */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Supply Progress</h2>
              <ProgressBar label="Total" current={sup.total} max={sup.max} color="bg-white" />
              <ProgressBar label="Whitelist" current={sup.wl} max={sup.wlCap} color="bg-yellow-500" />
              <ProgressBar label="Agent Public" current={sup.agent} max={sup.agentCap} color="bg-blue-500" />
              <ProgressBar label="Human Public" current={sup.human} max={sup.max - sup.wl - sup.agent} color="bg-green-500" />
            </div>

            {/* Timing Details */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Timeline</h2>
              <Row label="Mint Started" value={formatTime(c.mintStartTime)} />
              <Row label="WL Ended" value={s.timing.wlEnded ? formatTime(c.wlEndTime) : "Not yet"} />
              <Row label="Agent Ended" value={s.timing.agentEnded ? formatTime(c.agentEndTime) : "Not yet"} />
              <Row label="Phase Ends At" value={c.phaseEndsAt > 0 ? formatTime(c.phaseEndsAt) : "Open-ended"} />
              <Row label="Total Paused" value={c.totalPausedDuration > 0 ? `${c.totalPausedDuration}s` : "None"} />
              <Row label="Pause Count" value={`${c.pauseCount} / ${c.maxPauses}`} />
            </div>

            {/* Balances + Refunds */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Operations</h2>
              <Row
                label="Treasury pathUSD"
                value={s.balances.treasuryPathUsd !== null ? `${s.balances.treasuryPathUsd} pathUSD` : "—"}
              />
              <Row
                label="Server Minter pathUSD"
                value={s.balances.serverPathUsd !== null ? `${s.balances.serverPathUsd} pathUSD` : "—"}
              />
              <Row
                label="Refund Queue"
                value={`${s.refundQueue.unsettled} unsettled / ${s.refundQueue.total} total`}
              />
            </div>

            {/* Contract Info */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Contract</h2>
              <Row label="Address" value={c.address} mono />
              <Row label="Treasury" value={c.treasury} mono />
              <Row label="Server Minter" value={c.serverMinter ?? "—"} mono />
              <Row label="Owner Signer" value={c.ownerSigner ?? "(not configured)"} mono />
              <Row label="Merkle Root" value={c.merkleRoot} mono />
              <Row label="Phase Index" value={String(c.phaseIndex)} />
              <Row label="Server Time" value={new Date().toLocaleString()} />
            </div>

            {/* Constants */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Constants</h2>
              <Row label="Max Supply" value={String(s.constants.maxSupply)} />
              <Row label="WL Cap" value={String(s.constants.wlCap)} />
              <Row label="Agent Cap" value={String(s.constants.agentCap)} />
              <Row label="Human Cap" value={String(s.constants.humanCap)} />
              <Row label="WL Price" value={`${s.constants.wlPrice} pathUSD`} />
              <Row label="Human Price" value={`${s.constants.humanPrice} pathUSD`} />
              <Row label="WL Max / Wallet" value={String(s.constants.wlMaxPerWallet)} />
              <Row label="Public Max / Wallet" value={String(s.constants.publicMaxPerWallet)} />
            </div>

            {/* Refund Queue */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-400 uppercase">Refund Queue</h2>
                <div className="flex gap-1 text-xs">
                  {(["unsettled", "settled", "all"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setRefundFilter(f)}
                      className={`px-2 py-1 rounded border ${
                        refundFilter === f
                          ? "border-blue-500 text-blue-300 bg-blue-950"
                          : "border-zinc-700 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {refundError && <p className="text-xs text-red-400">{refundError}</p>}
              {refunds.length === 0 ? (
                <p className="text-xs text-zinc-500">No refunds in this view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-zinc-500 uppercase">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-3">ID</th>
                        <th className="text-left py-2 pr-3">Agent</th>
                        <th className="text-right py-2 pr-3">Amount</th>
                        <th className="text-left py-2 pr-3">Reason</th>
                        <th className="text-left py-2 pr-3">MPP Tx</th>
                        <th className="text-left py-2 pr-3">Created</th>
                        <th className="text-left py-2 pr-3">Status</th>
                        <th className="text-right py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-800/50">
                          <td className="py-2 pr-3 font-mono">{r.id}</td>
                          <td className="py-2 pr-3 font-mono">{shortAddr(r.agent)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{r.amount}</td>
                          <td className="py-2 pr-3 max-w-[200px] truncate" title={r.reason ?? ""}>
                            {r.reason ?? "—"}
                          </td>
                          <td className="py-2 pr-3 font-mono">{r.mpp_tx ? shortTx(r.mpp_tx) : "—"}</td>
                          <td className="py-2 pr-3 text-zinc-400">{formatTime(r.created_at)}</td>
                          <td className="py-2 pr-3">
                            {r.settled ? (
                              <span className="text-green-400">
                                ✓ {r.settled_tx ? shortTx(r.settled_tx) : "settled"}
                              </span>
                            ) : (
                              <span className="text-yellow-400">pending</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {!r.settled && (
                              <button
                                onClick={() => handleSettle(r.id)}
                                disabled={settlingId === r.id}
                                className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {settlingId === r.id ? "..." : "Settle"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Wallet History Lookup */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Wallet History</h2>
              <form onSubmit={handleWalletLookup} className="flex gap-2">
                <input
                  type="text"
                  value={walletQuery}
                  onChange={(e) => setWalletQuery(e.target.value)}
                  placeholder="0x… recipient address"
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white text-sm font-mono"
                />
                <button
                  type="submit"
                  disabled={walletBusy}
                  className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                >
                  {walletBusy ? "Loading…" : "Lookup"}
                </button>
              </form>
              {walletError && <p className="text-xs text-red-400">{walletError}</p>}
              {walletData && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-zinc-800 rounded p-2">
                      <div className="text-zinc-500">Total Mints</div>
                      <div className="text-lg font-bold">{walletData.counters.totalMints}</div>
                    </div>
                    <div className="bg-zinc-800 rounded p-2">
                      <div className="text-zinc-500">WL Minted</div>
                      <div className={`text-lg font-bold ${walletData.counters.wlMinted ? "text-yellow-400" : "text-zinc-500"}`}>
                        {walletData.counters.wlMinted ? "✓ Yes" : "No"}
                      </div>
                    </div>
                    <div className="bg-zinc-800 rounded p-2">
                      <div className="text-zinc-500">Agent Mints</div>
                      <div className="text-lg font-bold text-blue-400">{walletData.counters.agentMints}</div>
                    </div>
                    <div className="bg-zinc-800 rounded p-2">
                      <div className="text-zinc-500">Human Mints</div>
                      <div className="text-lg font-bold text-green-400">{walletData.counters.humanMints}</div>
                    </div>
                  </div>
                  {walletData.mints.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No mints found in lookback window (blocks {walletData.lookbackFromBlock.toLocaleString()}–{walletData.lookbackToBlock.toLocaleString()}).
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-zinc-500 uppercase">
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-2 pr-3">Token</th>
                            <th className="text-left py-2 pr-3">Kind</th>
                            <th className="text-left py-2 pr-3">Mint Tx</th>
                            <th className="text-left py-2 pr-3">Treasury Pay Tx</th>
                            <th className="text-left py-2 pr-3">Amount</th>
                            <th className="text-left py-2 pr-3">Fee Payer</th>
                            <th className="text-left py-2 pr-3">Block</th>
                            <th className="text-left py-2">Minted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {walletData.mints.map((m) => (
                            <tr key={m.tokenId} className="border-b border-zinc-800/50">
                              <td className="py-2 pr-3 font-mono">#{m.tokenId}</td>
                              <td className="py-2 pr-3">
                                <KindBadge kind={m.kind} />
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                <TxLink hash={m.mintTxHash} />
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                {m.treasuryReceive ? (
                                  m.treasuryReceive.source === "in_mint_tx" ? (
                                    <span className="text-zinc-500" title="Same tx as mint (human path)">
                                      ↑ same as mint
                                    </span>
                                  ) : (
                                    <TxLink hash={m.treasuryReceive.txHash} />
                                  )
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 font-mono text-zinc-300">
                                {m.treasuryReceive?.amount ? `${m.treasuryReceive.amount} pUSD` : "—"}
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                {m.treasuryReceive?.feePayer ? (
                                  <span title={m.treasuryReceive.feePayer}>
                                    {shortAddr(m.treasuryReceive.feePayer)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 font-mono">{m.blockNumber.toLocaleString()}</td>
                              <td className="py-2 text-zinc-400">{m.mintedAt > 0 ? formatTime(m.mintedAt) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Irys Funding */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-bold text-zinc-400 uppercase">Irys Uploader</h2>
              {irysError && <p className="text-xs text-red-400">{irysError}</p>}
              {irysStatus ? (
                <>
                  <Row label="Network" value={irysStatus.network} />
                  <Row label="Token" value={irysStatus.token} />
                  <Row label="Uploader Address" value={irysStatus.address} mono />
                  <Row
                    label="Loaded Balance"
                    value={`${irysStatus.loadedBalance} ${irysStatus.token}`}
                  />
                  {irysStatus.estimate && (
                    <>
                      <Row
                        label="Cost / 1 MiB"
                        value={`${irysStatus.estimate.price} ${irysStatus.token}`}
                      />
                      {irysStatus.estimate.estimatedMintsRemaining !== null && (
                        <Row
                          label="≈ Mints Remaining"
                          value={`${irysStatus.estimate.estimatedMintsRemaining} (image + metadata)`}
                        />
                      )}
                    </>
                  )}
                  <form onSubmit={handleIrysFund} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={irysAmount}
                      onChange={(e) => setIrysAmount(e.target.value)}
                      placeholder={`Top-up amount (${irysStatus.token})`}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white text-sm"
                    />
                    <button
                      type="submit"
                      disabled={irysBusy || !irysAmount}
                      className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
                    >
                      {irysBusy ? "Funding…" : "Fund"}
                    </button>
                  </form>
                </>
              ) : (
                <p className="text-xs text-zinc-500">Loading…</p>
              )}
            </div>
          </>
        )}

        {!s && !fetchError && (
          <div className="text-center text-zinc-500 py-20">Loading contract data...</div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500">/ {max.toLocaleString()}</div>
    </div>
  )
}

function ProgressBar({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span>{current.toLocaleString()} / {max.toLocaleString()} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  )
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortTx(tx: string): string {
  if (!tx || tx.length < 14) return tx
  return `${tx.slice(0, 8)}…${tx.slice(-6)}`
}

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explore.tempo.xyz"

function TxLink({ hash }: { hash: string }) {
  if (!hash) return <span className="text-zinc-600">—</span>
  return (
    <a
      href={`${EXPLORER_URL}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:underline"
      title={hash}
    >
      {shortTx(hash)}
    </a>
  )
}

function KindBadge({ kind }: { kind: string | null }) {
  if (!kind) return <span className="text-zinc-600 text-[10px]">unknown</span>
  const styles: Record<string, string> = {
    wl_human: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
    public_human: "bg-green-900/50 text-green-300 border-green-700",
    wl_agent: "bg-purple-900/50 text-purple-300 border-purple-700",
    agent_public: "bg-blue-900/50 text-blue-300 border-blue-700",
  }
  const labels: Record<string, string> = {
    wl_human: "WL Human",
    public_human: "Public Human",
    wl_agent: "WL Agent",
    agent_public: "Agent Public",
  }
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono ${styles[kind] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
    >
      {labels[kind] ?? kind}
    </span>
  )
}
