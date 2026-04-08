import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow API routes
  if (pathname.startsWith("/api/")) return NextResponse.next()

  // Allow static files from public/ (SKILL-QUEST.md, images, etc.)
  if (pathname.includes(".")) return NextResponse.next()

  // Allow Next.js internals
  if (pathname.startsWith("/_next/")) return NextResponse.next()

  // Block all page routes — redirect to SKILL-QUEST.md
  const url = request.nextUrl.clone()
  url.pathname = "/SKILL-QUEST.md"
  return NextResponse.redirect(url, 308)
}

export const config = {
  // Run on all routes except static assets and internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
