/**
 * Edge-runtime-compatible subset of the security stack.
 *
 * Middleware runs in Edge runtime, which doesn't support `node:crypto`,
 * `node:child_process`, etc. The full security stack in `lib/security.ts`
 * is server-only (used by route handlers); this file holds the pieces
 * the middleware needs with zero Node-only imports.
 *
 * If you add a new function here, make sure its implementation does not
 * transitively pull in `node:*` modules. Otherwise the build will fail
 * with "Native module not found: node:crypto" on the Edge bundle.
 */

import { NextRequest, NextResponse } from 'next/server'

/** Best-effort client IP. x-forwarded-for is only honored when the operator
 *  has explicitly opted in (app running behind a trusted reverse proxy);
 *  otherwise a spoofable header must never drive rate-limit keys. */
export function clientIpFrom(req: NextRequest): string {
  if (process.env.TRUST_PROXY_HEADERS === '1') {
    const xff = req.headers.get('x-forwarded-for')
    const first = xff?.split(',')[0]?.trim()
    if (first) return first
    const real = req.headers.get('x-real-ip')
    if (real) return real
  }
  return '0.0.0.0'
}

// ------------------------------------------------------------------
// 1. HTTPS enforcement (Edge-safe — no Node imports)
// ------------------------------------------------------------------

/** 308 redirect to https in production. No-op in dev. */
export function enforceHttps(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null
  const proto =
    req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  if (proto === 'https') return null
  const url = req.nextUrl.clone()
  url.protocol = 'https'
  return NextResponse.redirect(url, 308)
}

// ------------------------------------------------------------------
// 2. Bot detection (pure regex, no Node)
// ------------------------------------------------------------------

const BOT_UA_PATTERNS: RegExp[] = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scrapy/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /go-http-client/i,
  /headlesschrome/i,
  /phantomjs/i,
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /libwww/i,
  /httpclient/i,
  /okhttp/i,
  /java\//i,
  /scrapy/i,
  /axios/i,
  /node-fetch/i,
  /postman/i,
  /insomnia/i,
  /harbor/i,
  /semrush/i,
  /ahrefs/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /bytespider/i,
  /gptbot/i,
  /ccbot/i,
  /claudebot/i,
  /anthropic/i,
  /perplexity/i,
  /amazonbot/i,
  /facebookexternalhit/i,
]

/** Paths scanners always probe — never serve app content for these. */
const SCAN_PATH_RE =
  /\.(env|git|svn|htaccess|htpasswd|bak|old|sql|sqlite|db|pem|key|p12|pfx|config|ini|log|yml|yaml|json\.bak)$/i
const SCAN_PATH_PREFIXES = [
  '/.env',
  '/.git',
  '/.svn',
  '/.well-known/acme-challenge',
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/adminer',
  '/.aws',
  '/actuator',
  '/server-status',
  '/_profiler',
  '/vendor/phpunit',
  '/boaform',
  '/hudson',
  '/jenkins',
  '/solr',
  '/.DS_Store',
  '/config.json',
  '/debug',
  '/trace',
  '/console',
]

/** True if this path looks like a vulnerability scanner probe. */
export function looksLikeScanPath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  if (SCAN_PATH_RE.test(p)) return true
  return SCAN_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '?'))
}

/**
 * Returns true if the request looks like a non-browser automation client.
 *
 * Browsers send Accept star-slash-star on fetch()/XHR — that MUST pass,
 * otherwise every apiFetch call from the dashboard is 403'd. Only missing
 * Accept, empty Accept, or a clearly non-browser client are bots.
 */
export function looksLikeBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || ''
  if (!ua) return true
  if (BOT_UA_PATTERNS.some((p) => p.test(ua))) return true
  const accept = (req.headers.get('accept') || '').toLowerCase()
  if (!accept) return true
  // Browser fetch default is */*; navigations send text/html; our API
  // clients may send application/json. Anything else is suspicious.
  const looksBrowserish =
    accept.includes('*/*') ||
    accept.includes('text/html') ||
    accept.includes('application/json')
  if (!looksBrowserish) return true
  return false
}

// ------------------------------------------------------------------
// 3. In-memory rate limiter (Edge-safe — just a Map)
// ------------------------------------------------------------------

interface Bucket {
  tokens: number
  lastRefill: number
}

const RATE_TABLE = new Map<string, Bucket>()

/** Rate limit policy per route. */
export const RATE_LIMITS: Record<string, { refillPerSec: number; burst: number }> = {
  'POST /api/agent/token': { refillPerSec: 0.2, burst: 3 },
  'POST /api/agent/tools': { refillPerSec: 5, burst: 20 },
  'POST /api/stt/fallback': { refillPerSec: 2, burst: 10 },
  'POST /api/voice': { refillPerSec: 5, burst: 20 },
  'POST /api/conversation': { refillPerSec: 2, burst: 10 },
  'POST /api/preferences': { refillPerSec: 1, burst: 5 },
  'POST /api/vision': { refillPerSec: 2, burst: 10 },
  'POST /api/session': { refillPerSec: 1, burst: 5 },
  'POST /api/metrics': { refillPerSec: 2, burst: 10 },
  'GET /api/auth/login': { refillPerSec: 0.5, burst: 5 },
  'POST /api/auth/login': { refillPerSec: 0.5, burst: 5 },
  default: { refillPerSec: 2, burst: 10 },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function rateLimit(
  key: string,
  policy: keyof typeof RATE_LIMITS | 'default' = 'default',
): RateLimitResult {
  if (RATE_TABLE.size > 10_000) pruneRateLimit()
  const cfg = RATE_LIMITS[policy] ?? RATE_LIMITS.default
  const now = Date.now()
  let b = RATE_TABLE.get(key)
  if (!b) {
    b = { tokens: cfg.burst, lastRefill: now }
    RATE_TABLE.set(key, b)
  } else {
    const elapsed = (now - b.lastRefill) / 1000
    b.tokens = Math.min(cfg.burst, b.tokens + elapsed * cfg.refillPerSec)
    b.lastRefill = now
  }
  if (b.tokens < 1) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((1 - b.tokens) / cfg.refillPerSec),
    }
  }
  b.tokens -= 1
  return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 }
}

/** Prune stale rate-limit entries (per-process). */
export function pruneRateLimit(maxAgeMs = 10 * 60_000): number {
  const now = Date.now()
  let pruned = 0
  for (const [k, b] of RATE_TABLE) {
    if (now - b.lastRefill > maxAgeMs) {
      RATE_TABLE.delete(k)
      pruned++
    }
  }
  return pruned
}

// ------------------------------------------------------------------
// 4. Security headers (pure data, no Node)
// ------------------------------------------------------------------

/**
 * Build the full CSP. `scriptNonce` is required for document responses:
 * Next.js emits inline bootstrap scripts, and a nonce-less `script-src
 * 'self'` blocks hydration (page looks fine in SSR, every client handler
 * is dead). API responses can pass null and omit the nonce.
 */
export function buildCsp(scriptNonce?: string | null): string {
  const scriptSrc = scriptNonce
    ? `script-src 'self' 'nonce-${scriptNonce}' 'wasm-unsafe-eval'`
    : `script-src 'self' 'wasm-unsafe-eval'`
  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' wss://agents.assemblyai.com wss://agents.us.assemblyai.com wss://agents.eu.assemblyai.com wss://streaming.assemblyai.com wss://streaming.us.assemblyai.com wss://streaming.eu.assemblyai.com https://api.assemblyai.com https://api.eu.assemblyai.com https://cdn.assemblyai.com`,
    `media-src 'self' blob: mediastream:`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join('; ')
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': buildCsp(null),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
}

/** Attach the standard security headers to a NextResponse. */
export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v)
  }
  return res
}

/**
 * Generate a per-request CSP nonce (Edge-safe: Web Crypto, not node:crypto).
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

// ------------------------------------------------------------------
// 5. apiGuard for middleware (Edge-safe variant)
// ------------------------------------------------------------------

/** Minimal middleware-level guard that runs in Edge runtime. */
export function middlewareGuard(
  req: NextRequest,
  opts: { blockBots?: boolean } = {},
): { ok: true; rateKey: string } | { ok: false; response: NextResponse } {
  if (opts.blockBots && looksLikeBot(req)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }
  const ip = clientIpFrom(req)
  return { ok: true, rateKey: `${ip}:${req.method} ${req.nextUrl.pathname}` }
}
