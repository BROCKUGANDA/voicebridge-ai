/**
 * Assemble narrated demo video from frames + TTS audio via ffmpeg.
 * Usage: node scripts/assemble-demo-video.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const framesDir = join(root, 'download', 'demo-frames')
const audioDir = join(root, 'download', 'demo-audio')
const outDir = join(root, 'download')
const workDir = join(outDir, 'demo-work')
mkdirSync(workDir, { recursive: true })

const timeline = JSON.parse(readFileSync(join(framesDir, 'timeline.json'), 'utf8'))

// Map frame name → narration file stem
const NARRATION_MAP = {
  login: 'n01-login',
  home: 'n02-home',
  'engine-live': 'n03-engine',
  metrics: 'n04-metrics',
  describe: 'n05-describe',
  'settings-engine': 'n06-engine',
  'settings-voice': 'n07-voice',
  help: 'n08-help',
  transcript: 'n09-transcript',
  'metrics-panel': 'n10-metrics',
  outro: 'n11-outro',
}

function ffmpeg(args, opts = {}) {
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
}

// Copy a system font next to the workdir so drawtext can use a relative path
// (Windows path escaping + missing fontconfig is fragile).
import { copyFileSync } from 'node:fs'
const fontSrc = 'C:\\Windows\\Fonts\\arial.ttf'
const fontLocal = join(workDir, 'arial.ttf')
if (existsSync(fontSrc)) {
  try {
    copyFileSync(fontSrc, fontLocal)
  } catch {
    /* already there */
  }
}

function audioDurationSec(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
      { encoding: 'utf8' },
    )
    return parseFloat(out.trim())
  } catch {
    return 0
  }
}

function findAudio(stem) {
  for (const ext of ['.mp3', '.wav', '.m4a']) {
    const p = join(audioDir, stem + ext)
    if (existsSync(p)) return p
  }
  return null
}

const segments = []
for (const frame of timeline.frames) {
  const stem = NARRATION_MAP[frame.name]
  const audio = stem ? findAudio(stem) : null
  let duration = (frame.holdMs || 2500) / 1000
  if (audio) {
    const d = audioDurationSec(audio)
    if (d > 0.4) duration = Math.max(d + 0.45, 1.8) // pad slightly
  }
  segments.push({ frame, audio, duration })
}

console.log(`Segments: ${segments.length}`)
segments.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.frame.name}  ${s.duration.toFixed(2)}s  audio=${s.audio ? 'yes' : 'NO (silence)'}`
  )
})

// Build per-segment clips: image + optional audio → video, with burned captions
const clipPaths = []
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i]
  const clip = join(workDir, `clip-${String(i + 1).padStart(2, '0')}.mp4`)
  const dur = seg.duration.toFixed(3)
  // Caption strip at the bottom. Use a local relative fontfile (no drive colon).
  const cap = (seg.frame.caption || '')
    .replace(/[\\':,]/g, ' ')
    .replace(/—/g, '-')
  const vf = `scale=1440:900,fps=30,drawtext=fontfile=arial.ttf:text='${cap}':fontcolor=white:fontsize=26:x=48:y=820:box=1:boxcolor=0x0A0E17@0.75:boxborderw=16`
  if (seg.audio) {
    ffmpeg([
      '-y',
      '-loop', '1',
      '-i', seg.frame.file,
      '-i', seg.audio,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-vf', vf,
      '-t', dur,
      '-shortest',
      clip,
    ], { cwd: workDir })
  } else {
    ffmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-loop', '1',
      '-i', seg.frame.file,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-vf', vf,
      '-t', dur,
      '-shortest',
      clip,
    ], { cwd: workDir })
  }
  clipPaths.push(clip)
  console.log(`clip ${i + 1}/${segments.length}`)
}

// Concat
const listFile = join(workDir, 'concat.txt')
writeFileSync(
  listFile,
  clipPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n',
)

const outVideo = join(outDir, 'VoiceBridge-AI-Demo.mp4')
ffmpeg([
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', listFile,
  '-c:v', 'libx264',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-movflags', '+faststart',
  '-pix_fmt', 'yuv420p',
  outVideo,
])

const total = segments.reduce((a, s) => a + s.duration, 0)
console.log(`\nWrote ${outVideo}`)
console.log(`Duration ≈ ${total.toFixed(1)}s`)
