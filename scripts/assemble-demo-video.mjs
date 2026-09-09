/**
 * Assemble narrated demo video from frame PNGs + TTS mp3s.
 *
 * Beat map (seconds of hold after audio ends, minimum total frame time):
 *   01 login          2s
 *   02 login-filled   1.5s
 *   03 home-ready     2s
 *   04 power-on       2s
 *   05 metrics        2.5s
 *   06 settings       2s
 *   07 engine-tab     2s
 *   08 conversation   2s
 *   09 a11y           1.5s
 *   10 home-final     3s
 *
 * Audio overlays (may span multiple frames):
 *   01-hook        → frames 01-03
 *   02-problem     → frames 01-03 (continued) / 03
 *   03-solution    → frame 03-04
 *   04-demo-power  → frame 04
 *   05-demo-navigate→ frames 05-07
 *   06-demo-prefs  → frames 06-08
 *   07-demo-fallback→ frames 07-09
 *   08-business    → frames 08-10
 *   09-close       → frame 10
 *
 * Strategy: build a silent video from stills, then mux a single concatenated
 * narration track. Simple, reliable, judge-friendly.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const FRAMES = join(ROOT, 'download', 'demo-frames')
const AUDIO = join(ROOT, 'download', 'demo-audio')
const OUTDIR = join(ROOT, 'download', 'demo-video')
mkdirSync(OUTDIR, { recursive: true })

const frameFiles = readdirSync(FRAMES)
  .filter((f) => f.endsWith('.png'))
  .sort()
if (frameFiles.length === 0) {
  console.error('No frames in', FRAMES)
  process.exit(1)
}

// Hold times per frame (seconds) — tuned to ~match narration pacing.
const holds = [2.5, 1.5, 2.5, 2.5, 3.0, 2.5, 2.5, 2.5, 2.0, 3.5]

function ff(args, label) {
  console.log('ffmpeg', label)
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

// 1. Normalize each still to 1280x720 mp4 clip
const clips = []
frameFiles.forEach((file, i) => {
  const src = join(FRAMES, file)
  const dest = join(OUTDIR, `clip-${String(i + 1).padStart(2, '0')}.mp4`)
  const t = holds[i] ?? 2.5
  ff(
    [
      '-y',
      '-loop', '1',
      '-i', src,
      '-t', String(t),
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      dest,
    ],
    `clip ${i + 1}`,
  )
  clips.push(dest)
})

// 2. Concat clips
const listFile = join(OUTDIR, 'clips.txt')
writeFileSync(listFile, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'))
const silent = join(OUTDIR, 'silent.mp4')
ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent], 'concat')

// 3. Concat narration audio if present
const audioOrder = [
  '01-hook.mp3',
  '02-problem.mp3',
  '03-solution.mp3',
  '04-demo-power.mp3',
  '05-demo-navigate.mp3',
  '06-demo-prefs.mp3',
  '07-demo-fallback.mp3',
  '08-business.mp3',
  '09-close.mp3',
]
const present = audioOrder
  .map((n) => join(AUDIO, n))
  .filter((p) => existsSync(p) && statSync(p).size > 1000)

let narration = null
if (present.length > 0) {
  const aList = join(OUTDIR, 'audio.txt')
  writeFileSync(aList, present.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'))
  narration = join(OUTDIR, 'narration.mp3')
  // Re-encode to consistent format then concat
  const norm = []
  present.forEach((p, i) => {
    const o = join(OUTDIR, `a-${i}.wav`)
    ff(['-y', '-i', p, '-ar', '44100', '-ac', '2', o], `norm audio ${i}`)
    norm.push(o)
  })
  writeFileSync(
    join(OUTDIR, 'audio-norm.txt'),
    norm.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
  )
  ff(
    [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', join(OUTDIR, 'audio-norm.txt'),
      '-c:a', 'libmp3lame',
      '-b:a', '160k',
      narration,
    ],
    'concat audio',
  )
} else {
  console.warn('No narration audio found — silent video only')
}

// 4. Mux
const final = join(ROOT, 'download', 'VoiceBridge-AI-Demo.mp4')
if (narration) {
  ff(
    [
      '-y',
      '-i', silent,
      '-i', narration,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      '-movflags', '+faststart',
      final,
    ],
    'mux',
  )
} else {
  ff(['-y', '-i', silent, '-c:v', 'copy', '-movflags', '+faststart', final], 'copy silent')
}

console.log('WROTE', final)
console.log('FRAMES', frameFiles.length, 'AUDIO_CLIPS', present.length)
