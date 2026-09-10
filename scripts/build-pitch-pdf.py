from pathlib import Path
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

out = Path(__file__).resolve().parents[1] / "download" / "VoiceBridge-AI-Pitch.pdf"
W, H = landscape(A4)
BG = HexColor("#0A0E17")
PANEL = HexColor("#111827")
INK = HexColor("#F5F7FA")
MUTED = HexColor("#9AA4B2")
ACCENT = HexColor("#00F0FF")
ACCENT2 = HexColor("#5CE0D8")
WARN = HexColor("#FFB627")
GOOD = HexColor("#51CF66")
RED = HexColor("#FF6B6B")

try:
    pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
    F, FB = "Arial", "Arial-Bold"
except Exception:
    F = FB = "Helvetica"


def bg(c):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def footer(c, n, total=10):
    c.setFillColor(MUTED)
    c.setFont(F, 8)
    c.drawString(40, 24, "VoiceBridge AI  ·  AssemblyAI Voice Agent Hackathon 2026")
    c.drawRightString(W - 40, 24, f"{n}/{total}")


def header(c, kicker, title, n, total=10):
    bg(c)
    c.setFillColor(ACCENT)
    c.setFont(FB, 9)
    c.drawString(40, H - 40, kicker.upper())
    c.setFillColor(INK)
    c.setFont(FB, 24)
    c.drawString(40, H - 78, title)
    c.setFillColor(ACCENT)
    c.rect(40, H - 90, 70, 3, fill=1, stroke=0)
    footer(c, n, total)


def bullets(c, x, y, items, size=12, gap=22):
    c.setFont(F, size)
    for item in items:
        c.setFillColor(ACCENT)
        c.drawString(x, y, "▸")
        c.setFillColor(INK)
        c.drawString(x + 14, y, item[:100])
        y -= gap
    return y


def card(c, x, y, w, h, title, body, accent=ACCENT):
    c.setFillColor(PANEL)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=0)
    c.setStrokeColor(accent)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 8, fill=0, stroke=1)
    c.setFillColor(accent)
    c.setFont(FB, 12)
    c.drawString(x + 12, y + h - 22, title)
    c.setFillColor(MUTED)
    c.setFont(F, 10)
    for i, line in enumerate(body.split("\n")):
        c.drawString(x + 12, y + h - 40 - i * 14, line[:48])


def main():
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=landscape(A4))
    c.setTitle("VoiceBridge AI — Pitch")
    c.setAuthor("VoiceBridge AI")

    # 1 Title
    bg(c)
    c.setFillColor(ACCENT)
    c.roundRect(40, 280, 120, 120, 16, fill=1, stroke=0)
    c.setFillColor(BG)
    c.setFont(FB, 42)
    c.drawCentredString(100, 320, "VB")
    c.setFillColor(ACCENT)
    c.setFont(FB, 10)
    c.drawString(180, 380, "ASSEMBLYAI VOICE AGENT HACKATHON")
    c.setFillColor(INK)
    c.setFont(FB, 36)
    c.drawString(180, 330, "VoiceBridge AI")
    c.setFillColor(MUTED)
    c.setFont(F, 14)
    c.drawString(180, 290, "Operate the web with your voice.")
    c.drawString(180, 270, "A voice-first accessibility companion — not a chat wrapper.")
    c.setFillColor(ACCENT2)
    c.setFont(F, 10)
    c.drawString(40, 80, "Built on AssemblyAI Voice Agent API  ·  Multi-engine fallback  ·  Production security")
    footer(c, 1)
    c.showPage()

    # 2 Problem
    header(c, "The problem", "Pixel-first UIs exclude people who need them most", 2)
    bullets(c, 40, H - 140, [
        "Blind, low-vision, and motor-impaired users fight mouse-first dashboards",
        "Most voice UIs are chat wrappers — they talk, they do not operate a product",
        "When cloud STT fails, voice apps go dark for the people who need them most",
    ])
    card(c, W - 280, 380, 240, 70, "1B+", "People with disabilities worldwide", ACCENT)
    card(c, W - 280, 290, 240, 70, "2.2B", "Vision impairment (WHO)", ACCENT2)
    card(c, W - 280, 200, 240, 70, "WCAG", "Legal mandates expanding", WARN)
    c.showPage()

    # 3 Solution
    header(c, "The solution", "A dashboard you can operate with speech", 3)
    steps = [
        ("1  Talk", "PCM16 24 kHz mic → single-use token WSS to agents.assemblyai.com"),
        ("2  Act", "Agent calls dispatch_tool → prefs, conversation, metrics, session"),
        ("3  Hear", "Short spoken reply + live transcript + screen-reader announcements"),
        ("4  Keep working", "Fallback ladder: AssemblyAI → Vosk → Web Speech → typed input"),
    ]
    y = H - 140
    for t, b in steps:
        c.setFillColor(PANEL)
        c.roundRect(40, y - 40, W - 80, 48, 6, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.setFont(FB, 14)
        c.drawString(55, y - 18, t)
        c.setFillColor(MUTED)
        c.setFont(F, 11)
        c.drawString(180, y - 18, b[:95])
        y -= 60
    c.showPage()

    # 4 Demo
    header(c, "Live demo", "Golden path judges can click in under two minutes", 4)
    bullets(c, 40, H - 140, [
        "Sign in → tap Power (or Space) → engine chip: AssemblyAI · healthy",
        "Open metrics — panel navigation with spoken confirmation",
        "Speak faster — agent writes preferences via dispatch_tool",
        "Describe the page — audible DOM/visual summary",
        "How did I do today? — spoken session metrics from the DB",
        "Kill the network → typed commands still work (fallback ladder)",
    ], gap=24)
    card(c, W - 300, 160, 260, 260, "DEMO CHECKLIST", "Power connects\nVoice intent navigates\nTool writes prefs\nMetrics speak\nOffline fallback\nAlt+1-7 shortcuts", GOOD)
    c.showPage()

    # 5 Technology
    header(c, "Technology", "Why AssemblyAI Voice Agent — not generic STT", 5)
    rows = [
        ("Voice Agent WS", "Full-duplex listen + speak on one socket"),
        ("Stored agent_id", "Prompt, voice, keyterms, tools configured once"),
        ("Single-use tokens", "API key never leaves the server"),
        ("Function tools", "dispatch_tool → tool.call / tool.result loop"),
        ("Interruption / VAD", "Barge-in flushes local playback cleanly"),
        ("Session lifecycle", "session.end + auto-resume in the 30s window"),
    ]
    y = H - 130
    for cap, body in rows:
        c.setFillColor(PANEL)
        c.roundRect(40, y - 34, W - 80, 36, 4, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.setFont(FB, 11)
        c.drawString(55, y - 22, cap)
        c.setFillColor(MUTED)
        c.setFont(F, 10)
        c.drawString(200, y - 22, body[:90])
        y -= 42
    c.showPage()

    # 6 Architecture
    header(c, "Architecture", "Browser + server + AssemblyAI, fail-closed security", 6)
    cols = [
        (40, "Browser", ACCENT, ["Next.js dashboard", "PCM worklet 24 kHz", "Local client actions", "Engine ladder UI"]),
        (220, "Server", ACCENT2, ["/api/agent/token", "/api/agent/tools", "/api/stt/fallback", "Prisma + SQLite"]),
        (400, "AssemblyAI", WARN, ["Stored Voice Agent", "Realtime WS session", "LLM + TTS + VAD", "tool.call events"]),
    ]
    for x, title, col, items in cols:
        c.setFillColor(PANEL)
        c.roundRect(x, 160, 160, 240, 8, fill=1, stroke=0)
        c.setStrokeColor(col)
        c.roundRect(x, 160, 160, 240, 8, fill=0, stroke=1)
        c.setFillColor(col)
        c.setFont(FB, 13)
        c.drawString(x + 12, 370, title)
        c.setFillColor(MUTED)
        c.setFont(F, 9)
        for i, item in enumerate(items):
            c.drawString(x + 12, 340 - i * 18, "▸ " + item)
    c.setFillColor(MUTED)
    c.setFont(F, 8)
    c.drawString(40, 100, "Security: signed HttpOnly sessions · CSRF · rate limits · bot/scanner block · AES-256-GCM · audit log")
    c.showPage()

    # 7 Differentiation
    header(c, "Differentiation", "Not another chat wrapper on a form", 7)
    compare = [
        ("Chat wrapper", "No product actions", RED),
        ("Pure STT captions", "Passive — cannot act", RED),
        ("Offline-only STT", "Weak LLM & tools", WARN),
        ("Cloud-only demo", "Dies without network", WARN),
        ("VoiceBridge", "Acts + speaks + degrades gracefully", GOOD),
    ]
    y = H - 130
    for name, note, col in compare:
        c.setFillColor(PANEL)
        c.roundRect(40, y - 36, W - 80, 40, 6, fill=1, stroke=0)
        c.setStrokeColor(col)
        c.roundRect(40, y - 36, W - 80, 40, 6, fill=0, stroke=1)
        c.setFillColor(col)
        c.setFont(FB, 12)
        c.drawString(55, y - 22, name)
        c.setFillColor(MUTED)
        c.setFont(F, 11)
        c.drawString(200, y - 22, note)
        y -= 50
    c.showPage()

    # 8 Business
    header(c, "Business", "Who pays, why now, how we charge", 8)
    bullets(c, 40, H - 140, [
        "Primary: blind / low-vision / motor-impaired users",
        "Buyer: enterprise a11y & digital workplace teams",
        "Why now: WCAG + EN 301 549 enforcement expanding",
        "Why AI: realtime voice agent with tools that write product state",
    ], gap=24)
    tiers = [
        ("Personal", "$12/mo", "Browser agent, fallback, export"),
        ("Team", "$49/seat", "Shared prefs, history, audit"),
        ("Enterprise", "Custom", "SSO, private deploy, Twilio phone"),
    ]
    y = 380
    for name, price, body in tiers:
        card(c, W - 300, y, 260, 70, f"{name}   {price}", body, ACCENT)
        y -= 85
    c.showPage()

    # 9 Status
    header(c, "Build status", "Production-shaped, not a weekend spike", 9)
    stats = [
        ("16", "API routes, auth-wrapped"),
        ("8/8", "Orchestrator unit tests"),
        ("E2E", "Playwright golden path"),
        ("14", "Security controls verified"),
    ]
    positions = [(40, 320), (280, 320), (40, 200), (280, 200)]
    for (num, label), (x, y) in zip(stats, positions):
        c.setFillColor(PANEL)
        c.roundRect(x, y, 220, 90, 8, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.setFont(FB, 28)
        c.drawString(x + 16, y + 48, num)
        c.setFillColor(MUTED)
        c.setFont(F, 10)
        c.drawString(x + 16, y + 22, label)
    c.setFillColor(MUTED)
    c.setFont(F, 10)
    c.drawString(40, 140, "Stored AssemblyAI agent published  ·  Judge demo video + README + submission kit in repo")
    c.showPage()

    # 10 Ask
    header(c, "Next", "Roadmap and what we need", 10)
    bullets(c, 40, H - 140, [
        "Phone channel via Twilio SIP (AssemblyAI telephony path)",
        "Multi-user auth + enterprise SSO",
        "Richer vision tools (element targeting, form fill)",
        "Bluejay simulation scoring for agent quality",
    ], gap=24)
    card(c, W - 300, 160, 260, 220, "THE ASK", "Ship VoiceBridge to users who\ncannot afford to wait for a\nmouse-first web to catch up.\n\nPrize credits → production\nAssemblyAI minutes + phone\npilot with accessibility testers.", ACCENT)
    c.setFillColor(MUTED)
    c.setFont(F, 10)
    c.drawString(40, 80, "github.com/BROCKUGANDA/voicebridge-ai  ·  AssemblyAI Voice Agent API")
    c.showPage()

    c.save()
    print(f"Wrote {out} size={out.stat().st_size}")


if __name__ == "__main__":
    main()
