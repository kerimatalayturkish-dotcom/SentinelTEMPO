"use client"

import { WagmiProvider, http } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit"
import "@rainbow-me/rainbowkit/styles.css"
import { tempoChain } from "@/lib/chain"
import { useState } from "react"

const config = getDefaultConfig({
  appName: "SentinelTEMPO",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "PLACEHOLDER",
  chains: [tempoChain],
  transports: {
    [tempoChain.id]: http(),
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ff2d2d",
            accentColorForeground: "#ffffff",
            borderRadius: "small",
            fontStack: "system",
            overlayBlur: "small",
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
