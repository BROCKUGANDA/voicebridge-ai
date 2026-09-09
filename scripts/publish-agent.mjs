/**
 * Publish (or update) the VoiceBridge Voice Agent on AssemblyAI.
 *
 * Creates a stored agent — the recommended deploy path — and writes the
 * returned id to .env.local as ASSEMBLYAI_AGENT_ID. The browser then binds
 * with `{ type: "session.update", session: { agent_id } }` so prompt, voice,
 * tools, and turn detection live on AssemblyAI's side.
 *
 * Usage:
 *   node scripts/publish-agent.mjs
 *   ASSEMBLYAI_API_KEY=... node scripts/publish-agent.mjs
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }
}

loadEnv()

const apiKey = process.env.ASSEMBLYAI_API_KEY
if (!apiKey) {
  console.error('ASSEMBLYAI_API_KEY is required')
  process.exit(1)
}

// Keep in sync with src/lib/voice-agent-config.ts
const SYSTEM_PROMPT = `You are VoiceBridge, a voice-first accessibility companion for users who navigate the web by voice — particularly blind, low-vision, motor-impaired, and cognitively-diverse users.

Your job:
- Listen to the user's spoken request.
- Decide whether to answer directly from knowledge or to invoke the dispatcher tool to read/write VoiceBridge state.
- Keep replies brief and clear. Speak in short, conversational sentences.
- Never invent data. If you need info (preferences, session, metrics), call dispatch_tool to fetch it.
- If the user asks to change a setting (voice speed, volume, contrast, etc.), use dispatch_tool with endpoint="preferences" and method="PUT".
- If the user asks about past activity, call dispatch_tool with endpoint="conversation" or "metrics".
- For vision / "what's on screen" requests, call dispatch_tool with endpoint="vision" and method="GET".
- Confirm successful writes with a one-sentence spoken acknowledgement.

Practical capabilities you SHOULD use:
- Preferences: read and write voice speed, volume, verbosity, high contrast, reduced motion, keyboard shortcuts, engine preference.
- Conversation: fetch recent turns when the user asks "what did I say" or "repeat that".
- Metrics: summarize session performance when asked how the session is going.
- Voice log: last commands and success rate.
- Session: current active session status.

Daily-use workflows (prefer these over small talk):
- "How long have we been talking?" → session status via dispatch_tool endpoint="session".
- "How did I do today?" → metrics via dispatch_tool endpoint="metrics".
- "What did we talk about?" → conversation via dispatch_tool endpoint="conversation" GET.
- "Speak faster / slower" or "louder / quieter" → preferences PUT voiceSpeed or voiceVolume.
- "Turn on high contrast" / "reduce motion" → preferences PUT.
- "Log that I finished the form" → voice POST with command + success true.
- Always confirm a successful write in one short spoken sentence.

What the local UI already handles (do not claim you did these — the dashboard does them instantly):
- Switching panels (home, chat, vision, metrics, sound, accessibility, keyboard, settings).
- Describing the live page and reading main content.
- Scroll, back, forward, refresh.

Boundaries:
- You do not have a tool to click arbitrary third-party page buttons — only VoiceBridge state via dispatch_tool.
- Never expose API keys, internal IDs, or technical details.
- If a tool returns an error, paraphrase it for the user in plain language.
- Prefer the smallest useful reply. Accessibility users often hear you — long monologues are harmful.

Style:
- Plain English. No markdown, no bullet lists in speech.
- When listing items, say "first", "next", "finally" — not numbers or dashes.
- Match the user's tone: terse query gets a short answer, open question gets a friendly elaboration.
`

const AGENT_TOOLS = [
  {
    type: 'function',
    name: 'dispatch_tool',
    description:
      "Dispatch a request to one of VoiceBridge's six core API surfaces. " +
      'Use this to read or write conversations, user preferences, voice interactions, ' +
      'session state, vision analyses, or accessibility metrics. ' +
      'Choose the smallest endpoint that satisfies the user request.',
    parameters: {
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          enum: ['conversation', 'preferences', 'vision', 'voice', 'session', 'metrics'],
          description: 'Which API surface to call.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH'],
          description: 'HTTP method. Not all endpoints support all methods.',
        },
        query: {
          type: 'object',
          description: 'URL query params, e.g. { sessionId, limit }.',
        },
        body: {
          type: 'object',
          description:
            'JSON body for writes. preferences PUT keys: voiceSpeed, voicePitch, voiceVolume, responseVerbosity, soundVolume, highContrast, reducedMotion. voice POST: command, response, success.',
        },
      },
      required: ['endpoint', 'method'],
    },
  },
]

const agentBody = {
  name: 'VoiceBridge Accessibility Agent',
  system_prompt: SYSTEM_PROMPT,
  greeting:
    "Hi, I'm VoiceBridge, your voice-first accessibility companion. How can I help?",
  voice: { voice_id: 'anna' },
  input: {
    format: { encoding: 'audio/pcm', sample_rate: 24000 },
    keyterms: [
      'VoiceBridge',
      'accessibility',
      'navigate',
      'describe',
      'transcript',
      'preferences',
      'metrics',
      'vision',
      'session',
      'command',
    ],
    turn_detection: {
      vad_threshold: 0.5,
      min_silence: 200,
      max_silence: 1000,
      interrupt_response: true,
    },
  },
  output: {
    voice: 'anna',
    format: { encoding: 'audio/pcm', sample_rate: 24000 },
  },
  tools: AGENT_TOOLS,
}

const existingId = process.env.ASSEMBLYAI_AGENT_ID
const method = existingId ? 'PUT' : 'POST'
const url = existingId
  ? `https://agents.assemblyai.com/v1/agents/${existingId}`
  : 'https://agents.assemblyai.com/v1/agents'

const res = await fetch(url, {
  method,
  headers: {
    Authorization: apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(agentBody),
})

const text = await res.text()
if (!res.ok) {
  console.error(`Publish failed (${res.status}):`, text.slice(0, 500))
  process.exit(1)
}

const agent = JSON.parse(text)
const id = agent.id
if (!id) {
  console.error('No agent id in response:', text.slice(0, 300))
  process.exit(1)
}

console.log(`${existingId ? 'Updated' : 'Created'} VoiceBridge agent`)
console.log(`ASSEMBLYAI_AGENT_ID=${id}`)

// Persist to .env.local so the running app picks it up.
const envLocal = join(root, '.env.local')
const line = `ASSEMBLYAI_AGENT_ID=${id}\n`
if (existsSync(envLocal)) {
  const current = readFileSync(envLocal, 'utf8')
  if (/^ASSEMBLYAI_AGENT_ID=/m.test(current)) {
    writeFileSync(
      envLocal,
      current.replace(/^ASSEMBLYAI_AGENT_ID=.*$/m, `ASSEMBLYAI_AGENT_ID=${id}`),
    )
  } else {
    appendFileSync(envLocal, `\n${line}`)
  }
} else {
  writeFileSync(envLocal, line)
}
console.log('Wrote ASSEMBLYAI_AGENT_ID to .env.local')
