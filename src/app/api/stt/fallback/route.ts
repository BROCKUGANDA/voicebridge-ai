import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/stt/fallback — server-side counterpart for the on-device STT and
 * browser Web Speech API paths. The browser has the audio transcribed but
 * no LLM to route it. We do the same intent parsing + dispatch_tool work
 * that AssemblyAI's agent does server-side, but as a thin request/response.
 *
 * Security:
 *   - Input validated via `SttFallbackBody` (Zod strict) — rejects unknown
 *     fields (field-tampering protection) and bounds string length.
 *   - requireAuth: a session cookie is mandatory — this route parses user
 *     speech and writes interaction history, so it must not run anonymously.
 *   - CSRF bypassed (browsers may POST during initial mic capture before
 *     they've fetched a CSRF token); SameSite=Strict cookies carry the
 *     defense instead.
 *   - Audit logged for every dispatch; scoping always uses the session user.
 */

import { parseIntent } from '@/lib/voice-processor'
import {
  withApi,
  audit,
  applySecurityHeaders,
  assertSession,
  type SessionWithRole,
} from '@/lib/security'
import { SttFallbackBody, type SttFallbackBody as SttFallbackBodyT } from '@/lib/api-schemas'

export const runtime = 'nodejs'

async function handler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId

  // Parse body.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Strict Zod validation — rejects unknown fields.
  const parsed = SttFallbackBody.safeParse(raw)
  if (!parsed.success) {
    audit({
      req,
      action: 'stt-fallback-bad-input',
      detail: parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
        .slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const body: SttFallbackBodyT = parsed.data

  // 1. Parse intent locally.
  const intent = parseIntent(body.transcript)

  // 2. Route through the existing dispatcher, scoped to the session user.
  // Forward the caller's session cookie so the dispatcher authorizes and
  // scopes this hop as the same user. Merge headers carefully — a second
  // `headers` key in the spread used to wipe content-type.
  const cookie = req.headers.get('cookie')
  const dispatcherUrl = new URL('/api/agent/tools', req.nextUrl.origin)
  const toolResult = await fetch(dispatcherUrl.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    cache: 'no-store',
    body: JSON.stringify({
      call_id: `fb-${Date.now()}`,
      name: 'dispatch_tool',
      arguments: {
        endpoint: pickEndpoint(intent.intent),
        method: pickMethod(intent.intent),
        query: {},
        body: intent.entities,
      },
    }),
  }).catch(() => null)

  // Tool result is best-effort.
  let responseText = synthesizeReply(intent)
  if (toolResult && toolResult.ok) {
    try {
      const payload = (await toolResult.json()) as {
        ok?: boolean
        result?: { ok?: boolean; result?: unknown }
        error?: string
      }
      if (payload.ok && payload.result) {
        responseText = mergeToolResult(intent, payload.result)
      }
    } catch {
      /* keep synthesized reply */
    }
  }

  // 3. Persist (best-effort), scoped to the session user.
  await persist(req, body, userId, intent, responseText).catch((err) => {
    console.error('[stt/fallback] persist failed', err)
  })

  audit({
    req,
    action: 'stt-fallback-dispatch',
    detail: `intent=${intent.intent} engine=${body.engine ?? 'on-device-vosk'}`,
    userId,
    ok: true,
  })

  return applySecurityHeaders(
    NextResponse.json({
      ok: true,
      intent: intent.intent,
      entities: intent.entities,
      response: responseText,
      engine: body.engine ?? 'on-device-vosk',
    }),
  )
}

function pickEndpoint(intent: string): string {
  switch (intent) {
    case 'adjust_speed':
    case 'adjust_volume':
    case 'smart_home':
      return 'preferences'
    default:
      return 'conversation'
  }
}

function pickMethod(intent: string): 'GET' | 'POST' {
  if (intent === 'adjust_speed' || intent === 'adjust_volume' || intent === 'smart_home') {
    return 'POST'
  }
  return 'POST'
}

function synthesizeReply(intent: ReturnType<typeof parseIntent>): string {
  switch (intent.intent) {
    case 'help':
      return 'I can describe the page, read content, click elements, search, fill forms, and adjust voice settings.'
    case 'cancel':
      return 'Action cancelled.'
    case 'navigate':
      return intent.entities.target
        ? `Opening ${intent.entities.target}.`
        : 'Where should I go? Say a panel name like metrics or settings.'
    case 'describe_page':
      return 'Describe the page runs locally — I am also noting the request.'
    case 'general_chat':
      return `I heard you say "${intent.originalText}". I'm running in fallback mode so I can't chat, but I can still navigate, describe, and read for you.`
    default:
      return 'I noted that.'
  }
}

function mergeToolResult(
  _intent: ReturnType<typeof parseIntent>,
  result: { ok?: boolean; result?: unknown },
): string {
  if (!result || result.ok === false) return synthesizeReply(_intent)
  const payload = result.result
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.message === 'string') return obj.message
  }
  return synthesizeReply(_intent)
}

async function persist(
  req: NextRequest,
  body: SttFallbackBodyT,
  userId: string,
  intent: ReturnType<typeof parseIntent>,
  responseText: string,
): Promise<void> {
  const url = new URL('/api/voice', req.nextUrl.origin)
  await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Re-use the caller's session so the write lands under their identity.
      ...(req.headers.get('cookie')
        ? { cookie: req.headers.get('cookie')! }
        : {}),
    },
    cache: 'no-store',
    body: JSON.stringify({
      sessionId: body.sessionId ?? null,
      command: body.transcript,
      response: responseText,
      success: true,
      metadata: {
        engine: body.engine ?? 'on-device-vosk',
        intent: intent.intent,
        confidence: body.confidence ?? null,
        fallback: true,
      },
    }),
  })
}

export const POST = withApi(handler, {
  requireAuth: true,
  skipCsrf: true, // browsers may POST during initial mic capture
  rateLimit: { rpm: 120, burst: 30 },
})
