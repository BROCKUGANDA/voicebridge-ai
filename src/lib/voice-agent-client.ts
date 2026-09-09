/**
 * Voice Agent API client — runs in the browser.
 *
 * Wraps a single WebSocket to `wss://agents.us.assemblyai.com/v1/ws` and
 * routes the event stream:
 *   - user audio       → encode Int16 → JSON `{type:"input.audio", audio: b64}`
 *   - server events    → typed handlers (transcript, reply, tool calls, etc.)
 *   - tool.call        → fetch /api/agent/tools, reply with tool.result
 *
 * Authoritative ref: Section 10 of the AssemblyAI coding-agent instructions
 * and the browser-integration guide. Key gotchas baked in here:
 *   - Audio is base64-encoded PCM16 24 kHz mono, sent as JSON events (NOT
 *     raw binary frames — this product differs from realtime STT).
 *   - `Authorization: Bearer ...` is required on the Voice Agent API only.
 *   - Single-use token: fetch a fresh one per session, including resumes.
 *   - Always send `session.end` on teardown to avoid the 3-hour cap.
 */

import {
  SYSTEM_PROMPT,
  AGENT_GREETING,
  AGENT_KEYTERMS,
  AGENT_TOOLS,
} from './voice-agent-config'
import { apiFetch } from './api-client'

export type AgentClientState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'ended'
  | 'error'

export interface AgentTranscriptChunk {
  /** "user" or "agent" */
  role: 'user' | 'agent'
  /** Partial or final transcript text. */
  text: string
  /** True when the server has marked this turn finalized. */
  final: boolean
}

export interface AgentToolCall {
  call_id: string
  name: string
  arguments: Record<string, unknown>
}

/**
 * Tool schema shape — flat per the Voice Agent API spec (NOT OpenAI's
 * nested `{type:"function", function:{...}}`). Re-exported so other modules
 * (notably voice-agent-config.ts) can build typed tool definitions without
 * having to redeclare the shape.
 */
export interface ToolSchema {
  type: 'function'
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >
    required: string[]
  }
}

export interface AgentClientOptions {
  /** Receives lifecycle transitions; UI uses these to drive voiceState. */
  onState?: (state: AgentClientState) => void
  /** Receives partial + final transcripts (user and agent). */
  onTranscript?: (chunk: AgentTranscriptChunk) => void
  /** Receives decoded Int16 PCM for the agent's spoken reply. */
  onAudio?: (pcm16: Int16Array, sampleRate: number) => void
  /** Fires when a reply was interrupted (user barged in) — flush buffers. */
  onInterrupt?: () => void
  /** Fires when the server reports a session-level error. */
  onError?: (message: string) => void
}

const TOKEN_ENDPOINT = '/api/agent/token'
// Documented browser endpoint (US region also works; this is the canonical host).
const WS_BASE = 'wss://agents.assemblyai.com/v1/ws'
const SAMPLE_RATE = 24_000

/** 24 kHz mono PCM16 little-endian, no header. */
function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  // Chunk to keep call stacks small for long buffers.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
}

export class VoiceAgentClient {
  private ws: WebSocket | null = null
  private state: AgentClientState = 'idle'
  private opts: AgentClientOptions
  /** Stored when session.ready arrives so we can resume within 30 s. */
  private sessionId: string | null = null
  /** Stored agent id from the token endpoint (preferred connect path). */
  private agentId: string | null = null
  /** Tracks whether a reply is currently playing — used to ignore stale audio. */
  private inReply = false
  /** Whether the user has explicitly asked to end the session. */
  private ending = false

  constructor(opts: AgentClientOptions = {}) {
    this.opts = opts
  }

  /** Single combined lifecycle helper used by the hook. */
  private setState(next: AgentClientState) {
    if (this.state === next) return
    this.state = next
    this.opts.onState?.(next)
  }

  /** Connect: mint token → open WebSocket → send session.update. */
  async connect(): Promise<void> {
    if (this.ws) return
    this.ending = false
    this.setState('connecting')

    const tokenRes = await apiFetch(TOKEN_ENDPOINT, { method: 'GET' })
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '')
      this.fail(`Failed to mint agent token (${tokenRes.status}): ${text}`)
      return
    }
    const { token, agentId } = (await tokenRes.json()) as {
      token: string
      agentId?: string | null
    }
    if (!token) {
      this.fail('Token endpoint returned no token.')
      return
    }
    this.agentId = agentId ?? null

    const wsUrl = new URL(WS_BASE)
    wsUrl.searchParams.set('token', token)
    const ws = new WebSocket(wsUrl.toString())
    this.ws = ws

    ws.addEventListener('open', () => {
      // Prefer the stored agent (recommended path). Fall back to inline
      // session.update so the product still works without publish-agent.
      const session = this.agentId
        ? { agent_id: this.agentId }
        : {
            system_prompt: SYSTEM_PROMPT,
            greeting: AGENT_GREETING,
            input: {
              format: { encoding: 'audio/pcm' },
              keyterms: AGENT_KEYTERMS,
              turn_detection: {
                vad_threshold: 0.5,
                min_silence: 200,
                max_silence: 1000,
                interrupt_response: true,
              },
            },
            output: {
              voice: 'anna',
              format: { encoding: 'audio/pcm' },
            },
            tools: AGENT_TOOLS,
          }
      try {
        ws.send(JSON.stringify({ type: 'session.update', session }))
      } catch (err) {
        this.fail(
          `Failed to send session.update: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    })

    ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data)
    })

    ws.addEventListener('error', () => {
      this.fail('WebSocket error — see browser console for details.')
    })

    ws.addEventListener('close', (event) => {
      // Per docs: 1008 = unauthorized, 3005 = server-side cancel, etc.
      // Auto-resume within the documented 30 s window when the close was
      // unexpected and we still have a live session id.
      if (!this.ending && event.code !== 1000) {
        const canResume =
          this.sessionId !== null &&
          (event.code === 1006 || event.code === 1011 || event.code === 1012 || event.code === 1013)
        if (canResume && this.sessionId) {
          const resumeId = this.sessionId
          this.ws = null
          this.setState('connecting')
          // Fresh single-use token required for resume.
          void this.resume(resumeId).then(undefined, () => {
            this.fail(`Connection closed (code ${event.code}) and resume failed.`)
          })
          return
        }
        this.fail(`Connection closed (code ${event.code}).`)
      } else {
        this.setState('ended')
      }
      this.ws = null
    })
  }

  /**
   * Send a chunk of mic audio to the server as a base64-encoded PCM16 Int16
   * frame inside an `input.audio` JSON event. Safe to call repeatedly; chunks
   * are typically ~50 ms (2,400 bytes at 24 kHz mono).
   */
  sendAudio(pcm16: Int16Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (this.state !== 'ready' && this.state !== 'listening') return
    try {
      this.ws.send(
        JSON.stringify({ type: 'input.audio', audio: int16ToBase64(pcm16) }),
      )
      if (this.state === 'ready') this.setState('listening')
    } catch (err) {
      this.fail(
        `sendAudio failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** Graceful end — sends `session.end` then closes. */
  end(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.setState('ended')
      return
    }
    this.ending = true
    try {
      this.ws.send(JSON.stringify({ type: 'session.end' }))
    } catch {
      /* fall through to close */
    }
    try {
      this.ws.close()
    } catch {
      /* noop */
    }
    this.setState('ended')
  }

  /**
   * Stop the agent mid-reply WITHOUT ending the session.
   *
   * Local playback is flushed by the caller (`onInterrupt`). On the wire we
   * stop accepting reply audio and mark the turn done so the next mic chunk
   * is treated as a new turn. Sending `session.end` here used to kill the
   * live session every time the user hit Stop — a one-way door.
   */
  forceEndpoint(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.inReply = false
    this.opts.onInterrupt?.()
    // Nudge the server that the user took the floor — some agents treat an
    // empty input.audio as end-of-turn; harmless if ignored.
    try {
      this.ws.send(
        JSON.stringify({
          type: 'input.audio',
          audio: int16ToBase64(new Int16Array(480)),
        }),
      )
    } catch {
      /* ignore */
    }
    this.setState('ready')
  }

  /** Resume a previous session by id (within 30 s of disconnect). */
  async resume(sessionId: string): Promise<void> {
    const tokenRes = await apiFetch(TOKEN_ENDPOINT, { method: 'GET' })
    if (!tokenRes.ok) {
      this.fail(`Failed to mint resume token (${tokenRes.status})`)
      return
    }
    const { token } = (await tokenRes.json()) as { token: string }
    if (!token) {
      this.fail('Token endpoint returned no token.')
      return
    }
    const wsUrl = new URL(WS_BASE)
    wsUrl.searchParams.set('token', token)
    const ws = new WebSocket(wsUrl.toString())
    this.ws = ws
    this.setState('connecting')

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'session.resume', session_id: sessionId }))
    })
    ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data)
    })
    ws.addEventListener('close', (event) => {
      if (!this.ending && event.code !== 1000) {
        this.fail(`Resume closed (code ${event.code}).`)
      }
      this.ws = null
    })
    ws.addEventListener('error', () => {
      this.fail('WebSocket error during resume.')
    })
  }

  get currentState(): AgentClientState {
    return this.state
  }

  get currentSessionId(): string | null {
    return this.sessionId
  }

  private fail(message: string) {
    this.setState('error')
    this.opts.onError?.(message)
  }

  private async handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const type = msg.type as string | undefined

    switch (type) {
      case 'session.ready': {
        this.sessionId = (msg.session_id as string | undefined) ?? null
        this.setState('ready')
        return
      }

      case 'input.speech.started': {
        if (this.inReply) {
          // User barged in while the agent was speaking → flush local
          // playback and tell the UI.
          this.opts.onInterrupt?.()
          this.inReply = false
        }
        this.setState('listening')
        return
      }

      case 'input.speech.stopped':
        this.setState('processing')
        return

      case 'transcript.user':
        this.opts.onTranscript?.({
          role: 'user',
          text: typeof msg.text === 'string' ? msg.text : '',
          final: true,
        })
        return

      case 'transcript.user.delta':
        this.opts.onTranscript?.({
          role: 'user',
          text: typeof msg.text === 'string' ? msg.text : '',
          final: false,
        })
        return

      case 'transcript.agent':
        this.opts.onTranscript?.({
          role: 'agent',
          text: typeof msg.text === 'string' ? msg.text : '',
          final: true,
        })
        return

      case 'reply.started':
        this.inReply = true
        this.setState('speaking')
        return

      case 'reply.audio': {
        // NOTE the field name is `data` here, not `audio` — easy to miss.
        const b64 = msg.data as string | undefined
        if (b64) {
          try {
            const pcm = base64ToInt16(b64)
            this.opts.onAudio?.(pcm, SAMPLE_RATE)
          } catch (err) {
            console.warn('Failed to decode reply.audio', err)
          }
        }
        return
      }

      case 'reply.done':
        this.inReply = false
        if (msg.status === 'interrupted') this.opts.onInterrupt?.()
        this.setState('ready')
        return

      case 'tool.call': {
        const call = msg as unknown as AgentToolCall & { type: string }
        await this.dispatchToolCall(call)
        return
      }

      case 'session.error':
      case 'session.end':
      case 'session.ended':
      case 'error': {
        const message =
          typeof msg.message === 'string'
            ? msg.message
            : typeof msg.error === 'string'
              ? msg.error
              : 'Session ended'
        this.opts.onError?.(message)
        if (type !== 'session.error' && type !== 'error') {
          this.setState('ended')
        } else {
          this.fail(message)
        }
        return
      }

      default:
        return
    }
  }

  private async dispatchToolCall(call: AgentToolCall) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      const res = await apiFetch('/api/agent/tools', {
        method: 'POST',
        body: {
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments ?? {},
        },
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        result?: unknown
        error?: string
        call_id?: string
      }
      const toolResult = payload.ok
        ? JSON.stringify(payload.result ?? {})
        : JSON.stringify({ error: payload.error ?? 'Tool failed' })
      // Per docs: send tool.result AFTER reply.done fires for the turn.
      // Because tool.call arrives during the reply, we send immediately and
      // let the server queue it correctly.
      this.ws.send(
        JSON.stringify({
          type: 'tool.result',
          call_id: payload.call_id ?? call.call_id,
          result: toolResult,
        }),
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Tool dispatch error'
      try {
        this.ws?.send(
          JSON.stringify({
            type: 'tool.result',
            call_id: call.call_id,
            result: JSON.stringify({ error: message }),
          }),
        )
      } catch {
        /* noop */
      }
    }
  }
}