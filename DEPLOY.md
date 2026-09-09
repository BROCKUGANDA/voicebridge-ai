# Deploying VoiceBridge AI (public demo) — key protection guide

This app is an **authenticated** voice dashboard. The AssemblyAI API key must
**never** ship to the browser or into the public GitHub repo.

---

## 1. What stays secret

| Secret | Where it lives | Never |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | Host env only | `.env` in git, client JS, logs |
| `ASSEMBLYAI_AGENT_ID` | Host env (ok to commit? prefer env) | Not a secret but keep out of client bundles |
| `SESSION_SECRET` | Host env | git |
| `MASTER_KEY` | Host env | git |
| `VOICEBRIDGE_AUTH_PASSPHRASE` | Host env · **use a strong demo passphrase for judges** | git, video, screenshots |

`.gitignore` already ignores `.env*`. Double-check with:

```bash
git check-ignore -v .env .env.local
```

---

## 2. Platform setup (pick one)

### Vercel (fastest for Next.js)

1. Import the public GitHub repo.
2. **Project → Settings → Environment Variables** — add every required var.
3. Set `TRUST_PROXY_HEADERS=1` (Vercel overwrites `X-Forwarded-For`).
4. Enable **Deployment Protection** or a simple **Passphrase** if you want an extra gate (optional — app already has login).
5. Deploy. Use the `*.vercel.app` URL or a custom domain with HTTPS.

### Railway / Render

1. Connect the repo.
2. Add the same env vars on the service.
3. Mount a **persistent volume** for `DATABASE_URL` (SQLite file) — otherwise data resets every deploy.
4. Set `TRUST_PROXY_HEADERS=1` behind their proxy.
5. Bind the standalone server: `npm run build:standalone && npm start`.

### Bare metal / VPS behind Caddy

```caddyfile
demo.example.com {
    reverse_proxy 127.0.0.1:3000
    header {
        # Defense in depth on top of app headers
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Set `TRUST_PROXY_HEADERS=1` only when Caddy **overwrites** `X-Forwarded-For`.

---

## 3. How the browser never sees the API key

```
Browser ── GET /api/agent/token ──► Next.js server
                                      │ Authorization: Bearer $ASSEMBLYAI_API_KEY
                                      ▼
                               AssemblyAI /v1/token
                                      │ single-use JWT
Browser ◄── { token, agentId } ───────┘
Browser ── WSS agents.assemblyai.com?token=… ──► Voice Agent session
```

- Key lives only in server memory / platform secret store.
- Tokens are single-use, 300s redemption window, rate-limited 3/min.
- Sessions are cookie-auth + CSRF; tools never accept a client-supplied `userId`.

---

## 4. Demo passphrase for judges

In the lablab submission description, publish something like:

> Demo URL: https://your-app.example.com  
> Passphrase: `VoiceBridge-Demo-2026`  
> Try: “Open metrics”, “Speak faster”, “How did I do today?”

Use a **dedicated demo key** on AssemblyAI with a spending cap, not your personal key.

Optional hardening for the public demo:

```bash
# Tighter token mint (already default ~3/min)
# Rotate the demo passphrase after the hackathon
# Cap AssemblyAI spend in the dashboard
```

---

## 5. Already built-in protections

| Layer | Control |
|---|---|
| robots.txt | Disallow `/` + named AI scrapers |
| X-Robots-Tag | `noindex, nofollow` on every response |
| Middleware | Bot UA block (prod = all paths), scanner-path 404s |
| Auth | Passphrase → HMAC-signed HttpOnly cookie, 8h TTL |
| CSRF | Double-submit cookie + header |
| Rate limit | Per-IP + per-user token buckets |
| Input | Zod strict schemas, field-tamper rejection |
| Secrets at rest | AES-256-GCM for spoken PII fields |
| CSP | nonce + wasm-unsafe-eval only; frame-ancestors none |
| HSTS | preload, includeSubDomains |

---

## 6. Post-deploy smoke (run once)

```bash
BASE=https://your-app.example.com
curl -sI "$BASE/" | grep -iE 'x-robots|content-security|strict-transport'
curl -sI "$BASE/.env" -o /dev/null -w '%{http_code}\n'   # expect 404
curl -sI "$BASE/robots.txt" | head -1
curl -s -A curl/8.0 "$BASE/api/voice" -o /dev/null -w '%{http_code}\n'  # expect 403
```

---

## 7. After the hackathon

1. Rotate `ASSEMBLYAI_API_KEY` and `VOICEBRIDGE_AUTH_PASSPHRASE`.
2. Delete or pause the stored agent if unused.
3. Take the demo URL offline or keep it behind the login gate.
