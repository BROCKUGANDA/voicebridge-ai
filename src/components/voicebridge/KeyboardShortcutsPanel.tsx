'client'

import { getKeyboardShortcuts } from '@/lib/accessibility-utils'

const SHORTCUTS = getKeyboardShortcuts()

export function KeyboardShortcutsPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-white/80">Keyboard Shortcuts</h2>
        <p className="text-[10px] text-[#6C757D] mt-0.5">
          Navigate VoiceBridge without a mouse
        </p>
      </div>

      <div className="flex-1 overflow-y-auto vb-scrollbar p-4">
        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, description }) => (
            <div
              key={keys}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/3 transition-colors"
            >
              <span className="text-xs text-white/70">{description}</span>
              <kbd className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-[#6C757D] font-mono whitespace-nowrap">
                {keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-[#FFB627]/5 border border-[#FFB627]/10 p-4">
          <h3 className="text-xs text-[#FFB627] font-medium mb-2">Voice Commands</h3>
          <ul className="space-y-1.5">
            {[
              '"Describe the page" - Hear what is on screen',
              '"Read content" - Have page text read aloud',
              '"Click [element]" - Interact with elements',
              '"Search for [term]" - Find content',
              '"Fill [field] with [value]" - Complete forms',
              '"Help" - List available commands',
              '"Stop" or "Cancel" - Cancel current action',
              '"Speak faster/slower" - Adjust speech rate',
            ].map((cmd) => (
              <li key={cmd} className="text-[11px] text-white/60 leading-relaxed">
                {cmd}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
