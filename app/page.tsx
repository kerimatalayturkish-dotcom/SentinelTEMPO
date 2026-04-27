"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CircuitBackground } from "@/components/CircuitBackground"
import { SupplyCounter } from "@/components/SupplyCounter"
import { PhaseIndicator } from "@/components/PhaseIndicator"
import { WhitelistCheckWidget } from "@/components/WhitelistCheckWidget"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const codeSnippets = [
  { code: "exec(agent_001);", x: "5%", y: "18%", delay: 0 },
  { code: "verify_chain_block();", x: "3%", y: "28%", delay: 0.4 },
  { code: "return agent_status();", x: "78%", y: "22%", delay: 0.8 },
  { code: "mint(sentinel, traits);", x: "80%", y: "72%", delay: 1.2 },
  { code: "// network_context", x: "6%", y: "75%", delay: 1.6 },
]

const features = [
  {
    title: "AI Agent Minting",
    desc: "Agents pay via MPP (HTTP 402) and mint autonomously — no wallet popups needed.",
    icon: "🤖",
  },
  {
    title: "7 Trait Layers",
    desc: "Background, Back, Body, Mouth, Eyes, Eyewear, and Head Items — 130 unique traits.",
    icon: "🎨",
  },
  {
    title: "On-Chain Ownership",
    desc: "ERC-721 on Tempo. Your NFT, your wallet, verified on-chain forever.",
    icon: "⛓️",
  },
]

const pricing = [
  {
    phase: "Whitelist",
    price: "2",
    desc: "Early supporters get first access",
    badge: "WL",
    highlight: false,
  },
  {
    phase: "AI Agent",
    price: "3",
    desc: "Autonomous minting via MPP protocol",
    badge: "AGENT",
    highlight: true,
  },
  {
    phase: "Public",
    price: "4",
    desc: "Open mint for everyone",
    badge: "PUBLIC",
    highlight: false,
  },
]

export default function Home() {
  return (
    <>
      <CircuitBackground />

      <main className="relative z-10">
        {/* Hero */}
        <section className="container mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
          {/* Floating code snippets */}
          {codeSnippets.map((s, i) => (
            <motion.div
              key={i}
              className="absolute hidden lg:block text-[8px] text-sentinel/20 select-none pointer-events-none"
              style={{ left: s.x, top: s.y }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: [0, -6, 0] }}
              transition={{
                opacity: { delay: s.delay, duration: 0.8 },
                y: { delay: s.delay, duration: 4, repeat: Infinity, ease: "easeInOut" },
              }}
            >
              {s.code}
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="font-pixel text-2xl sm:text-3xl text-sentinel animate-text-glow leading-tight">
              SENTINEL
            </h1>
            <p className="font-pixel text-[7px] sm:text-[9px] text-muted-foreground mt-3 tracking-widest">
              FIRST AGENTIC COLLECTION ON TEMPO CHAIN
            </p>
          </motion.div>

          {/* Status panel */}
          <motion.div
            className="mt-10 max-w-md mx-auto space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-3">
              <PhaseIndicator />
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 border border-status-live/20">
                <span className="w-2 h-2 rounded-full bg-status-live animate-pulse" />
                <span className="text-[8px] text-status-live font-bold">LIVE</span>
              </div>
            </div>
            <SupplyCounter />
          </motion.div>

          {/* Whitelist checker */}
          <motion.div
            className="mt-6 max-w-md mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
          >
            <WhitelistCheckWidget />
          </motion.div>

          {/* CTA */}
          <motion.div
            className="mt-10 flex items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <Link href="/mint">
              <Button
                size="lg"
                className="bg-sentinel hover:bg-sentinel/90 text-white font-pixel text-[9px] px-8 py-6 animate-pulse-glow"
              >
                MINT NOW
              </Button>
            </Link>
            <Link href="/collection">
              <Button variant="outline" size="lg" className="border-sentinel/30 hover:bg-sentinel/10 text-[9px] px-6 py-6">
                View Collection
              </Button>
            </Link>
          </motion.div>
        </section>

        {/* Features */}
        <section className="container mx-auto max-w-6xl px-4 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
              >
                <Card className="sentinel-card border-sentinel/10 bg-card/60 backdrop-blur-sm h-full">
                  <CardContent className="pt-6 px-5 pb-5">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="text-[10px] font-bold mt-3 text-foreground">{f.title}</h3>
                    <p className="text-[8px] text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="container mx-auto max-w-6xl px-4 pb-20">
          <motion.h2
            className="font-pixel text-[10px] text-sentinel text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            HOW IT WORKS
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { step: "01", label: "Connect", desc: "Link your Tempo wallet" },
              { step: "02", label: "Choose", desc: "Pick from 7 trait layers" },
              { step: "03", label: "Pay", desc: "2-4 pathUSD per phase" },
              { step: "04", label: "Own", desc: "NFT minted to your wallet" },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                className="text-center space-y-2"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 + i * 0.1, duration: 0.4 }}
              >
                <span className="text-lg font-bold text-sentinel/40">{s.step}</span>
                <p className="text-[10px] font-bold text-foreground">{s.label}</p>
                <p className="text-[8px] text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="container mx-auto max-w-6xl px-4 pb-20">
          <motion.h2
            className="font-pixel text-[10px] text-sentinel text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
          >
            MINT PRICING
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {pricing.map((p, i) => (
              <motion.div
                key={p.phase}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.7 + i * 0.15, duration: 0.5 }}
              >
                <Card
                  className={`sentinel-card h-full text-center ${
                    p.highlight
                      ? "border-sentinel/40 bg-sentinel/5"
                      : "border-sentinel/10 bg-card/60"
                  } backdrop-blur-sm`}
                >
                  <CardContent className="pt-6 px-5 pb-5 space-y-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[7px] font-bold tracking-wider bg-sentinel/10 text-sentinel border border-sentinel/20">
                      {p.badge}
                    </span>
                    <div>
                      <span className="font-pixel text-xl text-foreground">{p.price}</span>
                      <span className="text-[9px] text-muted-foreground ml-1">pathUSD</span>
                    </div>
                    <p className="text-[10px] font-medium text-foreground">{p.phase}</p>
                    <p className="text-[8px] text-muted-foreground leading-relaxed">{p.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
