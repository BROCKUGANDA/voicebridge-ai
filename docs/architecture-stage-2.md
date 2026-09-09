# VoiceBridge AI — Stage 2 Architecture

## Multi-engine voice pipeline

```
                       ┌──────────────────────────────────────────────┐
                       │           VoiceAgentMic (UI)                 │
                       │  - power btn, mic rings, transcript display  │
                       │  - 24kHz AudioContext + pcm-processor worklet│
                       └──────────┬───────────────────────────────────┘
                                  │ PCM16 Int16 chunks
                                  ▼
                       ┌──────────────────────────────────────────────┐
                       │           VoiceOrchestrator                  │
                       │  (lib/voice-orchestrator.ts, state machine)  │
                       │  - engine ladder:                            │
                       │      1. assemblyai-agent  (primary)          │
                       │      2. on-device-vosk    (offline fallback) │
                       │      3. web-speech        (browser native)   │
                       │      4. text-input        (last resort)      │
                       │  - health probe: 4s timeout for primary      │
                       │  - mid-session error → fallback (1s dedupe)  │
                       │  - telemetry via onTelemetry → /api/voice    │
                       └──────────┬───────────────────────────────────┘
                                  │ engine-specific routing
        ┌─────────────────────────┼─────────────────────────────┐
        ▼                         ▼                             ▼
  ┌────────────┐         ┌─────────────────┐         ┌──────────────────┐
  │AssemblyAI  │         │  Vosk (WASM)    │         │ Web Speech API   │
  │Voice Agent │         │  on-device      │         │ (browser built-in│
  │  cloud     │         │  ~40MB model    │         │  not yet wired)  │
  └─────┬──────┘         └──────┬──────────┘         └────────┬─────────┘
        │ transcripts + tool    │ Int16→Float32              │ (planned)
        │   calls via WSS       │ PCM16 chunks               │
        │                       ▼                            │
        │             ┌────────────────────┐                 │
        │             │   /api/stt/        │                 │
        │             │     fallback       │◀────────────────┘
        │             │  - parseIntent     │
        │             │  - dispatch_tool   │
        │             │  - persist to      │
        │             │    InteractionHistory
        │             └─────────┬──────────┘
        │                       │
        └───────────────────────┴─── both paths converge ───┐
                                                          ▼
                                            ┌──────────────────────────┐
                                            │  SpeechSynthesis (TTS)   │
                                            │  browser built-in, no API│
                                            │  key, uses settings-     │
                                            │  store voice prefs       │
                                            └──────────────────────────┘
```

## Fallback decision matrix

| Trigger                                | Action                                            |
|----------------------------------------|---------------------------------------------------|
| `start()` called                       | Probe AssemblyAI; if healthy → primary, else ladder |
| AssemblyAI `ready` within 4s           | Stay on `assemblyai-agent`                        |
| Probe timeout / error                  | Fall back to `on-device-vosk`                     |
| Vosk model load fails                  | Fall back to `web-speech`                         |
| Web Speech not available               | Fall back to `text-input`                         |
| Mid-session WS close (code != 1000)    | `handleMidSessionError` → ladder step             |
| Two identical errors within 1s         | De-duped (no fallback thrash)                     |
| User changes `voiceEnginePref` in settings | `forceEngine` re-activates without re-probing |
| `dispose()` / `stop()`                 | Release timers, reset state, end AssemblyAI       |

## Engine telemetry shape

Each fallback event is persisted to `InteractionHistory.metadata`:

```json
{
  "kind": "engine-fallback",
  "from": "assemblyai-agent",
  "to": "on-device-vosk",
  "reason": "probe-timeout",
  "uptimeMs": 4023,
  "ts": 1757000000000
}
```

The user transcript itself lands via `/api/voice` with `metadata.engine`
set to the producing engine and `metadata.fallback: true` for the local paths.

## Files added/modified (Stage 2)

```
src/
  app/api/stt/fallback/route.ts          # NEW: text-only round-trip
  hooks/use-on-device-stt.ts             # NEW: vosk-browser wrapper
  hooks/use-voice-orchestrator.ts        # NEW: orchestrator React adapter
  lib/voice-orchestrator.ts              # NEW: state machine
  stores/settings-store.ts               # MOD: +voiceEnginePref, +autoRecoverPrimary
  components/voicebridge/VoiceAgentMic.tsx  # MOD: branches audio by engine
  components/voicebridge/SettingsPanel.tsx  # MOD: +Engine tab
  hooks/use-voice-agent.ts               # MOD: expose client
tests/voice-orchestrator.test.ts         # NEW: 8 unit tests
public/models/vosk-model-small-en-us.tar.gz  # NEW: 41MB model
package.json                             # MOD: +test script
tsconfig.json                            # MOD: +allowImportingTsExtensions
```
