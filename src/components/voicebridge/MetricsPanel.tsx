'client'

import { useConversationStore } from '@/stores/conversation-store'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, Clock, Zap, Target, Brain } from 'lucide-react'

export function MetricsPanel() {
  const metrics = useConversationStore((s) => s.metrics)

  const metricCards = [
    {
      label: 'Task Completion',
      value: `${metrics.taskCompletionRate.toFixed(1)}%`,
      icon: Target,
      color: metrics.taskCompletionRate >= 80 ? 'text-[#51CF66]' : metrics.taskCompletionRate >= 50 ? 'text-[#FFB627]' : 'text-[#FF6B6B]',
      trend: metrics.taskCompletionRate >= 70 ? 'up' as const : 'down' as const,
    },
    {
      label: 'Avg Commands/Task',
      value: metrics.avgCommandsPerTask.toFixed(1),
      icon: Zap,
      color: metrics.avgCommandsPerTask <= 3 ? 'text-[#51CF66]' : metrics.avgCommandsPerTask <= 5 ? 'text-[#FFB627]' : 'text-[#FF6B6B]',
      trend: metrics.avgCommandsPerTask <= 3 ? 'up' as const : 'down' as const,
    },
    {
      label: 'Error Rate',
      value: `${metrics.errorRate.toFixed(1)}%`,
      icon: XCircle,
      color: metrics.errorRate <= 10 ? 'text-[#51CF66]' : metrics.errorRate <= 25 ? 'text-[#FFB627]' : 'text-[#FF6B6B]',
      trend: metrics.errorRate <= 15 ? 'up' as const : 'down' as const,
    },
    {
      label: 'Total Commands',
      value: metrics.totalCommands.toString(),
      icon: CheckCircle2,
      color: 'text-[#00F0FF]',
      trend: null,
    },
    {
      label: 'Successes',
      value: metrics.totalSuccesses.toString(),
      icon: CheckCircle2,
      color: 'text-[#51CF66]',
      trend: null,
    },
    {
      label: 'Session Duration',
      value: formatDuration(metrics.sessionDuration),
      icon: Clock,
      color: 'text-[#5CE0D8]',
      trend: null,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-white/80">Accessibility Metrics</h2>
        <p className="text-[10px] text-[#6C757D] mt-0.5">Real-time session performance</p>
      </div>

      <div className="flex-1 overflow-y-auto vb-scrollbar p-4">
        <div className="grid grid-cols-2 gap-3">
          {metricCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="rounded-xl bg-white/3 border border-white/5 p-3 flex flex-col gap-2"
                role="status"
                aria-label={`${card.label}: ${card.value}`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={cn('w-4 h-4', card.color)} />
                  {card.trend && (
                    card.trend === 'up' ? (
                      <TrendingUp className="w-3 h-3 text-[#51CF66]" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-[#FF6B6B]" />
                    )
                  )}
                </div>
                <p className={cn('text-lg font-semibold', card.color)}>{card.value}</p>
                <p className="text-[10px] text-[#6C757D]">{card.label}</p>
              </div>
            )
          })}
        </div>

        {/* Cognitive Load Indicator */}
        <div className="mt-4 rounded-xl bg-white/3 border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-[#FFB627]" />
            <span className="text-xs text-white/70 font-medium">Cognitive Load</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                metrics.errorRate <= 15 ? 'bg-[#51CF66]' : metrics.errorRate <= 30 ? 'bg-[#FFB627]' : 'bg-[#FF6B6B]'
              )}
              style={{ width: `${Math.min(100, metrics.errorRate * 2.5)}%` }}
              role="progressbar"
              aria-valuenow={metrics.errorRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Cognitive load indicator at ${metrics.errorRate}%`}
            />
          </div>
          <p className="text-[10px] text-[#6C757D] mt-2">
            {metrics.errorRate <= 15
              ? 'Low cognitive load. Interactions are smooth and efficient.'
              : metrics.errorRate <= 30
                ? 'Moderate cognitive load. Some commands may need rephrasing.'
                : 'High cognitive load. Consider adjusting verbosity or using simpler commands.'}
          </p>
        </div>

        {/* Independence Score */}
        <div className="mt-3 rounded-xl bg-white/3 border border-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/70 font-medium">Independence Index</span>
            <span className={cn(
              'text-lg font-bold',
              metrics.taskCompletionRate >= 80 ? 'text-[#51CF66]' : metrics.taskCompletionRate >= 50 ? 'text-[#FFB627]' : 'text-[#FF6B6B]'
            )}>
              {metrics.taskCompletionRate >= 80 ? 'High' : metrics.taskCompletionRate >= 50 ? 'Medium' : 'Developing'}
            </span>
          </div>
          <p className="text-[10px] text-[#6C757D]">
            {metrics.taskCompletionRate >= 80
              ? 'You are navigating independently with high success. Minimal assistance needed.'
              : metrics.taskCompletionRate >= 50
                ? 'Good progress! Some tasks may still need occasional guidance.'
                : 'Building skills. VoiceBridge is learning your patterns to improve.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}