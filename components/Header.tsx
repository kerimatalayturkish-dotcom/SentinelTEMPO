"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"

const baseNavLinks = [
  { href: "/", label: "Home" },
  { href: "/mint", label: "Mint" },
  { href: "/collection", label: "Collection" },
  { href: "/skill", label: "Mint Skill" },
]

export function Header() {
  const pathname = usePathname()
  const { isConnected } = useAccount()

  const navLinks = isConnected
    ? [...baseNavLinks, { href: "/my-mints", label: "My Mints" }]
    : baseNavLinks

  return (
    <header className="sticky top-0 z-50 border-b border-sentinel/20 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto max-w-6xl flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-pixel text-sentinel text-[9px] tracking-wider animate-text-glow">
            SENTINEL
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 text-[9px] rounded-md transition-colors ${
                pathname === link.href
                  ? "text-sentinel bg-sentinel/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet */}
        <div className="scale-90 origin-right">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="sm:hidden flex items-center justify-center gap-1 pb-2 px-4">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1 text-[8px] rounded-md transition-colors ${
              pathname === link.href
                ? "text-sentinel bg-sentinel/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
