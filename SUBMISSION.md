# VoiceBridge AI — Hackathon Submission Kit

**Event:** [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon)  
**Window:** Sep 1–30, 2026 · $10,000 pool ($5k cash + $5k AAI credits)  
**Stack:** Next.js 16 · AssemblyAI Voice Agent API · Prisma/SQLite · Tailwind · Zustand

---

## One-liner (use this everywhere)

> **VoiceBridge AI is a voice-first accessibility companion** that lets blind, low-vision, and motor-impaired users navigate a live web dashboard, change settings, and track session metrics using only speech — powered by AssemblyAI’s Voice Agent API with a multi-engine offline fallback.

---

## Problem

- Pixel-first dashboards exclude people who cannot see or use a mouse/keyboard.
- Existing “voice UI” demos are chat wrappers: they talk, but they do not **operate** a real product surface.
- When the cloud STT goes down, most voice apps become unusable — the people who need them most are left with nothing.

## Solution

A full dashboard that is **operable by voice**, backed by a real AssemblyAI Voice Agent session:

1. **Talk** — PCM16 24 kHz mic stream over a single-use-token WebSocket to `agents.assemblyai.com`.
2. **Act** — the agent calls `dispatch_tool` against our secured API (preferences, conversation, metrics, session, vision, voice log).
3. **Hear back** — short spoken confirmation + live transcript + screen-reader announcements.
4. **Keep working** — if AssemblyAI is down: on-device Vosk → browser Web Speech → typed commands.

## Why AssemblyAI (not a generic STT wrapper)

| Capability | How we use it |
|---|---|
| Voice Agent API (WS) | Full-duplex listen/speak in one socket |
| Stored agent (`agent_id`) | Prompt, voice, keyterms, tools configured once via `POST /v1/agents` |
| Single-use tokens | `/api/agent/token` mints short-lived tokens; API key never leaves the server |
| Function tools | `dispatch_tool` → tool.call / tool.result loop |
| Interruption / VAD | `interrupt_response`, barge-in flushes local playback |
| Session lifecycle | `session.end` on power-off + pagehide; auto-resume in the 30s window |

Publish the agent:

```bash
npm run agent:publish
```

---

## Demo script (3–4 minutes video)

### 0:00–0:30 — Problem
“Millions of users cannot operate a mouse-first dashboard. VoiceBridge is a hands-free accessibility companion — not a chatbot bolted onto a page.”

### 0:30–2:30 — Live demo (golden path)
1. Sign in → tap **power** (or Space). Engine chip: **AssemblyAI · healthy**.
2. Say **“Open metrics.”** → Metrics panel opens, spoken confirmation.
3. Say **“Speak a little faster.”** → agent tool writes preferences; Settings → Voice shows the new rate.
4. Say **“Describe the page.”** → audible page summary.
5. Say **“How did I do today?”** → spoken session metrics from the DB.
6. Point at the **engine ladder** chip → show fallback to on-device / text input.
7. Type a command with no mic — product still works.

### 2:30–4:00 — Business + tech
- **Who:** accessibility users, enterprise a11y teams, voice-first productivity.
- **Market:** assistive tech + voice UX (multi-billion, growing with WCAG/EN 301 549 mandates).
- **Why AI:** only a realtime voice agent with tools can both **understand free speech** and **write product state** (prefs, history, metrics) in one turn.
- **Moat-ish:** multi-engine fallback + production security stack + tool-scoped API — not a prompt toy.

### 4:00–5:00 — Roadmap
Phone (Twilio SIP), multi-user auth, richer vision tools, enterprise SSO.

---

## Judging rubric mapping

| Dimension | Evidence |
|---|---|
| **Presentation** | README, this kit, 3–4 min demo video, clickable UI |
| **Business value** | Clear persona, a11y compliance angle, SaaS/API pricing story |
| **Application of technology** | Real Voice Agent WS + stored agent + tools; deployed URL; real repo |
| **Originality** | Accessibility companion that **operates the product by voice**, with offline ladder |

---

## Submission checklist (lablab)

- [ ] Enrolled / team created on lablab.ai
- [ ] Working prototype **online** (deployed URL judges can open)
- [ ] GitHub repo with commit history across the event window
- [ ] Demo video (3–5 min) uploaded
- [ ] Pitch deck (8–10 slides: problem, solution, demo, market, revenue, team, next)
- [ ] Written description using the one-liner + problem/solution
- [ ] Mention AssemblyAI Voice Agent API explicitly (sponsor requirement)
- [ ] Demo passphrase documented for judges **or** public demo mode enabled

### Demo access note for judges

Production uses a passphrase gate (fail-closed). For judging, either:

1. Deploy with a **documented demo passphrase** in the submission description, or  
2. Run locally following `README.md` (5 minutes).

Never commit real API keys.

---

## Pricing sketch (for the deck)

| Tier | Price | Includes |
|---|---|---|
| Personal | $12/mo | Browser agent, fallback engines, transcript export |
| Team | $49/seat | Shared prefs, session history, admin audit |
| Enterprise | Custom | SSO, private deploy, Twilio phone, SLA |

Cost note: AssemblyAI Voice Agent usage is metered per session minute — fallback engines reduce billable cloud minutes when offline.

---

## Pitch deck outline (10 slides)

1. Title + one-liner  
2. Problem (who hurts, why now)  
3. Solution (30-second architecture diagram)  
4. Live demo screenshot  
5. Why AssemblyAI (table above)  
6. Differentiation (fallback ladder + security)  
7. Market + persona  
8. Business model  
9. Traction / build status (tests, E2E, security audit)  
10. Roadmap + ask  

---

## Competitive frame

| Project type | Weakness | VoiceBridge |
|---|---|---|
| Chat wrapper on a form | No product actions | Tools write real prefs/metrics |
| Pure STT captioning | Passive | Full-duplex agent + interruption |
| Offline-only STT | Weak LLM/tools | Cloud primary + offline ladder |
| Cloud-only demo | Dies without network | Vosk / Web Speech / typed fallback |

---

## Links to include in the submission

- Repo: *(your GitHub URL)*  
- Live demo: *(your deploy URL)*  
- Video: *(YouTube / lablab upload)*  
- AssemblyAI Voice Agent docs: https://www.assemblyai.com/docs/voice-agents/overview  
- Hackathon: https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon  
