import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow API routes
  if (pathname.startsWith("/api/")) return NextResponse.next()

  // Allow Next.js internals
  if (pathname.startsWith("/_next/")) return NextResponse.next()

  // Allow only specific public files (exact, case-sensitive)
  if (pathname === "/sentinelMath.md") return NextResponse.next()

  // Allow favicon
  if (pathname === "/favicon.ico") return NextResponse.next()

  // Block everything else with a plain 404
  return new NextResponse("404 Not Found", { status: 404, headers: { "Content-Type": "text/plain" } })
}

export const config = {
  // Run on all routes except static assets and internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
