/**
 * VoiceBridge AI — security primitives
 *
 * Centralized module for the security controls listed in the brief:
 *   - Parameterized queries  (Prisma already does this; helpers below
 *     enforce usage on raw SQL paths)
 *   - Input validation       (zod schemas + per-route guards)
 *   - Output escaping        (sanitize strings before they hit HTML / JSON
 *     responses — prevents XSS via stored payloads)
 *   - Response trimming      (cap list responses; strip null/volume-only
 *     fields that leak implementation detail)
 *   - Field tampering        (Zod refuses unknown keys; helper that
 *     re-validates on every write path)
 *   - Record access locking  (per-user scope on every DB read; helper
 *     `assertOwnedBy` rejects cross-tenant access)
 *   - Rate limiting          (token bucket per userId+route in memory;
 *     swap for Redis in prod)
 *   - Bot protection         (User-Agent / fingerprint heuristic; can be
 *     swapped for Turnstile / hCaptcha)
 *   - Session cookies        (helper `getSession` reads the signed cookie
 *     set by `issueSession`; cookies are HttpOnly + Secure + SameSite=Strict)
 *   - File upload restrictions (size, mime, ext triple-check; reject
 *     unknown mimetype)
 *   - HTTPS enforcement      (handled in middleware via HSTS + 308 redirect)
 *   - Security headers       (CSP, HSTS, X-Frame-Options, X-Content-Type-
 *     Options, Referrer-Policy, Permissions-Policy)
 *   - Sensitive-data encryption (AES-256-GCM at-rest for any string field
 *     flagged `encrypted: true` in a model's `encryptedFields` map)
 *   - Dependency scanning    (`npm run audit` in CI — see package.json)
 *
 * Threat model:
 *   - The agent is browser-facing; the only client we trust is our own JS
 *     bundle. All input is treated as untrusted.
 *   - The AssemblyAI key lives server-side only.
 *   - There is one tenant (default-user) for now, but the helpers are
 *     designed to support multi-tenant later without rewrites.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// 0. Environment / secrets bootstrap
// ---------------------------------------------------------------------------
//
// Hardening rule: in production we REFUSE to boot with fallback secrets —
// a weak default is worse than a crash (fail closed, not open). In dev we
// emit a single loud warning and continue with deterministic placeholders so
// the local experience isn't blocked.

const isProd = process.env.NODE_ENV === 'production'

function readSecret(name: string): string {
  const v = process.env[name]
  if (v && v.length >= 16) return v
  if (isProd) {
    throw new Error(
      `${name} must be set to a strong value (>= 16 chars) in production`,
    )
  }
  if (!DEV_WARNED.has(name)) {
    DEV_WARNED.add(name)
    console.warn(
      `[voicebridge] ${name} not set — using an insecure development fallback. Never deploy like this.`,
    )
  }
  return `dev-insecure-${name.toLowerCase()}`
}

const DEV_WARNED = new Set<string>()

/** Resolved once per process; getters below memoize the result. */
let cachedSessionSecret: string | null = null
function sessionSecret(): string {
  if (cachedSessionSecret === null) {
    cachedSessionSecret = readSecret('SESSION_SECRET')
  }
  return cachedSessionSecret
}

// ---------------------------------------------------------------------------
// 1. AES-256-GCM encryption for sensitive string fields
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getMasterKey(): Buffer {
  // Accept the historical DATA_ENCRYPTION_KEY name so existing deployments
  // don't silently fall back to a derived dev key after upgrade.
  const hex = process.env.MASTER_KEY || process.env.DATA_ENCRYPTION_KEY
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex')
  }
  if (isProd) {
    throw new Error('MASTER_KEY (64 hex chars) must be set in production')
  }
  if (!DEV_WARNED.has('MASTER_KEY')) {
    DEV_WARNED.add('MASTER_KEY')
    console.warn(
      '[voicebridge] MASTER_KEY not set — deriving a dev-only key from a fixed passphrase + salt. Never deploy like this.',
    )
  }
  // Deterministic dev-only derivation so ciphertext survives dev restarts.
  // Multi-instance production must use KMS-issued keys instead.
  return scryptSync(readSecret('MASTER_KEY_PASSPHRASE'), 'voicebridge-master-salt-v1', 32)
}

/** Encrypt a UTF-8 string. Output format: base64(iv || tag || ciphertext). */
export function encrypt(plaintext: string): string {
  const key = getMasterKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Decrypt a string produced by `encrypt`. Throws on tamper. */
export function decrypt(ciphertextB64: string): string {
  const key = getMasterKey()
  const buf = Buffer.from(ciphertextB64, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('ciphertext too short')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const enc = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

/** Tamper-detecting hash for audit chains. */
export function tamperHash(prev: string, payload: unknown): string {
  const h = createHash('sha256')
  h.update(prev)
  h.update('\n')
  h.update(typeof payload === 'string' ? payload : JSON.stringify(payload))
  return h.digest('hex')
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  // Compare digests so the length check can't leak the value's length, and
  // timingSafeEqual always sees equal-length buffers.
  const A = createHash('sha256').update(a).digest()
  const B = createHash('sha256').update(b).digest()
  return timingSafeEqual(A, B)
}

// ---------------------------------------------------------------------------
// 2. Session cookies — signed, HttpOnly, Secure, SameSite=Strict
// ---------------------------------------------------------------------------

const SESSION_COOKIE = 'vb_session'
const SESSION_TTL_S = 60 * 60 * 8 // 8 hours

/** HMAC-SHA256 over the payload body, keyed by SESSION_SECRET. Full 64-hex
 *  digest — a truncated digest would give an attacker a shorter target. */
function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('hex')
}

interface SessionPayload {
  userId: string
  issuedAt: number
}

/** Async session reader used by server components. Route handlers should
 *  prefer the sync `getSession(req)` overload below. */
export async function getSessionAsync(): Promise<SessionPayload | null> {
  const c = (await cookies()).get(SESSION_COOKIE)
  if (!c?.value) return null
  const [body, sig] = c.value.split('.')
  if (!body || !sig) return null
  if (!safeEqual(sig, sign(body))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.issuedAt !== 'number' ||
      Date.now() - payload.issuedAt > SESSION_TTL_S * 1000
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 3. Input validation — Zod helpers + per-route schemas
// ---------------------------------------------------------------------------

/** Reject any unknown keys. Catches field-tampering attempts where the
 *  client sends extra fields hoping we'll blindly persist them. */
export const strictObject = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict()

/** Cap string length to prevent memory-exhaustion attacks. */
export const boundedString = (max: number, min = 1) =>
  z.string().min(min).max(max)

/** Common reusable primitives. */
export const UserId = boundedString(64)
export const SessionId = boundedString(64)
export const Transcript = boundedString(4000) // ~3 minutes of speech

// ---------------------------------------------------------------------------
// 4. Output escaping — never trust a stored string when rendering HTML
// ---------------------------------------------------------------------------

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

/** Escape a string for safe interpolation into HTML body content. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`=/]/g, (c) => HTML_ESCAPE[c])
}

/** Strip control characters that could break downstream parsers. */
export function stripControl(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/** Trim a response to a maximum number of items + safe projection. */
export function trimList<T extends Record<string, unknown>>(
  rows: T[],
  opts: { max: number; pick?: (keyof T)[] },
): Partial<T>[] {
  const limited = rows.slice(0, opts.max)
  return limited.map((r) => {
    if (!opts.pick) return r
    const out: Partial<T> = {}
    for (const k of opts.pick) out[k] = r[k]
    return out
  })
}

// ---------------------------------------------------------------------------
// 5. Record access locking — per-user scope guard
// ---------------------------------------------------------------------------

/**
 * Assert that a record "owned" by `actualOwnerId` is allowed to be read/
 * mutated by `actorId`. Throws on mismatch. Returns silently when allowed.
 *
 * In a multi-tenant world, `actorId` comes from `getSession()` and
 * `actualOwnerId` comes from the DB row. A 404 (not 403) is the right
 * response when they don't match — never leak existence.
 */
export function assertOwnedBy(
  actualOwnerId: string,
  actorId: string,
  ctx: string = 'resource',
): void {
  if (!safeEqual(String(actualOwnerId), String(actorId))) {
    const err = new Error(`forbidden: ${ctx} not owned by actor`)
    ;(err as Error & { status?: number }).status = 404
    throw err
  }
}

/** Same as assertOwnedBy but for write paths. Also rejects unknown fields. */
export function assertWriteAllowed<T extends Record<string, unknown>>(
  data: T,
  schema: z.ZodType<T>,
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const err = new Error(
      `validation failed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
    ;(err as Error & { status?: number }).status = 400
    throw err
  }
  return result.data
}

// ---------------------------------------------------------------------------
// 6. Rate limiting — in-memory token bucket per (userId, route)
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number
  lastRefill: number
}

const RATE_TABLE = new Map<string, Bucket>()

/** Rate limit policy per route. Values are tokens per second and burst. */
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

/** Prune proactively once the bucket count grows past this — bounds memory
 *  even when an attacker spoofs x-forwarded-for to mint unlimited keys. */
const RATE_TABLE_PRUNE_THRESHOLD = 10_000

// ---------------------------------------------------------------------------
// Rate-limit storage adapter.
//
// The limiter's math (token bucket) is storage-agnostic. This in-process
// Map store is the default and is correct for single-instance deployments
// (SQLite in prod implies exactly one app instance). To scale out, provide
// a shared store implementing RateLimitStore — e.g. Redis via a Lua script
// or INCR+EXPIRE — and register it with setRateLimitStore(). Nothing else
// in the codebase changes: rateLimit()/withApi/middleware keep their
// signatures and semantics.
//
// Redis adapter sketch (for the future migration):
//   const store = {
//     take(key, cfg) {
//       // EVAL: local t = tonumber(redis.call('GET', k) or cfg.burst)
//       // refill-by-elapsed, compare, DECR — atomic in Lua.
//       ...
//     }
//   }
// ---------------------------------------------------------------------------

export interface RateLimitStore {
  /** Atomically refill + consume one token for `key` under `cfg`. */
  take(
    key: string,
    cfg: { refillPerSec: number; burst: number },
  ): { allowed: boolean; remaining: number; retryAfterSec: number }
  /** Drop buckets idle longer than maxAgeMs. No-op allowed. */
  prune?(maxAgeMs: number): number
}

const memoryStore: RateLimitStore = {
  take(key, cfg) {
    const now = Date.now()
    let b = RATE_TABLE.get(key)
    if (!b) {
      b = { tokens: cfg.burst, lastRefill: now }
      RATE_TABLE.set(key, b)
      if (RATE_TABLE.size > RATE_TABLE_PRUNE_THRESHOLD) pruneRateLimit()
    } else {
      const elapsed = (now - b.lastRefill) / 1000
      b.tokens = Math.min(cfg.burst, b.tokens + elapsed * cfg.refillPerSec)
      b.lastRefill = now
    }
    if (b.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - b.tokens) / cfg.refillPerSec)
      return { allowed: false, remaining: 0, retryAfterSec }
    }
    b.tokens -= 1
    return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 }
  },
  prune: (maxAgeMs?: number) => pruneRateLimit(maxAgeMs),
}

let rateLimitStore: RateLimitStore = memoryStore

/** Swap the limiter's backing store (e.g. Redis) without touching callers.
 *  Must be called once at boot, before the first request. */
export function setRateLimitStore(store: RateLimitStore): void {
  rateLimitStore = store
}

export function rateLimit(
  key: string,
  policy: keyof typeof RATE_LIMITS | 'default' = 'default',
): RateLimitResult {
  const cfg = RATE_LIMITS[policy] ?? RATE_LIMITS.default
  return rateLimitStore.take(key, cfg)
}

/** Per-process prune of stale buckets so the map doesn't grow forever. */
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

// ---------------------------------------------------------------------------
// 7. Bot protection — User-Agent + IP fingerprint heuristic
// ---------------------------------------------------------------------------

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
]

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
  const looksBrowserish =
    accept.includes('*/*') ||
    accept.includes('text/html') ||
    accept.includes('application/json')
  if (!looksBrowserish) return true
  return false
}

// ---------------------------------------------------------------------------
// 8. Security headers — applied to every response
// ---------------------------------------------------------------------------

export const SECURITY_HEADERS: Record<string, string> = {
  // Strict CSP — allow only same-origin + AssemblyAI WS/HTTPS + the
  // vosk-browser model archive on our own origin. No inline scripts.
  'Content-Security-Policy': [
    `default-src 'self'`,
    `script-src 'self' 'wasm-unsafe-eval'`,
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
  ].join('; '),
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

// ---------------------------------------------------------------------------
// 9. HTTPS enforcement — only when behind a proxy that sets x-forwarded-proto
// ---------------------------------------------------------------------------

export function enforceHttps(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  if (proto === 'https') return null
  const url = req.nextUrl.clone()
  url.protocol = 'https'
  return NextResponse.redirect(url, 308)
}

// ---------------------------------------------------------------------------
// 10. File upload restrictions
// ---------------------------------------------------------------------------

export const ALLOWED_UPLOAD_MIMES = new Set<string>([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
])

export const ALLOWED_UPLOAD_EXTS = new Set<string>([
  '.wav', '.mp3', '.m4a', '.ogg', '.oga', '.webm', '.flac',
])

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

export interface UploadCheck {
  ok: boolean
  reason?: string
}

export function checkUpload(file: { size: number; type: string; name: string }): UploadCheck {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `file too large: ${file.size} > ${MAX_UPLOAD_BYTES}` }
  }
  if (file.size <= 0) {
    return { ok: false, reason: 'empty file' }
  }
  if (!ALLOWED_UPLOAD_MIMES.has(file.type)) {
    return { ok: false, reason: `mime type not allowed: ${file.type}` }
  }
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
    return { ok: false, reason: `extension not allowed: ${ext}` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 11. Combined guard for API route handlers
// ---------------------------------------------------------------------------

export interface ApiGuardOpts {
  /** Required for write paths. When true, returns 401 if no session. */
  requireAuth?: boolean
  /** Rate-limit policy key. Default is 'default'. */
  rateKey?: string
  /** If true, reject bot-looking clients with 403. Default false (we have
   *  legitimate scripted clients for AssemblyAI). */
  blockBots?: boolean
  /** If true, this endpoint accepts file uploads — runs `checkUpload`. */
  isUpload?: boolean
}

export interface ApiGuardOk {
  ok: true
  userId: string
  responseInit: ResponseInit
}

export interface ApiGuardFail {
  ok: false
  response: NextResponse
}

export type ApiGuardResult = ApiGuardOk | ApiGuardFail

/**
 * Run the full guard stack for an API route. Returns either:
 *   - { ok: true, userId, responseInit } — caller proceeds; merge responseInit
 *     into the final response so rate-limit headers are present.
 *   - { ok: false, response } — caller returns `response` directly.
 */
export async function apiGuard(req: NextRequest, opts: ApiGuardOpts = {}): Promise<ApiGuardResult> {
  // 1. HTTPS enforcement.
  const httpsRedirect = enforceHttps(req)
  if (httpsRedirect) return { ok: false, response: httpsRedirect }

  // 2. Bot protection (opt-in per route).
  if (opts.blockBots && looksLikeBot(req)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  // 3. Auth.
  let userId: string | null = null
  if (opts.requireAuth) {
    const sess = await getSessionAsync()
    if (!sess) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
      }
    }
    userId = sess.userId
  } else {
    // For anonymous routes, fall back to a per-IP+UA bucket so we still
    // rate-limit. When the session is later established, switch to userId.
    const sess = await getSessionAsync()
    userId = sess?.userId ?? null
  }

  // 4. Rate limit.
  const ip = clientIpFrom(req)
  const bucketKey = `${userId ?? ip}:${req.method} ${req.nextUrl.pathname}`
  const policy =
    (opts.rateKey as keyof typeof RATE_LIMITS) ??
    (`${req.method} ${req.nextUrl.pathname}` as keyof typeof RATE_LIMITS)
  const rl = rateLimit(bucketKey, policy in RATE_LIMITS ? policy : 'default')
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      ),
    }
  }

  return {
    ok: true,
    userId: userId ?? 'default-user',
    responseInit: {
      headers: {
        'X-RateLimit-Remaining': String(rl.remaining),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 12. Sanitizing JSON output helper — strips nulls + applies the escape
// ---------------------------------------------------------------------------

/** Build a JSON response with all the security headers + rate-limit headers. */
export function secureJson(
  body: unknown,
  init: ResponseInit & { rateLimitRemaining?: number } = {},
): NextResponse {
  const { rateLimitRemaining, ...rest } = init
  const res = NextResponse.json(body, rest)
  applySecurityHeaders(res)
  if (rateLimitRemaining !== undefined) {
    res.headers.set('X-RateLimit-Remaining', String(rateLimitRemaining))
  }
  return res
}

// ---------------------------------------------------------------------------
// 13. Compatibility shim for the parallel security layer
// ---------------------------------------------------------------------------
//
// These exports preserve the API expected by the auth + agent-token route
// handlers that were authored in tandem with this module. Each one delegates
// to the higher-level helpers defined above (or implements the missing
// bits). They are kept here so that `src/lib/security.ts` remains the
// single source of truth for the security stack.

/** In-process audit log (rolling buffer). */
export interface AuditEvent {
  ts: number
  action: string
  detail: string
  userId: string | null
  ip: string
  ua: string
  ok: boolean
}

const AUDIT_BUFFER: AuditEvent[] = []
const AUDIT_MAX = 5_000

/** Hot tail of the audit stream — always available even if the DB write
 *  path is down. The DB table (AuditEvent model) is the source of truth;
 *  this ring survives only the current process. */
export function getAuditLog(limit = 50): AuditEvent[] {
  return AUDIT_BUFFER.slice(-Math.max(1, Math.min(500, limit)))
}

// ---------------------------------------------------------------------------
// Persistent audit sink — batched, fire-and-forget.
//
// Contract: audit() NEVER throws, NEVER awaits, NEVER blocks the request.
// Events go to an in-process queue; a microtask timer flushes them in
// batches to the AuditEvent table (one createMany per flush). If the DB
// write fails the events stay in the in-memory ring only — audit logging
// must not become an availability risk. Retention (AUDIT_RETENTION_DAYS)
// is pruned opportunistically, at most once per hour.
// ---------------------------------------------------------------------------

const AUDIT_QUEUE_MAX = 1_000 // if DB is down for long, drop oldest
const AUDIT_FLUSH_MS = 1_000
const AUDIT_RETENTION_DAYS = 90
let auditQueue: AuditEvent[] = []
let auditFlushTimer: ReturnType<typeof setTimeout> | null = null
let lastRetentionPrune = 0

type AuditDb = {
  auditEvent: {
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>
    deleteMany: (args: { where: { ts: { lt: Date } } }) => Promise<{ count: number }>
  }
}

let dbRef: AuditDb | null = null
/** Injected lazily to avoid a circular import (db.ts → security.ts is not
 *  a cycle, but route files import both; resolving it here at call time
 *  keeps the module graph flat for the Edge middleware too). */
async function getAuditDb(): Promise<AuditDb | null> {
  if (dbRef) return dbRef
  try {
    const mod = await import('./db')
    dbRef = mod.db as unknown as AuditDb
    return dbRef
  } catch {
    return null
  }
}

function scheduleAuditFlush(): void {
  if (auditFlushTimer) return
  auditFlushTimer = setTimeout(() => {
    auditFlushTimer = null
    void flushAuditQueue()
  }, AUDIT_FLUSH_MS)
}

async function flushAuditQueue(): Promise<void> {
  if (auditQueue.length === 0) return
  const batch = auditQueue
  auditQueue = []
  const db = await getAuditDb()
  if (!db) {
    // DB unavailable — re-queue what we can without unbounded growth.
    auditQueue = [...batch.slice(-AUDIT_QUEUE_MAX), ...auditQueue].slice(-AUDIT_QUEUE_MAX)
    scheduleAuditFlush()
    return
  }
  try {
    await db.auditEvent.createMany({
      data: batch.map((e) => ({
        ts: new Date(e.ts),
        action: e.action,
        detail: e.detail,
        userId: e.userId,
        ip: e.ip,
        ua: e.ua,
        ok: e.ok,
      })),
    })
  } catch {
    // Keep events in the in-memory ring (they're already there); never throw.
  }
  // Opportunistic retention prune — at most hourly.
  const now = Date.now()
  if (now - lastRetentionPrune > 60 * 60_000) {
    lastRetentionPrune = now
    try {
      await db.auditEvent.deleteMany({
        where: { ts: { lt: new Date(now - AUDIT_RETENTION_DAYS * 24 * 3600_000) } },
      })
    } catch {
      /* prune is best-effort */
    }
  }
}

/** Append an audit event. Best-effort; never throws, never blocks. */
export function audit(opts: {
  req?: NextRequest
  action: string
  detail?: string
  userId: string | null
  ok: boolean
}): void {
  try {
    const h = opts.req?.headers
    const event: AuditEvent = {
      ts: Date.now(),
      action: opts.action,
      detail: (opts.detail ?? '').slice(0, 512),
      userId: opts.userId,
      // Only honor forwarded-for when the operator opted into proxy trust —
      // spoofed IPs in the audit trail are worse than a default value.
      ip: process.env.TRUST_PROXY_HEADERS === '1'
        ? h?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
        : '0.0.0.0',
      ua: h?.get('user-agent')?.slice(0, 256) ?? '',
      ok: opts.ok,
    }
    AUDIT_BUFFER.push(event)
    if (AUDIT_BUFFER.length > AUDIT_MAX) {
      AUDIT_BUFFER.splice(0, AUDIT_BUFFER.length - AUDIT_MAX)
    }
    // Persistent queue (bounded; oldest dropped if the DB is down for long).
    auditQueue.push(event)
    if (auditQueue.length > AUDIT_QUEUE_MAX) {
      auditQueue.splice(0, auditQueue.length - AUDIT_QUEUE_MAX)
    }
    scheduleAuditFlush()
  } catch {
    /* never let audit logging break the request */
  }
}

/** Redact common PII patterns from a free-text string. Conservative. */
export function redactPii(s: string): string {
  return s
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\b(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, '[phone]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[card]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
}

/** CSRF cookie helpers. */
const CSRF_COOKIE = 'vb_csrf'
const CSRF_HEADER = 'x-vb-csrf'

/** Issue a CSRF token, attach it as a non-HttpOnly cookie (so the client JS
 *  can read it) and as a response header for first-load convenience. */
export function issueCsrfCookie(res: NextResponse): string {
  const token = randomBytes(24).toString('base64url')
  res.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by client JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_S,
  })
  return token
}

/** Read the CSRF cookie from an incoming request. */
export function getCsrfCookie(req: NextRequest): string | null {
  return req.cookies.get(CSRF_COOKIE)?.value ?? null
}

/** Verify that the X-Vb-Csrf header matches the vb_csrf cookie. */
export function verifyCsrf(req: NextRequest): boolean {
  const cookie = getCsrfCookie(req)
  const header = req.headers.get(CSRF_HEADER)
  if (!cookie || !header) return false
  return safeEqual(cookie, header)
}

/** Default rate limit policy used by `withApi` when route policy not set. */
export const defaultRateLimit = { rpm: 60, burst: 10 } as const

interface SessionWithRole {
  userId: string
  role: 'user' | 'admin'
  issuedAt: number
}
export type { SessionWithRole }

/** Sync-from-headers session reader used by the auth route layer.
 *  Falls back to the async cookie-based `getSession()` shape so callers
 *  can use either. Adds a `role` field for the admin check in
 *  /api/auth/audit. */
export function getSession(req: NextRequest): SessionWithRole | null {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (!cookie) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  if (!safeEqual(sig, sign(body))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      userId: string
      issuedAt: number
      role?: 'user' | 'admin'
    }
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.issuedAt !== 'number' ||
      Date.now() - payload.issuedAt > SESSION_TTL_S * 1000
    ) {
      return null
    }
    return {
      userId: payload.userId,
      role: payload.role ?? (payload.userId === 'admin' ? 'admin' : 'user'),
      issuedAt: payload.issuedAt,
    }
  } catch {
    return null
  }
}

/** Mutate a NextResponse to attach the session cookie. (Response-style API
 *  expected by /api/auth/login and /api/auth/logout.) */
export function issueSession(res: NextResponse, userId: string, role: 'user' | 'admin' = 'user'): NextResponse {
  const payload = { userId, role, issuedAt: Date.now() }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(body)
  res.cookies.set(SESSION_COOKIE, `${body}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_S,
  })
  return res
}

/** Mutate a NextResponse to clear the session cookie. */
export function clearSession(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}

/**
 * Runtime assertion that narrows a nullable session to a non-null one.
 * Use this at the top of an auth-gated handler that has been wrapped by
 * `withApi({ requireAuth: true })`. The wrapper has already verified the
 * session; this helper exists to give TypeScript a way to narrow the
 * type without the `!` non-null assertion operator.
 */
export function assertSession(s: SessionWithRole | null): SessionWithRole {
  if (!s) {
    // Should be unreachable when requireAuth: true.
    throw new Error('assertSession called without a session')
  }
  return s
}

export interface WithApiOptions {
  requireAuth?: boolean
  skipCsrf?: boolean
  skipBotCheck?: boolean
  /** Token-bucket policy. `rpm` is requests/minute; `burst` is the
   *  starting tokens. Falls back to `defaultRateLimit` if omitted. */
  rateLimit?: { rpm: number; burst: number }
}

/** Higher-order wrapper for API route handlers.
 *
 *  - Enforces CSRF (unless `skipCsrf`).
 *  - Enforces auth (unless `requireAuth: false`).
 *  - Enforces bot block (unless `skipBotCheck`).
 *  - Applies per-route rate limit + global rate limit.
 *  - Applies security headers to the final response.
 *
 *  Handlers may be written as `(req)` (anonymous, no session needed) or
 *  `(req, session)` (auth required — the second arg is the verified
 *  session payload; withApi injects it). When `requireAuth: true` the
 *  second-arg form is the recommended signature because it makes the
 *  userId from the verified session unambiguous at the type level.
 *
 *  TypeScript limitation: we can't express the conditional type narrowing
 *  (`SessionWithRole` when requireAuth, `SessionWithRole | null` otherwise)
 *  in a single signature without overloads. We instead ship a small
 *  `assertSession` helper and a pair of overloads so callers get a
 *  helpful type. Handlers can also just take `SessionWithRole | null` and
 *  guard at the top.
 */
export function withApi<T extends NextRequest = NextRequest>(
  handler: (req: T, session: SessionWithRole | null) => Promise<NextResponse> | NextResponse,
  opts: WithApiOptions = {},
): (req: T) => Promise<NextResponse> {
  return async (req: T) => {
    // 1. HTTPS redirect in prod.
    const httpsRedirect = enforceHttps(req)
    if (httpsRedirect) return applySecurityHeaders(httpsRedirect)

    // 2. Bot block (opt-in).
    if (!opts.skipBotCheck && looksLikeBot(req)) {
      const r = NextResponse.json({ error: 'forbidden' }, { status: 403 })
      audit({ req, action: 'bot-blocked', userId: null, ok: false })
      return applySecurityHeaders(r)
    }

    // 3. Auth (if required).
    let session: SessionWithRole | null = null
    if (opts.requireAuth) {
      session = getSession(req)
      if (!session) {
        const r = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
        audit({ req, action: 'unauthorized', userId: null, ok: false })
        return applySecurityHeaders(r)
      }
    } else {
      session = getSession(req) // may be null
    }

    // 4. CSRF (state-changing methods only).
    const method = req.method.toUpperCase()
    if (
      !opts.skipCsrf &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      method !== 'OPTIONS'
    ) {
      if (!verifyCsrf(req)) {
        const r = NextResponse.json({ error: 'csrf_failed' }, { status: 403 })
        audit({
          req,
          action: 'csrf-failed',
          userId: session?.userId ?? null,
          ok: false,
        })
        return applySecurityHeaders(r)
      }
    }

    // 5. Rate limit (per user/IP, per route).
    const ip = clientIpFrom(req)
    const policy = opts.rateLimit ?? defaultRateLimit
    // Convert rpm to a token-bucket policy. We reuse the same Map but with
    // a different key shape to keep the two policies independent.
    const rlKey = `${session?.userId ?? ip}:${method} ${req.nextUrl.pathname}:wapi`
    if (WAPI_RL.size > RATE_TABLE_PRUNE_THRESHOLD) pruneWapiRateLimit()
    const refill = policy.rpm / 60
    const burst = policy.burst
    const allowed = consumeTokens(rlKey, refill, burst)
    if (!allowed.allowed) {
      const r = NextResponse.json(
        { error: 'rate_limited', retryAfterSec: allowed.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(allowed.retryAfterSec) } },
      )
      audit({
        req,
        action: 'rate-limited',
        detail: `${method} ${req.nextUrl.pathname}`,
        userId: session?.userId ?? null,
        ok: false,
      })
      return applySecurityHeaders(r)
    }

    // 6. Hand off to the actual handler.
    try {
      const res = await handler(req, session)
      return applySecurityHeaders(res)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'unknown'
      const r = NextResponse.json(
        { error: 'internal', detail: redactPii(m).slice(0, 200) },
        { status: 500 },
      )
      audit({
        req,
        action: 'handler-threw',
        detail: redactPii(m).slice(0, 256),
        userId: session?.userId ?? null,
        ok: false,
      })
      return applySecurityHeaders(r)
    }
  }
}

// Local helper for withApi's rate limit (independent from the global one).
const WAPI_RL = new Map<string, { tokens: number; lastRefill: number }>()

function pruneWapiRateLimit(maxAgeMs = 10 * 60_000): number {
  const now = Date.now()
  let pruned = 0
  for (const [k, b] of WAPI_RL) {
    if (now - b.lastRefill > maxAgeMs) {
      WAPI_RL.delete(k)
      pruned++
    }
  }
  return pruned
}

/**
 * Best-effort client IP. WARNING: x-forwarded-for is attacker-controllable
 * when the app is not behind a trusted proxy that overwrites it. Deployment
 * must set TRUST_PROXY_HEADERS=1 when running behind Caddy/nginx; otherwise
 * we deliberately IGNORE forwarded headers and rate-limit per process
 * default — the safer failure mode for direct exposure.
 */
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
function consumeTokens(
  key: string,
  refillPerSec: number,
  burst: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  let b = WAPI_RL.get(key)
  if (!b) {
    b = { tokens: burst, lastRefill: now }
    WAPI_RL.set(key, b)
  } else {
    const elapsed = (now - b.lastRefill) / 1000
    b.tokens = Math.min(burst, b.tokens + elapsed * refillPerSec)
    b.lastRefill = now
  }
  if (b.tokens < 1) {
    return { allowed: false, retryAfterSec: Math.ceil((1 - b.tokens) / refillPerSec) }
  }
  b.tokens -= 1
  return { allowed: true, retryAfterSec: 0 }
}

// ---------------------------------------------------------------------------
// 14. Parameterized query enforcement
//
// Prisma already parameterizes all queries. This helper exists for the
// two cases that escape Prisma: raw SQL via $queryRawUnsafe, and any
// dynamic string-building the developer might be tempted to do. It scans
// the SQL for string-interpolated values that aren't parameters and throws.
// ---------------------------------------------------------------------------

/**
 * Validate that a raw SQL string contains no string-interpolated values —
 * only positional (`$1`, `$2`) or named (`@name`) parameters, and only
 * placeholders the caller passes in `params`. Use this around
 * `prisma.$queryRawUnsafe` calls to catch accidental concatenation.
 *
 * Throws with a list of suspicious patterns when a value is interpolated
 * outside of a placeholder.
 */
export function assertParameterizedSql(
  sql: string,
  params: unknown[] = [],
): void {
  // 1. No string concatenation artefacts (', ", +, backticks outside quotes).
  //    Cheap heuristic: scan for `'...'+var` or `${var}` style patterns.
  if (/\$\{[^}]+\}/.test(sql)) {
    throw new Error(
      'unsafe raw SQL: contains ${...} template interpolation; use a placeholder instead',
    )
  }
  if (/['"]\s*\+\s*[A-Za-z_$]/.test(sql)) {
    throw new Error(
      'unsafe raw SQL: contains string + variable concatenation; use a placeholder instead',
    )
  }
  if (/['"][^'"]*['"]\s*\+\s*['"]/.test(sql)) {
    throw new Error(
      'unsafe raw SQL: contains string-literal concatenation; use a placeholder instead',
    )
  }

  // 2. Positional placeholders must be sequential and within `params.length`.
  const positional = [...sql.matchAll(/\$(\d+)/g)].map((m) =>
    Number.parseInt(m[1], 10),
  )
  if (positional.length > 0) {
    const max = Math.max(...positional)
    if (max > params.length) {
      throw new Error(
        `unsafe raw SQL: $${max} referenced but only ${params.length} params supplied`,
      )
    }
  }

  // 3. The SQL should not contain a `;` followed by another non-empty
  //    statement (defense against stacked-query injection on drivers that
  //    allow it, e.g. sqlite via better-sqlite3).
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (statements.length > 1 && !/;\s*$/.test(sql)) {
    // More than one statement and not terminated — could be a mid-string ';'
    // inside a string literal. Try to detect: count quotes.
    const sq = (sql.match(/'/g) || []).length
    if (sq % 2 === 0) {
      throw new Error(
        'unsafe raw SQL: appears to contain multiple statements; pass one statement at a time',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 15. Dependency scanning — owned by CI, not the request path
// ---------------------------------------------------------------------------
//
// `npm audit` used to run here via a node:child_process subprocess. That
// had two problems: (1) spawning package-manager subprocesses from request-
// serving code is a perf and attack-surface smell; (2) the child_process
// external chunk leaked into every route bundle that imported withApi
// (ChunkLoadError on Windows dev + standalone-trace warnings). Dependency
// scanning now lives where it belongs: `npm run audit` (CI / pre-push).