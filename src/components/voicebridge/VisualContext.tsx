'use client'

import { useState } from 'react'
import { useVoiceStore } from '@/stores/voice-store'
import { useScreenCapture } from '@/hooks/use-screen-capture'
import { cn } from '@/lib/utils'
import { Eye, Scan, ChevronDown, ChevronUp, LayoutGrid, Type, Image, MousePointerClick } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'

export function VisualContext() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const visualData = useVoiceStore((s) => s.visualData)
  const { captureAndAnalyze, captureState } = useScreenCapture()
  const { playCompletion, playError } = useSoundFeedback()

  const handleAnalyze = () => {
    try {
      const result = captureAndAnalyze()
      playCompletion()
    } catch {
      playError()
    }
  }

  const filteredElements = visualData?.elements.filter(
    (el) => filterType === 'all' || el.type === filterType
  ) || []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#5CE0D8]" />
          <h2 className="text-sm font-medium text-white/80">Visual Context</h2>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded hover:bg-white/5 transition-colors"
          aria-label={isExpanded ? 'Collapse visual context' : 'Expand visual context'}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#8B98A8]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#8B98A8]" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Analyze Button */}
          <div className="p-3">
            <Button
              onClick={handleAnalyze}
              disabled={captureState === 'analyzing'}
              className="w-full bg-[#5CE0D8]/20 text-[#5CE0D8] hover:bg-[#5CE0D8]/30 border border-[#5CE0D8]/20"
              aria-label="Analyze current page for visual context"
            >
              <Scan className="w-4 h-4 mr-2" />
              {captureState === 'analyzing' ? 'Analyzing...' : 'Analyze Current Page'}
            </Button>
          </div>

          {/* Page Description */}
          {visualData && (
            <div className="px-3 pb-3 animate-vb-fade-in">
              <div className="rounded-lg bg-white/3 p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#8B98A8]">Page Summary</span>
                  <Badge variant="outline" className="text-[10px] border-[#5CE0D8]/30 text-[#5CE0D8]">
                    {Math.round(visualData.confidence * 100)}% confident
                  </Badge>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  {visualData.description}
                </p>
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          {visualData && visualData.elements.length > 0 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {[
                { type: 'all', icon: LayoutGrid, label: 'All' },
                { type: 'a', icon: MousePointerClick, label: 'Links' },
                { type: 'button', icon: MousePointerClick, label: 'Buttons' },
                { type: 'img', icon: Image, label: 'Images' },
                { type: 'h1', icon: Type, label: 'Headings' },
              ].map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                    filterType === type
                      ? 'bg-[#00F0FF]/20 text-[#00F0FF]'
                      : 'text-[#8B98A8] hover:text-white/70 hover:bg-white/5'
                  )}
                  aria-pressed={filterType === type}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Elements List */}
          <div className="flex-1 overflow-y-auto vb-scrollbar px-3 pb-3">
            {visualData && filteredElements.length > 0 ? (
              <div className="space-y-1.5">
                {filteredElements.map((el, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg bg-white/3 hover:bg-white/5 transition-colors"
                    role="listitem"
                    aria-label={`${el.type}: ${el.label}`}
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] border-white/10 text-[#8B98A8] shrink-0 mt-0.5"
                    >
                      {el.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 truncate">{el.label}</p>
                      {el.description !== el.label && (
                        <p className="text-[10px] text-[#8B98A8] truncate mt-0.5">
                          {el.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : visualData ? (
              <p className="text-xs text-[#8B98A8] text-center py-4">
                No elements match the current filter.
              </p>
            ) : (
              <div className="text-center py-8">
                <Eye className="w-8 h-8 text-[#8B98A8]/30 mx-auto mb-2" />
                <p className="text-xs text-[#8B98A8]">
                  Click &quot;Analyze Current Page&quot; to see visual context.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}