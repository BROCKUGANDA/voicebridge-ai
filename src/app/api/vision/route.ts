import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withApi, audit, assertSession, type SessionWithRole } from '@/lib/security'

/**
 * Visual analysis records — wrapped by withApi. userId from the body is
 * ignored; session identity is authoritative.
 */

const VisionPostBody = z
  .object({
    sessionId: z.string().max(64).optional(),
    elementType: z.string().min(1).max(64),
    description: z.string().min(1).max(4_000),
    confidence: z.number().min(0).max(1).optional(),
    boundingBox: z.record(z.string(), z.number()).optional(),
    accessibilityAttributes: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

const VisionGetQuery = z
  .object({
    sessionId: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
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
  const parsed = VisionPostBody.safeParse(body)
  if (!parsed.success) {
    audit({
      req,
      action: 'vision-bad-input',
      detail: parsed.error.message.slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, elementType, description, confidence, boundingBox, accessibilityAttributes } =
    parsed.data

  const analysis = await db.visualAnalysis.create({
    data: {
      userId,
      sessionId: sessionId ?? null,
      elementType,
      description,
      confidence: confidence ?? 0,
      boundingBox: JSON.stringify(boundingBox ?? {}),
      accessibilityAttributes: JSON.stringify(accessibilityAttributes ?? {}),
    },
  })

  return NextResponse.json({ analysis })
}

export const POST = withApi(postHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })

async function getHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  const { searchParams } = new URL(req.url)
  const obj: Record<string, string> = {}
  searchParams.forEach((v, k) => (obj[k] = v))
  const parsed = VisionGetQuery.safeParse(obj)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, limit = 20 } = parsed.data
  const analyses = await db.visualAnalysis.findMany({
    where: { userId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const formatted = analyses.map((a) => ({
    ...a,
    boundingBox: JSON.parse(a.boundingBox),
    accessibilityAttributes: JSON.parse(a.accessibilityAttributes),
  }))
  return NextResponse.json({ analyses: formatted })
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })
