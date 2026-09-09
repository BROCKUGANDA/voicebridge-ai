# VoiceBridge AI

**Voice-first accessibility assistant** built on the [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agents/overview).

Speak to navigate a live dashboard, change settings, read metrics, and keep a full conversation log — with a multi-engine fallback ladder so the product keeps working even when the cloud is down.

> Built for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) (Sep 1–30, 2026).

---

## Why this exists

Blind, low-vision, motor-impaired, and cognitively-diverse users still fight pixel-first UIs. VoiceBridge turns the browser into a **hands-free accessibility companion**:

| You say | VoiceBridge does |
|---|---|
| “Open metrics” / “Go to settings” | Switches the live dashboard panel |
| “Describe the page” | Audible DOM/visual summary |
| “Speak faster” / “Turn on high contrast” | Writes preferences via the agent tool |
| “How did I do today?” | Speaks session metrics |
| “What did we talk about?” | Reads recent conversation |
| “Repeat that” / “Export transcript” | Recovery + handoff commands |

**Core loop:** mic → AssemblyAI Voice Agent (realtime STT + LLM + TTS + tools) → dashboard action → spoken confirmation.

---

## Architecture (30-second version)

```
Browser (Next.js dashboard)
  ├─ VoiceAgentMic  ── PCM16 24 kHz worklet ──► WSS agents.assemblyai.com
  │                                              │ token minted by our server
  │                                              │ session.update { agent_id }
  │                                              │ tool.call → /api/agent/tools
  ├─ Local client actions (nav, describe, read)  ← offline / fallback path
  └─ Engine ladder:
       1. AssemblyAI Voice Agent   (primary, cloud)
       2. Vosk on-device WASM      (offline STT)
       3. Browser Web Speech API   (fallback #2)
       4. Typed command input      (always available)

Server (Next.js route handlers + Prisma/SQLite)
  ├─ /api/agent/token   mints single-use WS tokens (API key never leaves server)
  ├─ /api/agent/tools   dispatch_tool proxy → preferences, conversation, metrics…
  ├─ /api/stt/fallback  intent parse for on-device / web-speech engines
  └─ Security stack: signed sessions, CSRF, rate limits, audit log, AES-GCM
```

Key files:

- `src/lib/voice-agent-client.ts` — browser Voice Agent WebSocket client
- `src/lib/voice-agent-config.ts` — system prompt + `dispatch_tool` schema
- `src/lib/voice-orchestrator.ts` — multi-engine health/fallback state machine
- `src/components/voicebridge/VoiceAgentMic.tsx` — power button, mic, engine UI
- `scripts/publish-agent.mjs` — create/update the stored AssemblyAI agent

---

## Quick start (judges / mentors)

### 1. Prerequisites

- Node.js 20+
- An [AssemblyAI API key](https://www.assemblyai.com/dashboard/api-keys)
- Chrome or Edge (best mic + Web Audio support)

### 2. Install & configure

```bash
git clone <this-repo>
cd voicebrigdeai
npm install
cp .env.example .env
```

Edit `.env` and set **at least**:

```bash
ASSEMBLYAI_API_KEY=sk_...
VOICEBRIDGE_AUTH_PASSPHRASE=demo-pass-phrase   # any string ≥ 8 chars
SESSION_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)
DATABASE_URL="file:./db/custom.db"
```

### 3. Publish the stored Voice Agent (recommended)

```bash
npm run db:generate
npm run db:push
npm run agent:publish
```

This creates a reusable agent on AssemblyAI (prompt, voice `anna`, keyterms, `dispatch_tool`) and writes `ASSEMBLYAI_AGENT_ID` into `.env.local`.

Without this step the client falls back to **inline** `session.update` config — still fully functional.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 → sign in with your passphrase → **tap the power button** (or press **Space**) → speak.

### 5. Try these phrases

1. “Hello” — greeting + short help  
2. “Open metrics” — panel navigation  
3. “Describe the page” — visual context  
4. “Speak a little faster” — preference write via tool  
5. “How did I do today?” — metrics read via tool  
6. “Repeat that” — accessibility recovery  

Typed commands work even with no mic: use the input under the power button.

---

## What makes this more than a demo

1. **Real Voice Agent API integration** — single-use tokens, stored `agent_id`, PCM16 24 kHz streaming, `tool.call` → `tool.result`, interruption, `session.end` on teardown, auto-resume within the 30s grace window.
2. **Meaningful tools** — one `dispatch_tool` covers preferences, conversation history, session state, vision notes, voice interaction log, and accessibility metrics — all scoped to the signed-in user.
3. **Production-shaped security** — no API key in the browser, HttpOnly signed cookies, CSRF double-submit, per-user rate limits, bot heuristics, Zod-strict input, AES-256-GCM for spoken PII fields, audit trail.
4. **Fallback ladder** — cloud → on-device Vosk → Web Speech → typed input. The product stays useful offline and when AssemblyAI is unreachable.
5. **Accessibility as the product** — screen-reader announcements, keyboard shortcuts (Space, Alt+1–7, Ctrl+D), mute, transcript export, reduced-motion/high-contrast settings, short spoken replies.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build + standalone start |
| `npm run agent:publish` | Create/update AssemblyAI stored agent |
| `npm test` | Orchestrator unit tests |
| `npm run typecheck` / `npm run lint` | Quality gates |

---

## Environment

See `.env.example` for the full list. Fail-closed in production: missing `SESSION_SECRET` / `MASTER_KEY` refuse to boot rather than fall back to weak defaults.

---

## Demo checklist for judges

- [ ] Power button connects (engine chip shows **AssemblyAI · healthy**)
- [ ] Speak → live transcript → spoken reply
- [ ] “Open metrics” / “Go to settings” navigate the UI
- [ ] “Speak faster” changes the voice rate in Settings → Voice
- [ ] “How did I do today?” returns spoken metrics
- [ ] Fallback: kill the network → typed command still works
- [ ] Alt+1–7 switch panels; Space toggles the agent

---

## License

Hackathon submission — all rights reserved unless otherwise noted.
