"""
VoiceBridge AI — 10-slide hackathon pitch deck.
Palette matches the product: #0A0E17 ink, #00F0FF accent, #5CE0D8 secondary.
"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

OUT = Path("download/VoiceBridge-AI-Pitch.pptx")
OUT.parent.mkdir(parents=True, exist_ok=True)

# Design tokens
BG = RGBColor(0x0A, 0x0E, 0x17)
PANEL = RGBColor(0x11, 0x18, 0x27)
INK = RGBColor(0xF5, 0xF7, 0xFA)
MUTED = RGBColor(0x9A, 0xA4, 0xB2)
ACCENT = RGBColor(0x00, 0xF0, 0xFF)
ACCENT2 = RGBColor(0x5C, 0xE0, 0xD8)
WARN = RGBColor(0xFF, 0xB6, 0x27)
GOOD = RGBColor(0x51, 0xCF, 0x66)
RED = RGBColor(0xFF, 0x6B, 0x6B)
FONT = "Calibri"
MONO = "Consolas"

W, H = Inches(13.333), Inches(7.5)


def set_run(run, size=18, bold=False, color=INK, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    # East-Asian slot (safe even for Latin-only)
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(rPr, qn("a:ea"))
    ea.set("typeface", font)


def add_bg(slide, color=BG):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    # send to back
    spTree = slide.shapes._spTree
    sp = shape._element
    spTree.remove(sp)
    spTree.insert(2, sp)
    return shape


def add_rect(slide, x, y, w, h, fill=PANEL, line=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line:
        shape.line.color.rgb = line
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    try:
        shape.adjustments[0] = 0.08
    except Exception:
        pass
    return shape


def add_text(slide, x, y, w, h, text, size=18, bold=False, color=INK,
             align=PP_ALIGN.LEFT, font=FONT, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    try:
        tf._txBody.bodyPr.set("anchor", {MSO_ANCHOR.TOP: "t", MSO_ANCHOR.MIDDLE: "ctr", MSO_ANCHOR.BOTTOM: "b"}[anchor])
    except Exception:
        pass
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color, font=font)
    return box


def add_bullets(slide, x, y, w, h, items, size=18, color=INK, bullet_color=ACCENT):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(10)
        r1 = p.add_run()
        r1.text = "▸  "
        set_run(r1, size=size, bold=True, color=bullet_color)
        r2 = p.add_run()
        r2.text = item
        set_run(r2, size=size, bold=False, color=color)
    return box


def add_notes(slide, text):
    notes = slide.notes_slide.notes_text_frame
    notes.text = text


def slide_header(slide, kicker, title):
    add_bg(slide)
    add_text(slide, Inches(0.7), Inches(0.4), Inches(12), Inches(0.35),
             kicker.upper(), size=12, bold=True, color=ACCENT)
    add_text(slide, Inches(0.7), Inches(0.75), Inches(12), Inches(0.7),
             title, size=32, bold=True, color=INK)
    # accent bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(1.45), Inches(1.2), Inches(0.05))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()


def footer(slide, n, total=10):
    add_text(slide, Inches(0.7), Inches(7.05), Inches(8), Inches(0.3),
             "VoiceBridge AI  ·  AssemblyAI Voice Agent Hackathon 2026",
             size=11, color=MUTED)
    add_text(slide, Inches(11.5), Inches(7.05), Inches(1.2), Inches(0.3),
             f"{n}/{total}", size=11, color=MUTED, align=PP_ALIGN.RIGHT)


prs = Presentation()
prs.slide_width = W
prs.slide_height = H
blank = prs.slide_layouts[6]

# ── Slide 1: Title ──────────────────────────────────────────────
s = prs.slides.add_slide(blank)
add_bg(s)
# accent glow block
glow = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.7), Inches(1.8), Inches(2.2), Inches(2.2))
glow.fill.solid()
glow.fill.fore_color.rgb = ACCENT
glow.line.fill.background()
try:
    glow.adjustments[0] = 0.15
except Exception:
    pass
add_text(s, Inches(0.85), Inches(2.45), Inches(2), Inches(1),
         "VB", size=64, bold=True, color=BG, align=PP_ALIGN.CENTER)

add_text(s, Inches(3.3), Inches(1.9), Inches(9), Inches(0.4),
         "ASSEMBLYAI VOICE AGENT HACKATHON", size=14, bold=True, color=ACCENT)
add_text(s, Inches(3.3), Inches(2.35), Inches(9), Inches(0.8),
         "VoiceBridge AI", size=48, bold=True, color=INK)
add_text(s, Inches(3.3), Inches(3.25), Inches(9), Inches(1.2),
         "Operate the web with your voice.\nA voice-first accessibility companion — not a chat wrapper.",
         size=20, color=MUTED)
add_text(s, Inches(3.3), Inches(5.5), Inches(9), Inches(0.5),
         "Built on AssemblyAI Voice Agent API  ·  Multi-engine fallback  ·  Production security",
         size=14, color=ACCENT2)
add_notes(s, "Open with the one-liner. Emphasize accessibility companion, not chatbot.")
footer(s, 1)

# ── Slide 2: Problem ────────────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "The problem", "Pixel-first UIs exclude people who need them most")
add_bullets(s, Inches(0.7), Inches(1.8), Inches(6), Inches(4), [
    "Blind, low-vision, and motor-impaired users fight mouse-first dashboards",
    "Most “voice UIs” are chat wrappers — they talk, they do not operate a product",
    "When cloud STT fails, voice apps go dark for the people who need them most",
], size=18)
# stat cards
for i, (num, label, col) in enumerate([
    ("1B+", "People with disabilities worldwide", ACCENT),
    ("2.2B", "People with vision impairment (WHO)", ACCENT2),
    ("WCAG", "Legal mandates expanding globally", WARN),
]):
    x = Inches(7.2)
    y = Inches(1.8 + i * 1.5)
    card = add_rect(s, x, y, Inches(5.3), Inches(1.25), fill=PANEL, line=col)
    add_text(s, x + Inches(0.25), y + Inches(0.2), Inches(4.8), Inches(0.5),
             num, size=28, bold=True, color=col)
    add_text(s, x + Inches(0.25), y + Inches(0.7), Inches(4.8), Inches(0.4),
             label, size=14, color=MUTED)
add_notes(s, "Frame the market as assistive tech + compliance, not a toy demo.")
footer(s, 2)

# ── Slide 3: Solution ───────────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "The solution", "A dashboard you can operate with speech")
steps = [
    ("1", "Talk", "PCM16 24 kHz mic → single-use token WSS to agents.assemblyai.com"),
    ("2", "Act", "Agent calls dispatch_tool → prefs, conversation, metrics, session"),
    ("3", "Hear", "Short spoken reply + live transcript + screen-reader announcements"),
    ("4", "Keep working", "Fallback ladder: AssemblyAI → Vosk → Web Speech → typed input"),
]
for i, (n, title, body) in enumerate(steps):
    y = Inches(1.8 + i * 1.15)
    add_rect(s, Inches(0.7), y, Inches(12), Inches(1.0), fill=PANEL)
    add_text(s, Inches(0.95), y + Inches(0.25), Inches(0.6), Inches(0.5),
             n, size=24, bold=True, color=ACCENT)
    add_text(s, Inches(1.7), y + Inches(0.18), Inches(2.2), Inches(0.5),
             title, size=20, bold=True, color=INK)
    add_text(s, Inches(4.0), y + Inches(0.28), Inches(8.4), Inches(0.5),
             body, size=15, color=MUTED)
add_notes(s, "Walk the four-step loop. Stress tool calls write real product state.")
footer(s, 3)

# ── Slide 4: Demo ───────────────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Live demo", "Golden path judges can click in under two minutes")
add_bullets(s, Inches(0.7), Inches(1.8), Inches(7.5), Inches(4.5), [
    "Sign in → tap Power (or Space) → engine chip: AssemblyAI · healthy",
    "“Open metrics” — panel navigation with spoken confirmation",
    "“Speak faster” — agent writes preferences via dispatch_tool",
    "“Describe the page” — audible DOM/visual summary",
    "“How did I do today?” — spoken session metrics from the DB",
    "Kill the network → typed commands still work (fallback ladder)",
], size=17)
box = add_rect(s, Inches(8.5), Inches(1.8), Inches(4.2), Inches(4.5), fill=PANEL, line=ACCENT)
add_text(s, Inches(8.75), Inches(2.1), Inches(3.7), Inches(0.4),
         "DEMO CHECKLIST", size=12, bold=True, color=ACCENT)
add_bullets(s, Inches(8.75), Inches(2.6), Inches(3.7), Inches(3.5), [
    "Power connects",
    "Voice intent navigates",
    "Tool writes prefs",
    "Metrics speak",
    "Offline fallback",
    "Alt+1–7 shortcuts",
], size=14, bullet_color=GOOD)
add_notes(s, "If live mic is flaky, typed commands exercise the same intent pipeline.")
footer(s, 4)

# ── Slide 5: Why AssemblyAI ─────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Technology", "Why AssemblyAI Voice Agent — not a generic STT wrapper")
rows = [
    ("Voice Agent WS", "Full-duplex listen + speak on one socket"),
    ("Stored agent_id", "Prompt, voice, keyterms, tools configured once"),
    ("Single-use tokens", "API key never leaves the server"),
    ("Function tools", "dispatch_tool → tool.call / tool.result loop"),
    ("Interruption / VAD", "Barge-in flushes local playback cleanly"),
    ("Session lifecycle", "session.end + auto-resume in the 30s window"),
]
for i, (cap, body) in enumerate(rows):
    y = Inches(1.75 + i * 0.8)
    add_rect(s, Inches(0.7), y, Inches(12), Inches(0.7), fill=PANEL)
    add_text(s, Inches(0.95), y + Inches(0.18), Inches(3.2), Inches(0.4),
             cap, size=16, bold=True, color=ACCENT)
    add_text(s, Inches(4.3), y + Inches(0.18), Inches(8), Inches(0.4),
             body, size=15, color=MUTED)
add_notes(s, "Prove we used the real Voice Agent API surface, not speech-to-text alone.")
footer(s, 5)

# ── Slide 6: Architecture ───────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Architecture", "Browser + server + AssemblyAI, fail-closed security")
# three columns
cols = [
    ("Browser", ACCENT, [
        "Next.js dashboard",
        "PCM worklet 24 kHz",
        "Local client actions",
        "Engine ladder UI",
    ]),
    ("Server", ACCENT2, [
        "/api/agent/token",
        "/api/agent/tools",
        "/api/stt/fallback",
        "Prisma + SQLite",
    ]),
    ("AssemblyAI", WARN, [
        "Stored Voice Agent",
        "Realtime WS session",
        "LLM + TTS + VAD",
        "tool.call events",
    ]),
]
for i, (title, col, items) in enumerate(cols):
    x = Inches(0.7 + i * 4.2)
    add_rect(s, x, Inches(1.8), Inches(3.9), Inches(4.4), fill=PANEL, line=col)
    add_text(s, x + Inches(0.25), Inches(2.05), Inches(3.4), Inches(0.4),
             title, size=18, bold=True, color=col)
    add_bullets(s, x + Inches(0.25), Inches(2.6), Inches(3.4), Inches(3.3),
                items, size=14, bullet_color=col)
add_text(s, Inches(0.7), Inches(6.4), Inches(12), Inches(0.4),
         "Security: signed HttpOnly sessions · CSRF double-submit · rate limits · bot/scanner block · AES-256-GCM · audit log",
         size=13, color=MUTED)
add_notes(s, "Security stack is a differentiator vs typical hackathon demos.")
footer(s, 6)

# ── Slide 7: Differentiation ────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Differentiation", "Not another chat wrapper on a form")
compare = [
    ("Chat wrapper", "No product actions", RED),
    ("Pure STT captions", "Passive — cannot act", RED),
    ("Offline-only STT", "Weak LLM & tools", WARN),
    ("Cloud-only demo", "Dies without network", WARN),
    ("VoiceBridge", "Acts + speaks + degrades gracefully", GOOD),
]
for i, (name, note, col) in enumerate(compare):
    y = Inches(1.8 + i * 0.95)
    add_rect(s, Inches(0.7), y, Inches(12), Inches(0.8), fill=PANEL, line=col)
    add_text(s, Inches(0.95), y + Inches(0.2), Inches(3.5), Inches(0.4),
             name, size=16, bold=True, color=col)
    add_text(s, Inches(4.6), y + Inches(0.2), Inches(7.8), Inches(0.4),
             note, size=15, color=MUTED)
add_notes(s, "Position against the common failure modes judges see all day.")
footer(s, 7)

# ── Slide 8: Market ─────────────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Business", "Who pays, why now, how we charge")
add_bullets(s, Inches(0.7), Inches(1.8), Inches(6.2), Inches(4), [
    "Primary: blind / low-vision / motor-impaired users",
    "Buyer: enterprise a11y & digital workplace teams",
    "Why now: WCAG + EN 301 549 enforcement expanding",
    "Why AI: only a realtime voice agent with tools can understand free speech and write product state in one turn",
], size=16)
tiers = [
    ("Personal", "$12/mo", "Browser agent, fallback, export"),
    ("Team", "$49/seat", "Shared prefs, history, audit"),
    ("Enterprise", "Custom", "SSO, private deploy, Twilio phone"),
]
for i, (name, price, body) in enumerate(tiers):
    y = Inches(1.8 + i * 1.4)
    add_rect(s, Inches(7.3), y, Inches(5.3), Inches(1.25), fill=PANEL, line=ACCENT)
    add_text(s, Inches(7.55), y + Inches(0.15), Inches(2.5), Inches(0.4),
             name, size=16, bold=True, color=INK)
    add_text(s, Inches(10.3), y + Inches(0.15), Inches(2), Inches(0.4),
             price, size=16, bold=True, color=ACCENT, align=PP_ALIGN.RIGHT)
    add_text(s, Inches(7.55), y + Inches(0.65), Inches(4.8), Inches(0.4),
             body, size=13, color=MUTED)
add_notes(s, "Keep pricing simple. Mention metered AssemblyAI minutes; fallback cuts cost.")
footer(s, 8)

# ── Slide 9: Traction / build status ────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Build status", "Production-shaped, not a weekend spike")
stats = [
    ("16", "API routes, auth-wrapped", ACCENT),
    ("8/8", "Orchestrator unit tests pass", GOOD),
    ("E2E", "Playwright golden-path flyover", GOOD),
    ("14", "Security controls verified live", ACCENT2),
]
for i, (num, label, col) in enumerate(stats):
    x = Inches(0.7 + (i % 2) * 6.3)
    y = Inches(1.8 + (i // 2) * 1.8)
    add_rect(s, x, y, Inches(6), Inches(1.55), fill=PANEL, line=col)
    add_text(s, x + Inches(0.3), y + Inches(0.25), Inches(5.4), Inches(0.6),
             num, size=36, bold=True, color=col)
    add_text(s, x + Inches(0.3), y + Inches(0.95), Inches(5.4), Inches(0.4),
             label, size=14, color=MUTED)
add_bullets(s, Inches(0.7), Inches(5.5), Inches(12), Inches(1.2), [
    "Stored AssemblyAI agent published (agent_id connect path)",
    "Judge demo video + README + submission kit in repo",
], size=14, bullet_color=GOOD)
add_notes(s, "Judges score application of technology — show tests, E2E, security.")
footer(s, 9)

# ── Slide 10: Roadmap / ask ─────────────────────────────────────
s = prs.slides.add_slide(blank)
slide_header(s, "Next", "Roadmap and what we need")
add_bullets(s, Inches(0.7), Inches(1.8), Inches(6.2), Inches(4), [
    "Phone channel via Twilio SIP (AssemblyAI telephony path)",
    "Multi-user auth + enterprise SSO",
    "Richer vision tools (element targeting, form fill)",
    "Bluejay simulation scoring for agent quality",
], size=17)
add_rect(s, Inches(7.3), Inches(1.8), Inches(5.3), Inches(4.2), fill=PANEL, line=ACCENT)
add_text(s, Inches(7.55), Inches(2.1), Inches(4.8), Inches(0.4),
         "THE ASK", size=14, bold=True, color=ACCENT)
add_text(s, Inches(7.55), Inches(2.65), Inches(4.8), Inches(2.8),
         "Ship VoiceBridge to users who\ncannot afford to wait for a\nmouse-first web to catch up.\n\nPrize credits → production\nAssemblyAI minutes + phone\npilot with accessibility testers.",
         size=16, color=INK)
add_text(s, Inches(0.7), Inches(6.3), Inches(12), Inches(0.4),
         "github.com/BROCKUGANDA/voicebridge-ai  ·  AssemblyAI Voice Agent API",
         size=13, color=MUTED)
add_notes(s, "Close with purpose. Ask for the win and the credits to go to production.")
footer(s, 10)

prs.save(str(OUT))
print(f"Wrote {OUT.resolve()}  slides={len(prs.slides)}")
