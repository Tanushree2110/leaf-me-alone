import React from 'react'
import { Lock } from 'lucide-react'

export interface PomodoroConfig {
  isRunning: boolean
  phase: 'focus' | 'break' | 'awaiting_next_session'
  focusMinutes: number
  breakMinutes: number
  leavesPerCycle: number
  remainingSeconds: number
  completedCycles: number
}

interface PomodoroPanelProps {
  config: PomodoroConfig
  onUpdateConfig: (partial: Partial<PomodoroConfig>) => void
}

const PRESETS: Array<{
  label: string
  key: 'focusMinutes' | 'breakMinutes' | 'leavesPerCycle'
  values: number[]
  suffix: string
  activeClass: string
}> = [
  { label: 'Focus', key: 'focusMinutes', values: [15, 25, 45], suffix: 'm', activeClass: 'bg-emerald-600 text-white' },
  { label: 'Break', key: 'breakMinutes', values: [5, 10, 15], suffix: 'm', activeClass: 'bg-amber-600 text-white' },
  { label: 'Leaves', key: 'leavesPerCycle', values: [4, 5, 8], suffix: '', activeClass: 'bg-teal-600 text-white' },
]

export const PomodoroPanel: React.FC<PomodoroPanelProps> = ({ config, onUpdateConfig }) => {
  const isLocked = config.isRunning

  const handlePick = (key: (typeof PRESETS)[number]['key'], value: number) => {
    if (isLocked) return
    if (key === 'focusMinutes') {
      onUpdateConfig({ focusMinutes: value, remainingSeconds: value * 60 })
    } else {
      onUpdateConfig({ [key]: value } as Partial<PomodoroConfig>)
    }
  }

  return (
    <div className="flex flex-col gap-2 font-mono text-xs">
      {isLocked && (
        <div className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/30 py-1 text-[10px] font-semibold text-amber-300">
          <Lock className="h-3 w-3" />
          Locked while running
        </div>
      )}

      <div
        className={`grid grid-cols-3 gap-1.5 text-[10px] ${
          isLocked ? 'pointer-events-none select-none opacity-45' : ''
        }`}
      >
        {PRESETS.map((preset) => (
          <div key={preset.key} className="rounded-lg border border-stone-800 bg-stone-950 p-2">
            <div className="mb-1 text-stone-400">{preset.label}</div>
            <div className="flex gap-1">
              {preset.values.map((v) => (
                <button
                  key={v}
                  disabled={isLocked}
                  onClick={() => handlePick(preset.key, v)}
                  className={`flex-1 rounded py-0.5 font-bold ${
                    config[preset.key] === v ? preset.activeClass : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {v}
                  {preset.suffix}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-stone-950/70 px-2 py-1.5 text-[9.5px] leading-snug text-stone-400">
        No pausing. Stopping early drops a leaf, counts as a stopped session, and the timer restarts
        from full.
      </div>
    </div>
  )
}
