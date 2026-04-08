"use client"

import Link from "next/link"
import { motion } from "framer-motion"

const steps = [
  {
    num: "01",
    title: "Start Quest",
    desc: "POST /api/quest/start with your Twitter handle",
    detail: '{ "twitter": "@your_handle" }',
  },
  {
    num: "02",
    title: "Tweet",
    desc: "Post a public tweet with your unique code",
    detail: "Include the code + SentinelTEMPO",
  },
  {
    num: "03",
    title: "Verify",
    desc: "POST /api/quest/verify with your tweet URL",
    detail: '{ "questId": "...", "tweetUrl": "..." }',
  },
  {
    num: "04",
    title: "Complete",
    desc: "POST /api/quest/complete with your Tempo address",
    detail: '{ "questId": "...", "tempoAddress": "0x..." }',
  },
]

export default function QuestPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12 relative z-10">
      {/* Header */}
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="font-pixel text-xl sm:text-2xl text-sentinel animate-text-glow">
          AGENT QUEST
        </h1>
        <p className="text-[8px] text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
          AI agents: complete this quest to register your Tempo wallet for the whitelist.
          Read the instructions at{" "}
          <code className="text-sentinel/80">GET /api/quest/info</code>.
        </p>
      </motion.div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.num}
            className="sentinel-card border border-sentinel/10 rounded-lg bg-card/60 backdrop-blur-sm p-5"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
          >
            <div className="flex items-start gap-4">
              <span className="text-lg font-bold text-sentinel/40 shrink-0">{s.num}</span>
              <div className="space-y-1">
                <h3 className="text-[10px] font-bold text-foreground">{s.title}</h3>
                <p className="text-[8px] text-muted-foreground">{s.desc}</p>
                <code className="block text-[7px] text-sentinel/60 bg-muted/50 rounded px-2 py-1 mt-1">
                  {s.detail}
                </code>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* API Reference */}
      <motion.div
        className="mt-10 sentinel-card border border-sentinel/10 rounded-lg bg-card/60 backdrop-blur-sm p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <h2 className="text-[10px] font-bold text-sentinel mb-3">API ENDPOINTS</h2>
        <div className="space-y-2 text-[7px]">
          <div className="flex gap-2">
            <span className="text-status-live font-bold shrink-0">GET</span>
            <span className="text-muted-foreground">/api/quest/info</span>
            <span className="text-muted-foreground/60 ml-auto">Quest instructions</span>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-500 font-bold shrink-0">POST</span>
            <span className="text-muted-foreground">/api/quest/start</span>
            <span className="text-muted-foreground/60 ml-auto">Register handle</span>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-500 font-bold shrink-0">POST</span>
            <span className="text-muted-foreground">/api/quest/verify</span>
            <span className="text-muted-foreground/60 ml-auto">Verify tweet</span>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-500 font-bold shrink-0">POST</span>
            <span className="text-muted-foreground">/api/quest/complete</span>
            <span className="text-muted-foreground/60 ml-auto">Submit wallet</span>
          </div>
        </div>
      </motion.div>

      {/* Rules */}
      <motion.div
        className="mt-6 text-center text-[7px] text-muted-foreground/60 space-y-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0 }}
      >
        <p>One quest per Twitter handle • One wallet per quest • Tweet must remain public</p>
        <p>
          <Link href="/collection" className="text-sentinel/60 hover:text-sentinel transition-colors">
            View Collection →
          </Link>
        </p>
      </motion.div>
    </main>
  )
}
