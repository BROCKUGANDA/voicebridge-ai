import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, sessionId, elementType, description, confidence, boundingBox, accessibilityAttributes } = body

    const analysis = await db.visualAnalysis.create({
      data: {
        userId: userId || undefined,
        sessionId: sessionId || undefined,
        elementType: elementType || 'unknown',
        description: description || '',
        confidence: confidence || 0,
        boundingBox: JSON.stringify(boundingBox || {}),
        accessibilityAttributes: JSON.stringify(accessibilityAttributes || {}),
      },
    })

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Failed to save visual analysis:', error)
    return NextResponse.json({ error: 'Failed to save visual analysis' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '20')

    const analyses = await db.visualAnalysis.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const formatted = analyses.map((a) => ({
      ...a,
      boundingBox: JSON.parse(a.boundingBox),
      accessibilityAttributes: JSON.parse(a.accessibilityAttributes),
    }))

    return NextResponse.json({ analyses: formatted })
  } catch (error) {
    console.error('Failed to fetch analyses:', error)
    return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
  }
}
