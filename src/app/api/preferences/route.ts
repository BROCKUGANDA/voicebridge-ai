import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || 'default-user'

    let preferences = await db.userPreferences.findUnique({
      where: { userId },
    })

    if (!preferences) {
      // Create default preferences
      const user = await db.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, name: 'VoiceBridge User' },
      })

      preferences = await db.userPreferences.create({
        data: { userId: user.id },
      })
    }

    return NextResponse.json({
      preferences: {
        ...preferences,
        pronunciationOverrides: JSON.parse(preferences.pronunciationOverrides),
        customCommands: JSON.parse(preferences.customCommands),
      },
    })
  } catch (error) {
    console.error('Failed to fetch preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, ...prefs } = body
    const uid = userId || 'default-user'

    const preferences = await db.userPreferences.upsert({
      where: { userId: uid },
      update: {
        voiceSpeed: prefs.voiceSpeed,
        voicePitch: prefs.voicePitch,
        voiceVolume: prefs.voiceVolume,
        selectedVoice: prefs.selectedVoice,
        responseVerbosity: prefs.responseVerbosity,
        soundTheme: prefs.soundTheme,
        soundVolume: prefs.soundVolume,
        hapticFeedback: prefs.hapticFeedback,
        autoDescribe: prefs.autoDescribe,
        fontSize: prefs.fontSize,
        highContrast: prefs.highContrast,
        reducedMotion: prefs.reducedMotion,
        keyboardShortcuts: prefs.keyboardShortcuts,
        spatialAudio: prefs.spatialAudio,
        pronunciationOverrides: JSON.stringify(prefs.pronunciationOverrides || {}),
        customCommands: JSON.stringify(prefs.customCommands || {}),
      },
      create: {
        userId: uid,
        voiceSpeed: prefs.voiceSpeed ?? 1.0,
        voicePitch: prefs.voicePitch ?? 1.0,
        voiceVolume: prefs.voiceVolume ?? 0.8,
        selectedVoice: prefs.selectedVoice ?? 'default',
        responseVerbosity: prefs.responseVerbosity ?? 'balanced',
        soundTheme: prefs.soundTheme ?? 'minimal',
        soundVolume: prefs.soundVolume ?? 0.5,
        hapticFeedback: prefs.hapticFeedback ?? true,
        autoDescribe: prefs.autoDescribe ?? true,
        fontSize: prefs.fontSize ?? 'medium',
        highContrast: prefs.highContrast ?? true,
        reducedMotion: prefs.reducedMotion ?? false,
        keyboardShortcuts: prefs.keyboardShortcuts ?? true,
        spatialAudio: prefs.spatialAudio ?? false,
      },
    })

    return NextResponse.json({
      preferences: {
        ...preferences,
        pronunciationOverrides: JSON.parse(preferences.pronunciationOverrides),
        customCommands: JSON.parse(preferences.customCommands),
      },
    })
  } catch (error) {
    console.error('Failed to update preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
