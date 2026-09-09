/**
 * Zod schemas for every API route's input. Used by the route handlers to
 * validate at the boundary and reject tampered/malformed bodies.
 *
 * Why a separate file: keeps the security stack (security.ts) small and
 * generic; route-specific validation lives next to the data shape it
 * protects.
 *
 * Note: zod is already a project dependency (zod@^4.0.2 in package.json).
 */

import { z } from 'zod'

// ----------------------------------------------------------------------
// Generic primitives
// ----------------------------------------------------------------------

const cuid = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/)
const timestamp = z.number().int().nonnegative()
const boundedString = (max: number) => z.string().max(max)
const boundedJson = (maxBytes: number) =>
  z.unknown().refine(
    (v) => {
      try {
        return JSON.stringify(v).length <= maxBytes
      } catch {
        return false
      }
    },
    { message: `payload too large (>${maxBytes} bytes)` },
  )

// ----------------------------------------------------------------------
// /api/auth
// ----------------------------------------------------------------------

export const AuthLoginBody = z.object({
  /** Demo auth: an opaque "passphrase" (a single-user system) — in a
   *  real multi-user setup this would be a Stytch session token. */
  passphrase: z.string().min(8).max(128),
})
export type AuthLoginBody = z.infer<typeof AuthLoginBody>

// ----------------------------------------------------------------------
// /api/agent/tools (dispatcher)
// ----------------------------------------------------------------------

const ALLOWED_ENDPOINTS = [
  'conversation',
  'preferences',
  'vision',
  'voice',
  'session',
  'metrics',
] as const

const ALLOWED_METHODS_BY_ENDPOINT: Record<(typeof ALLOWED_ENDPOINTS)[number], readonly string[]> = {
  conversation: ['GET', 'POST'],
  preferences: ['GET', 'PUT'],
  vision: ['GET', 'POST'],
  voice: ['GET', 'POST'],
  session: ['GET', 'POST', 'PATCH'],
  metrics: ['GET', 'POST'],
}

export const AgentToolsBody = z.object({
  call_id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  arguments: z.object({
    endpoint: z.enum(ALLOWED_ENDPOINTS),
    method: z.string().min(1).max(8),
    query: z.record(z.string().max(64), z.union([z.string().max(256), z.number(), z.boolean()])).optional(),
    body: boundedJson(64 * 1024).optional(),
  }),
})
export type AgentToolsBody = z.infer<typeof AgentToolsBody>

/** Throw if (endpoint, method) is not in the allowlist. */
export function assertMethodAllowed(
  endpoint: (typeof ALLOWED_ENDPOINTS)[number],
  method: string,
): void {
  const allowed = ALLOWED_METHODS_BY_ENDPOINT[endpoint]
  if (!allowed.includes(method.toUpperCase())) {
    throw new Error(`${method} not allowed on /api/${endpoint}`)
  }
}

// ----------------------------------------------------------------------
// /api/stt/fallback
// ----------------------------------------------------------------------

export const SttFallbackBody = z.object({
  transcript: z.string().min(1).max(4_000),
  sessionId: z.string().max(64).optional(),
  engine: z.enum(['on-device-vosk', 'web-speech', 'text-input']).optional(),
  confidence: z.number().min(0).max(1).optional(),
})
export type SttFallbackBody = z.infer<typeof SttFallbackBody>

// ----------------------------------------------------------------------
// /api/conversation
// ----------------------------------------------------------------------

export const ConversationPostBody = z.object({
  userId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  title: z.string().max(200).optional(),
  message: z
    .object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(8_000),
      confidence: z.number().min(0).max(1).optional(),
      metadata: boundedJson(8 * 1024).optional(),
    })
    .optional(),
})
export type ConversationPostBody = z.infer<typeof ConversationPostBody>

// ----------------------------------------------------------------------
// /api/preferences
// ----------------------------------------------------------------------

export const PreferencesPutBody = z.object({
  userId: z.string().max(64).optional(),
  voiceSpeed: z.number().min(0.5).max(2.0).optional(),
  voicePitch: z.number().min(0.5).max(2.0).optional(),
  voiceVolume: z.number().min(0).max(1).optional(),
  selectedVoice: z.string().max(200).optional(),
  responseVerbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
  voiceEnginePref: z
    .enum(['auto', 'assemblyai-agent', 'on-device-vosk', 'web-speech', 'text-input'])
    .optional(),
  autoRecoverPrimary: z.boolean().optional(),
  soundTheme: z.enum(['off', 'minimal', 'detailed', 'verbose']).optional(),
  soundVolume: z.number().min(0).max(1).optional(),
  hapticFeedback: z.boolean().optional(),
  autoDescribe: z.boolean().optional(),
  fontSize: z.enum(['small', 'medium', 'large', 'xlarge']).optional(),
  highContrast: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  keyboardShortcuts: z.boolean().optional(),
  spatialAudio: z.boolean().optional(),
  pronunciationOverrides: z.record(z.string().max(64), z.string().max(128)).optional(),
  customCommands: z.record(z.string().max(64), z.string().max(128)).optional(),
})
export type PreferencesPutBody = z.infer<typeof PreferencesPutBody>

// ----------------------------------------------------------------------
// /api/voice
// ----------------------------------------------------------------------

export const VoicePostBody = z.object({
  userId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  command: z.string().min(1).max(4_000),
  response: z.string().max(8_000),
  success: z.boolean().optional(),
  responseTimeMs: z.number().int().nonnegative().max(60_000).optional(),
  metadata: boundedJson(8 * 1024).optional(),
})
export type VoicePostBody = z.infer<typeof VoicePostBody>

// ----------------------------------------------------------------------
// /api/vision
// ----------------------------------------------------------------------

export const VisionPostBody = z.object({
  userId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  elementType: z.string().max(64).optional(),
  description: z.string().max(2_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  boundingBox: boundedJson(2 * 1024).optional(),
  accessibilityAttributes: boundedJson(2 * 1024).optional(),
})
export type VisionPostBody = z.infer<typeof VisionPostBody>

// ----------------------------------------------------------------------
// /api/session
// ----------------------------------------------------------------------

export const SessionPostBody = z.object({
  userId: z.string().max(64).optional(),
})
export const SessionPatchBody = z.object({
  sessionId: cuid,
  status: z.enum(['active', 'paused', 'ended']).optional(),
})
export type SessionPostBody = z.infer<typeof SessionPostBody>
export type SessionPatchBody = z.infer<typeof SessionPatchBody>

// ----------------------------------------------------------------------
// /api/metrics
// ----------------------------------------------------------------------

export const MetricsPostBody = z.object({
  sessionId: z.string().max(64).optional(),
  taskCompletionRate: z.number().min(0).max(1).optional(),
  avgCommandsPerTask: z.number().min(0).max(1000).optional(),
  errorRate: z.number().min(0).max(1).optional(),
  userSatisfaction: z.number().min(0).max(1).optional(),
  independenceScore: z.number().min(0).max(1).optional(),
  cognitiveLoadScore: z.number().min(0).max(1).optional(),
})
export type MetricsPostBody = z.infer<typeof MetricsPostBody>

// ----------------------------------------------------------------------
// Query string helpers
// ----------------------------------------------------------------------

const queryInt = (raw: string | null, def: number, min: number, max: number) => {
  if (raw == null) return def
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

export function conversationQuery(raw: URLSearchParams) {
  return {
    sessionId: raw.get('sessionId') ?? undefined,
    limit: queryInt(raw.get('limit'), 50, 1, 200),
  }
}

export function visionQuery(raw: URLSearchParams) {
  return {
    sessionId: raw.get('sessionId') ?? undefined,
    limit: queryInt(raw.get('limit'), 20, 1, 200),
  }
}

export function voiceQuery(raw: URLSearchParams) {
  return {
    sessionId: raw.get('sessionId') ?? undefined,
    limit: queryInt(raw.get('limit'), 50, 1, 500),
  }
}

export function metricsQuery(raw: URLSearchParams) {
  return {
    sessionId: raw.get('sessionId') ?? undefined,
    limit: queryInt(raw.get('limit'), 30, 1, 500),
  }
}

export function sessionQuery(raw: URLSearchParams) {
  return {
    userId: raw.get('userId') ?? undefined,
    limit: queryInt(raw.get('limit'), 10, 1, 100),
  }
}

export function preferencesQuery(raw: URLSearchParams) {
  return {
    userId: raw.get('userId') ?? undefined,
  }
}

// Re-export primitives for direct use
export { cuid, timestamp, boundedString, boundedJson }
