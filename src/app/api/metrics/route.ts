import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, ...metrics } = body

    const record = await db.accessibilityMetric.create({
      data: {
        sessionId: sessionId || undefined,
        taskCompletionRate: metrics.taskCompletionRate,
        avgCommandsPerTask: metrics.avgCommandsPerTask,
        errorRate: metrics.errorRate,
        userSatisfaction: metrics.userSatisfaction,
        independenceScore: metrics.independenceScore,
        cognitiveLoadScore: metrics.cognitiveLoadScore,
      },
    })

    return NextResponse.json({ metric: record })
  } catch (error) {
    console.error('Failed to save metrics:', error)
    return NextResponse.json({ error: 'Failed to save metrics' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '30')

    const metrics = await db.accessibilityMetric.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { recordedAt: 'desc' },
      take: limit,
    })

    // Calculate aggregates
    const avgMetrics = {
      avgCompletionRate: 0,
      avgErrorRate: 0,
      avgSatisfaction: 0,
      avgIndependence: 0,
      avgCognitiveLoad: 0,
      totalSessions: metrics.length,
    }

    if (metrics.length > 0) {
      avgMetrics.avgCompletionRate =
        metrics.reduce((s, m) => s + (m.taskCompletionRate || 0), 0) / metrics.length
      avgMetrics.avgErrorRate =
        metrics.reduce((s, m) => s + (m.errorRate || 0), 0) / metrics.length
      avgMetrics.avgSatisfaction =
        metrics.reduce((s, m) => s + (m.userSatisfaction || 0), 0) / metrics.length
      avgMetrics.avgIndependence =
        metrics.reduce((s, m) => s + (m.independenceScore || 0), 0) / metrics.length
      avgMetrics.avgCognitiveLoad =
        metrics.reduce((s, m) => s + (m.cognitiveLoadScore || 0), 0) / metrics.length
    }

    return NextResponse.json({ metrics, aggregates: avgMetrics })
  } catch (error) {
    console.error('Failed to fetch metrics:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}