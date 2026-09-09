import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withApi, assertSession, type SessionWithRole } from '@/lib/security'

/**
 * Accessibility metrics — wrapped by withApi. Metrics are read/write per
 * the session in the body; ownership is enforced at the sessionId lookup.
 */

const MetricsPostBody = z
  .object({
    sessionId: z.string().min(1).max(64).optional(),
    taskCompletionRate: z.number().min(0).max(1).optional(),
    avgCommandsPerTask: z.number().nonnegative().optional(),
    errorRate: z.number().min(0).max(1).optional(),
    userSatisfaction: z.number().min(0).max(1).optional(),
    independenceScore: z.number().min(0).max(1).optional(),
    cognitiveLoadScore: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 1, {
    message: 'at least one metric must be provided',
  })

const MetricsGetQuery = z
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
  const parsed = MetricsPostBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, ...metrics } = parsed.data

  // If a sessionId is given, ensure it belongs to the user.
  if (sessionId) {
    const v = await db.voiceSession.findUnique({ where: { id: sessionId } })
    if (v && v.userId !== userId) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
  }

  const record = await db.accessibilityMetric.create({
    data: {
      sessionId: sessionId ?? null,
      taskCompletionRate: metrics.taskCompletionRate ?? null,
      avgCommandsPerTask: metrics.avgCommandsPerTask ?? null,
      errorRate: metrics.errorRate ?? null,
      userSatisfaction: metrics.userSatisfaction ?? null,
      independenceScore: metrics.independenceScore ?? null,
      cognitiveLoadScore: metrics.cognitiveLoadScore ?? null,
    },
  })
  return NextResponse.json({ metric: record })
}

export const POST = withApi(postHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })

async function getHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  const { searchParams } = new URL(req.url)
  const obj: Record<string, string> = {}
  searchParams.forEach((v, k) => (obj[k] = v))
  const parsed = MetricsGetQuery.safeParse(obj)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, limit = 30 } = parsed.data

  // Scope: if a sessionId is provided, only return metrics for sessions
  // owned by this user (404-style empty response on mismatch — never leak
  // that another user owns the id).
  let rows: Awaited<ReturnType<typeof db.accessibilityMetric.findMany>>
  if (sessionId) {
    const v = await db.voiceSession.findUnique({ where: { id: sessionId } })
    if (!v || v.userId !== userId) {
      return NextResponse.json({ metrics: [], aggregates: emptyAggregates() })
    }
    rows = await db.accessibilityMetric.findMany({
      where: { sessionId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    })
  } else {
    // All metrics for this user's sessions — one typed IN query (the
    // previous version over-fetched 4x and post-filtered in memory).
    const userSessions = await db.voiceSession.findMany({
      where: { userId },
      select: { id: true },
    })
    const ids = userSessions.map((s) => s.id)
    if (ids.length === 0) {
      return NextResponse.json({ metrics: [], aggregates: emptyAggregates() })
    }
    rows = await db.accessibilityMetric.findMany({
      where: { sessionId: { in: ids } },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    })
  }

  const agg = computeAggregates(rows)
  return NextResponse.json({ metrics: rows, aggregates: agg })
}

function emptyAggregates() {
  return {
    avgCompletionRate: 0,
    avgErrorRate: 0,
    avgSatisfaction: 0,
    avgIndependence: 0,
    avgCognitiveLoad: 0,
    totalSessions: 0,
  }
}

function computeAggregates(rows: Array<{
  taskCompletionRate: number | null
  errorRate: number | null
  userSatisfaction: number | null
  independenceScore: number | null
  cognitiveLoadScore: number | null
}>) {
  const agg = emptyAggregates()
  agg.totalSessions = rows.length
  if (rows.length === 0) return agg
  const sum = (k: keyof typeof rows[number]) =>
    rows.reduce((s, r) => s + ((r[k] as number | null) ?? 0), 0)
  agg.avgCompletionRate = sum('taskCompletionRate') / rows.length
  agg.avgErrorRate = sum('errorRate') / rows.length
  agg.avgSatisfaction = sum('userSatisfaction') / rows.length
  agg.avgIndependence = sum('independenceScore') / rows.length
  agg.avgCognitiveLoad = sum('cognitiveLoadScore') / rows.length
  return agg
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })
