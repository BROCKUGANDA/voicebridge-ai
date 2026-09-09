/**
 * Next.js middleware — runs on every request before the route handler.
 *
 * Layered in front of all `/api/*` routes:
 *   1. HTTPS enforcement (308 redirect in production)
 *   2. Bot heuristic check
 *   3. Per-IP rate limit (route handlers add per-user limits via withApi)
 *   4. Apply security headers + per-request CSP nonce for documents
 *
 * Static assets (`_next/static`, `_next/image`, `favicon.ico`, `models/*`)
 * are excluded. Note: /api/agent/token and /api/agent/tools ARE covered —
 * they're called from the browser and need edge-level limits too; their
 * route handlers add session auth on top.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  applySecurityHeaders,
  buildCsp,
  generateCspNonce,
  enforceHttps,
  looksLikeBot,
  looksLikeScanPath,
  rateLimit,
  RATE_LIMITS,
  clientIpFrom,
  SECURITY_HEADERS,
} from '@/lib/security-edge'

export const config = {
  matcher: [
    // Run on every request EXCEPT static assets and the model archive.
    '/((?!_next/static|_next/image|favicon.ico|models/).*)',
  ],
}

function jsonBlock(status: number, body: unknown, extra?: Record<string, string>): NextResponse {
  const res = new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(extra ?? {}),
    },
  })
  return applySecurityHeaders(res)
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // 1. HTTPS first — fail fast in prod.
  const httpsRedirect = enforceHttps(req)
  if (httpsRedirect) return httpsRedirect

  const path = req.nextUrl.pathname
  const isApi = path.startsWith('/api/')
  const isProd = process.env.NODE_ENV === 'production'

  // 2a. Scanner / secret-probe paths — block before any app logic.
  if (looksLikeScanPath(path)) {
    return jsonBlock(404, { error: 'not_found' })
  }

  // 2b. Bot heuristics. In production, block bots on EVERYTHING (HTML too) —
  // this dashboard has no public content and crawlers only probe auth + burn
  // AssemblyAI token budget. In dev, only block API bots so local tooling works.
  if (looksLikeBot(req) && (isApi || isProd)) {
    return jsonBlock(403, { error: 'forbidden' })
  }

  // 3. Per-request rate limit (IP+route key). Fine-grained per-user limits
  // happen inside individual route handlers via withApi().
  const ip = clientIpFrom(req)
  const rlKey = `${ip}:${req.method} ${path}`
  const policy =
    (`${req.method} ${path}` as keyof typeof RATE_LIMITS) in RATE_LIMITS
      ? (`${req.method} ${path}` as keyof typeof RATE_LIMITS)
      : 'default'
  const rl = rateLimit(rlKey, policy)
  if (!rl.allowed) {
    return jsonBlock(
      429,
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { 'Retry-After': String(rl.retryAfterSec) },
    )
  }

  // 4. Document requests get a per-request CSP nonce so Next.js inline
  //    bootstrap scripts hydrate. API JSON responses keep the static CSP.
  const isDocument =
    !isApi && (req.headers.get('accept') || '').includes('text/html')

  if (isDocument) {
    const nonce = generateCspNonce()
    const csp = buildCsp(nonce)
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)

    const res = NextResponse.next({
      request: { headers: requestHeaders },
    })
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.headers.set(k, v)
    }
    res.headers.set('Content-Security-Policy', csp)
    res.headers.set('X-RateLimit-Remaining', String(rl.remaining))
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
    return res
  }

  // 5. API / other pass-through. Route handlers enforce auth per-route.
  const res = NextResponse.next()
  applySecurityHeaders(res)
  res.headers.set('X-RateLimit-Remaining', String(rl.remaining))
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}
