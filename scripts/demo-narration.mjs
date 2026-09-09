/**
 * Narration script for the judge demo video.
 * Each segment maps 1:1 to a captured frame (see download/demo-frames/timeline.json).
 */
export const NARRATION = [
  {
    frame: 'login',
    text: 'Millions of people cannot operate a mouse-first dashboard. VoiceBridge AI is a voice-first accessibility companion — not a chatbot bolted onto a page.',
  },
  {
    frame: 'home',
    text: 'This is the live product. Tap the power button, or press Space, and speak. Every panel is reachable by voice, keyboard, or type.',
  },
  {
    frame: 'engine-live',
    text: 'We connect to AssemblyAI\'s Voice Agent API over a single-use token WebSocket. The API key never leaves the server. The chip shows a healthy cloud session.',
  },
  {
    frame: 'metrics',
    text: 'Say open metrics — or type it — and the dashboard navigates. Same intent pipeline, same spoken confirmation.',
  },
  {
    frame: 'describe',
    text: 'Say describe the page for an audible summary of what is on screen. Built for blind and low-vision users who need context fast.',
  },
  {
    frame: 'settings-engine',
    text: 'The engine ladder keeps working when the cloud does not. AssemblyAI first, then on-device Vosk, browser speech, and always-available typed input.',
  },
  {
    frame: 'settings-voice',
    text: 'Say speak faster, and the agent writes preferences through our dispatch tool. Real product state — not a demo script.',
  },
  {
    frame: 'help',
    text: 'Help is spoken, short, and practical. Repeat, export transcript, mute, and navigation recovery are first-class commands.',
  },
  {
    frame: 'transcript',
    text: 'Every turn is logged and exportable. Screen readers get live announcements. Accessibility is the product, not a checkbox.',
  },
  {
    frame: 'metrics-panel',
    text: 'Session metrics track task completion and error rate — useful for users, caregivers, and enterprise accessibility teams.',
  },
  {
    frame: 'outro',
    text: 'VoiceBridge AI. Operate the web with your voice. Powered by AssemblyAI. Built for people the interface forgot.',
  },
]
