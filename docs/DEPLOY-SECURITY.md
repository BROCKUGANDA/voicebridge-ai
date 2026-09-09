# Public demo deploy — protect keys, tokens, and the product

This file is the **operator checklist** for putting VoiceBridge on a public URL
for hackathon judges without leaking secrets or inviting scanners.

## Never commit

| Item | Where it lives | Rule |
|------|----------------|------|
| `ASSEMBLYAI_API_KEY` | Platform env only | Never in git, never in client bundle |
| `SESSION_SECRET` | Platform env | 32+ random bytes |
| `MASTER_KEY` | Platform env | 64 hex chars (32 bytes) |
| `VOICEBRIDGE_AUTH_PASSPHRASE` | Platform env | Document a **demo** passphrase in the submission text only |
| `.env` / `.env.local` | gitignored (`.env*`) | Confirm with `git check-ignore .env` before first push |
| SQLite `db/*.db` | Volume / gitignored | Ephemeral on many hosts — use a persistent disk |

`scripts/publish-agent.mjs` writes `ASSEMBLYAI_AGENT_ID` to `.env.local`.
That id is **not** a secret (it is a public resource id), but keep the file
ignored anyway.

## Platform env vars (Vercel / Railway / Render / Fly)

```bash
ASSEMBLYAI_API_KEY=...
ASSEMBLYAI_AGENT_ID=...          # from npm run agent:publish
VOICEBRIDGE_AUTH_PASSPHRASE=...  # demo passphrase for judges
VOICEBRIDGE_AUTH_USER=default-user
SESSION_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)
DATABASE_URL=file:/data/voicebridge.db   # persistent volume path
NODE_ENV=production
TRUST_PROXY_HEADERS=1            # ONLY behind the platform's reverse proxy
```

## What already protects you in this codebase

1. **API key never reaches the browser** — `/api/agent/token` mints short-lived
   single-use WS tokens server-side.
2. **Fail-closed secrets** — production boot throws if `SESSION_SECRET` /
   `MASTER_KEY` are missing or weak.
3. **Auth gate** — every data route requires a signed HttpOnly session.
4. **CSRF double-submit** — `vb_csrf` cookie + `X-Vb-Csrf` header on writes.
5. **Rate limits** — middleware IP buckets + per-user `withApi` buckets.
6. **Bot / scanner block** — expanded UA heuristics + scan-path denylist
   (`.env`, `.git`, `wp-admin`, `phpmyadmin`, …) return 404.
7. **CSP + HSTS + frame deny + nosniff** on every response.
8. **robots.txt** — `Disallow: /` for all agents + AI scrapers.
9. **`X-Robots-Tag: noindex, nofollow`** on HTML and API responses.
10. **AES-256-GCM** for spoken PII fields (pronunciation / custom commands).

## Platform checklist before you share the URL

- [ ] HTTPS only (platform default) — app also 308-redirects in prod
- [ ] Env vars set in the **host dashboard**, not in a committed file
- [ ] Persistent disk attached for `DATABASE_URL`
- [ ] `TRUST_PROXY_HEADERS=1` only when the platform overwrites `X-Forwarded-For`
- [ ] Demo passphrase is **different** from your personal one
- [ ] After deploy: `curl -I https://your.app/.env` → must be 404
- [ ] `curl -A curl/8 https://your.app/api/voice` → must be 403
- [ ] `curl https://your.app/robots.txt` → Disallow: /
- [ ] Login works in a private window; power button mints a token (200)

## Cost / abuse controls

- Token route rate-limited to 10/min per user.
- Session max duration capped at 3h; client sends `session.end` on power-off
  and `pagehide`.
- Consider lowering `max_session_duration_seconds` in
  `src/app/api/agent/token/route.ts` (e.g. 1800) for the public demo.

## Recommended public demo posture

| Setting | Value |
|---------|-------|
| Auth | Keep the passphrase gate (judges get the passphrase in the submission) |
| Indexing | robots.txt Disallow + X-Robots-Tag noindex |
| Bots | Block on all routes in production (already on) |
| Key | Platform secret store only |
| Rate limit | Leave defaults; raise only if judges report 429 |

## If you must open the demo without a passphrase

Do **not** disable auth. Instead:
1. Set a short, unique `VOICEBRIDGE_AUTH_PASSPHRASE` and print it on the login
   copy / submission description, or
2. Add a time-boxed invite cookie later — out of scope for this hackathon.

Never ship an unauthenticated public endpoint that mints AssemblyAI tokens.
