import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  withApi,
  audit,
  assertSession,
  encrypt,
  decrypt,
  type SessionWithRole,
} from '@/lib/security'

/**
 * User preferences — fully wrapped by withApi (auth + CSRF + rate limit).
 * userId in the body is IGNORED — session identity is the only source of
 * truth.
 *
 * pronunciationOverrides and customCommands can contain things the user
 * SPOKE (PII). They are encrypted at rest with AES-256-GCM; rows written
 * before this hardening (plaintext JSON) are still readable — decrypt
 * gracefully falls back to the raw value when it isn't valid ciphertext.
 */

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

/** Serialize + encrypt a spoken-content map for storage. */
function encryptJsonField(v: Record<string, string> | undefined): string {
  return encrypt(JSON.stringify(v ?? {}))
}

/** Decrypt + parse a stored field; tolerates legacy plaintext rows. */
function decryptJsonField(s: string): Record<string, string> {
  try {
    const plain = decrypt(s)
    return safeParseJson(plain) as Record<string, string>
  } catch {
    // Legacy plaintext row — return it parsed if valid JSON, else empty.
    return safeParseJson(s) as Record<string, string>
  }
}

const prefsShape = {
  voiceSpeed: z.number().min(0.5).max(2).optional(),
  voicePitch: z.number().min(0.5).max(2).optional(),
  voiceVolume: z.number().min(0).max(1).optional(),
  selectedVoice: z.string().max(64).optional(),
  responseVerbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
  voiceEnginePref: z.enum(['auto', 'assemblyai-agent', 'on-device-vosk', 'web-speech', 'text-input']).optional(),
  autoRecoverPrimary: z.boolean().optional(),
  soundTheme: z.string().max(32).optional(),
  soundVolume: z.number().min(0).max(1).optional(),
  hapticFeedback: z.boolean().optional(),
  autoDescribe: z.boolean().optional(),
  fontSize: z.enum(['small', 'medium', 'large', 'xlarge']).optional(),
  highContrast: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  keyboardShortcuts: z.boolean().optional(),
  spatialAudio: z.boolean().optional(),
  pronunciationOverrides: z.record(z.string().max(64), z.string().max(256)).optional(),
  customCommands: z.record(z.string().max(128), z.string().max(256)).optional(),
}

const PrefsPutBody = z.object(prefsShape).strict()
const PrefsGetQuery = z
  .object({})
  .strict()

// ----- GET /api/preferences -----
async function getHandler(_req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let preferences = await db.userPreferences.findUnique({ where: { userId } })
  if (!preferences) {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: 'VoiceBridge User' },
    })
    preferences = await db.userPreferences.create({ data: { userId } })
  }
  return NextResponse.json({
    preferences: {
      ...preferences,
      pronunciationOverrides: decryptJsonField(preferences.pronunciationOverrides),
      customCommands: decryptJsonField(preferences.customCommands),
    },
  })
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })

// ----- PUT /api/preferences -----
async function putHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PrefsPutBody.safeParse(body)
  if (!parsed.success) {
    audit({
      req,
      action: 'prefs-bad-input',
      detail: parsed.error.message.slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const prefs = parsed.data

  // pronunciationOverrides and customCommands contain content the user
  // SPOKE — encrypt at rest with AES-256-GCM (see module header).

  const preferences = await db.userPreferences.upsert({
    where: { userId },
    update: {
      voiceSpeed: prefs.voiceSpeed,
      voicePitch: prefs.voicePitch,
      voiceVolume: prefs.voiceVolume,
      selectedVoice: prefs.selectedVoice,
      responseVerbosity: prefs.responseVerbosity,
      voiceEnginePref: prefs.voiceEnginePref,
      autoRecoverPrimary: prefs.autoRecoverPrimary,
      soundTheme: prefs.soundTheme,
      soundVolume: prefs.soundVolume,
      hapticFeedback: prefs.hapticFeedback,
      autoDescribe: prefs.autoDescribe,
      fontSize: prefs.fontSize,
      highContrast: prefs.highContrast,
      reducedMotion: prefs.reducedMotion,
      keyboardShortcuts: prefs.keyboardShortcuts,
      spatialAudio: prefs.spatialAudio,
      pronunciationOverrides: encryptJsonField(prefs.pronunciationOverrides),
      customCommands: encryptJsonField(prefs.customCommands),
    },
    create: {
      userId,
      voiceSpeed: prefs.voiceSpeed ?? 1.0,
      voicePitch: prefs.voicePitch ?? 1.0,
      voiceVolume: prefs.voiceVolume ?? 0.8,
      selectedVoice: prefs.selectedVoice ?? 'default',
      responseVerbosity: prefs.responseVerbosity ?? 'balanced',
      voiceEnginePref: prefs.voiceEnginePref ?? 'auto',
      autoRecoverPrimary: prefs.autoRecoverPrimary ?? true,
      soundTheme: prefs.soundTheme ?? 'minimal',
      soundVolume: prefs.soundVolume ?? 0.5,
      hapticFeedback: prefs.hapticFeedback ?? true,
      autoDescribe: prefs.autoDescribe ?? true,
      fontSize: prefs.fontSize ?? 'medium',
      highContrast: prefs.highContrast ?? true,
      reducedMotion: prefs.reducedMotion ?? false,
      keyboardShortcuts: prefs.keyboardShortcuts ?? true,
      spatialAudio: prefs.spatialAudio ?? false,
      // Encrypted from day one on new rows.
      pronunciationOverrides: encryptJsonField(prefs.pronunciationOverrides),
      customCommands: encryptJsonField(prefs.customCommands),
    },
  })

  audit({ req, action: 'prefs-update', userId, ok: true })

  return NextResponse.json({
    preferences: {
      ...preferences,
      pronunciationOverrides: decryptJsonField(preferences.pronunciationOverrides),
      customCommands: decryptJsonField(preferences.customCommands),
    },
  })
}

export const PUT = withApi(putHandler, { requireAuth: true, rateLimit: { rpm: 30, burst: 10 } })
