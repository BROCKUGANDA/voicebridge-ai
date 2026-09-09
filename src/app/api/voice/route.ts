import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withApi, audit, assertSession, type SessionWithRole } from '@/lib/security'

/**
 * Voice interaction history — wrapped by withApi. userId always comes
 * from the session.
 */

const VoicePostBody = z
  .object({
    sessionId: z.string().max(64).optional(),
    command: z.string().min(1).max(8_000),
    response: z.string().max(16_000),
    success: z.boolean().optional(),
    responseTimeMs: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string().max(64), z.unknown()).optional(),
  })
  .strict()

const VoiceGetQuery = z
  .object({
    sessionId: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict()

async function postHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = VoicePostBody.safeParse(body)
  if (!parsed.success) {
    audit({
      req,
      action: 'voice-bad-input',
      detail: parsed.error.message.slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, command, response, success, responseTimeMs, metadata } = parsed.data

  // Pre-validate the session reference: with FK enforcement on, a bogus
  // sessionId would otherwise surface as an opaque 500 (SQL FK violation).
  if (sessionId) {
    const sess = await db.voiceSession.findUnique({ where: { id: sessionId } })
    if (!sess) {
      return NextResponse.json({ error: 'not_found', detail: 'unknown session' }, { status: 404 })
    }
    if (sess.userId !== userId) {
      // Don't leak that another user has a session with this id.
      return NextResponse.json({ error: 'not_found', detail: 'unknown session' }, { status: 404 })
    }
  }

  const interaction = await db.interactionHistory.create({
    data: {
      userId,
      sessionId,
      type: 'voice_command',
      command,
      response,
      success: success ?? true,
      responseTimeMs: responseTimeMs ?? null,
      metadata: JSON.stringify(metadata ?? {}),
    },
  })

  if (sessionId) {
    const v = await db.voiceSession.findUnique({ where: { id: sessionId } })
    if (v) {
      if (v.userId !== userId) {
        // Don't leak that another user has a session with this id.
        return NextResponse.json({ interaction }, { status: 200 })
      }
      await db.voiceSession.update({
        where: { id: sessionId },
        data: {
          commandCount: v.commandCount + 1,
          successCount: success ? v.successCount + 1 : v.successCount,
          errorCount: success ? v.errorCount : v.errorCount + 1,
        },
      })
    }
  }

  return NextResponse.json({ interaction })
}

export const POST = withApi(postHandler, { requireAuth: true, rateLimit: { rpm: 120, burst: 30 } })

async function getHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  const { searchParams } = new URL(req.url)
  const obj: Record<string, string> = {}
  searchParams.forEach((v, k) => (obj[k] = v))
  const parsed = VoiceGetQuery.safeParse(obj)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, limit = 50 } = parsed.data
  const interactions = await db.interactionHistory.findMany({
    where: { userId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const formatted = interactions.map((i) => ({
    ...i,
    // One corrupt legacy row must not 500 the whole list.
    metadata: safeParseJson(i.metadata),
  }))
  return NextResponse.json({ interactions: formatted })
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })
