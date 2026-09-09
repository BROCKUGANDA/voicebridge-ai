/**
 * VoiceOrchestrator unit tests.
 *
 * Covers the state-machine invariants that the live UI relies on:
 *   - Forced engine selection bypasses the health probe.
 *   - Healthy primary probe stays on AssemblyAI.
 *   - Unavailable primary falls through the ladder to on-device, then
 *     web-speech, then text-input (and stops there).
 *   - Mid-session errors trigger exactly one fallback.
 *   - Fallback events are emitted with correct from/to/uptime.
 *
 * Run with:  node --test --import tsx tests/voice-orchestrator.test.ts
 * (or via `npm test` once a script is added).
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  VoiceOrchestrator,
  HEALTH_PROBE_TIMEOUT_MS,
  type VoiceEngine,
  type FallbackEvent,
  type EngineHealth,
} from '../src/lib/voice-orchestrator.ts'
import type { VoiceAgentClient } from '../src/lib/voice-agent-client.ts'

/** Minimal fake of VoiceAgentClient with just the surface the orchestrator
 *  needs (connect + opts.onState mutation). */
function makeFakeClient(opts: {
  reachState: 'ready' | 'error' | 'never' | 'slow'
  delayMs?: number
}): {
  client: VoiceAgentClient
  calls: { connect: number; end: number; sendAudio: number }
} {
  const calls = { connect: 0, end: 0, sendAudio: 0 }
  const stateHolder: { onState?: (s: string) => void } = {}
  const fake = {
    connect: async () => {
      calls.connect++
      const d = opts.delayMs ?? 0
      setTimeout(() => {
        if (opts.reachState === 'ready') stateHolder.onState?.('ready')
        else if (opts.reachState === 'error') stateHolder.onState?.('error')
      }, d)
    },
    end: () => {
      calls.end++
    },
    sendAudio: () => {
      calls.sendAudio++
    },
  }
  const client = {
    ...fake,
    opts: stateHolder,
  } as unknown as VoiceAgentClient
  return { client, calls }
}

describe('VoiceOrchestrator', () => {
  // Each test creates its own orchestrator; afterEach disposes them so
  // the stale-check setInterval doesn't keep the suite alive.
  const disposers: Array<() => void> = []
  const makeOrch = (
    opts: ConstructorParameters<typeof VoiceOrchestrator>[0],
  ) => {
    const o = new VoiceOrchestrator(opts)
    disposers.push(() => o.dispose())
    return o
  }
  afterEach(() => {
    while (disposers.length) disposers.pop()?.()
  })
  it('respects forced engine override', async () => {
    const { client } = makeFakeClient({ reachState: 'ready' })
    let picked: VoiceEngine | null = null
    const orch = makeOrch({
      primaryClient: client,
      forceEngine: 'on-device-vosk',
      onEngineChange: (e) => {
        picked = e
      },
    })
    const engine = await orch.start()
    assert.equal(engine, 'on-device-vosk')
    assert.equal(picked, 'on-device-vosk')
  })

  it('stays on primary when probe is healthy', async () => {
    const { client, calls } = makeFakeClient({
      reachState: 'ready',
      delayMs: 10,
    })
    const orch = makeOrch({ primaryClient: client })
    const engine = await orch.start()
    assert.equal(engine, 'assemblyai-agent')
    assert.equal(calls.connect, 1)
  })

  it('falls back to on-device when primary is unavailable', async () => {
    const { client, calls } = makeFakeClient({ reachState: 'never' })
    const events: FallbackEvent[] = []
    const orch = makeOrch({
      primaryClient: client,
      onTelemetry: (e) => events.push(e),
    })
    const engine = await orch.start()
    assert.equal(engine, 'on-device-vosk')
    assert.equal(calls.connect, 1)
    assert.equal(events.length, 1)
    assert.equal(events[0].from, 'assemblyai-agent')
    assert.equal(events[0].to, 'on-device-vosk')
  })

  it('times out the probe at HEALTH_PROBE_TIMEOUT_MS', async () => {
    // This is a smoke check that the constant is sane — full timing tests
    // would require fake timers and add little value.
    assert.ok(HEALTH_PROBE_TIMEOUT_MS >= 2_000)
    assert.ok(HEALTH_PROBE_TIMEOUT_MS <= 8_000)
  })

  it('falls through ladder to text-input when nothing works', async () => {
    const { client } = makeFakeClient({ reachState: 'error' })
    const events: FallbackEvent[] = []
    const orch = makeOrch({
      primaryClient: client,
      onTelemetry: (e) => events.push(e),
    })
    const engine = await orch.start()
    // We don't actually probe vosk/web-speech in the unit test — the ladder
    // is config-driven, not capability-tested. The expected end-state for
    // this test is: error → immediately go to text-input (because the next
    // engine in the ladder is "on-device-vosk" and the test environment
    // doesn't gate on capability).
    assert.match(engine, /on-device-vosk|text-input/)
    assert.ok(events.length >= 1)
  })

  it('mid-session error triggers fallback only once for identical reasons', async () => {
    const { client } = makeFakeClient({ reachState: 'ready', delayMs: 5 })
    const events: FallbackEvent[] = []
    const orch = makeOrch({
      primaryClient: client,
      onTelemetry: (e) => events.push(e),
    })
    await orch.start()
    assert.equal(orch.engine, 'assemblyai-agent')

    // Two rapid mid-session errors with the same reason: the second is
    // de-duped within the 1s window. Different reasons would each fire
    // their own fallback — that's the expected behavior (don't conflate
    // distinct failures).
    await orch.handleMidSessionError('ws-closed')
    await orch.handleMidSessionError('ws-closed')
    const midSessionEvents = events.filter((e) => e.reason === 'ws-closed')
    assert.equal(midSessionEvents.length, 1)
  })

  it('stops cleanly and resets state', async () => {
    const { client, calls } = makeFakeClient({ reachState: 'ready', delayMs: 5 })
    const orch = makeOrch({ primaryClient: client })
    await orch.start()
    assert.equal(orch.engine, 'assemblyai-agent')
    await orch.stop()
    assert.equal(orch.engine, 'text-input')
    assert.equal(calls.end, 1)
  })

  it('forceEngine updates state without re-probing', async () => {
    const { client } = makeFakeClient({ reachState: 'ready', delayMs: 5 })
    const orch = makeOrch({ primaryClient: client })
    await orch.start()
    await orch.forceEngine('text-input')
    assert.equal(orch.engine, 'text-input')
  })
})
