import React from 'react'
import { Coffee, Leaf, Pause, Play, RotateCcw, SkipForward, Timer } from 'lucide-react'

export interface PomodoroConfig {
  enabled: boolean // Opt-in toggle
  isRunning: boolean
  phase: 'focus' | 'break'
  focusMinutes: number
  breakMinutes: number
  leavesPerCycle: number
  remainingSeconds: number
  completedCycles: number
}

interface PomodoroPanelProps {
  config: PomodoroConfig
  onUpdateConfig: (partial: Partial<PomodoroConfig>) => void
  onStartPause: () => void
  onResetCycle: () => void
  onSkipPhase: () => void
}

export const PomodoroPanel: React.FC<PomodoroPanelProps> = ({
  config,
  onUpdateConfig,
  onStartPause,
  onResetCycle,
  onSkipPhase,
}) => {
  const totalPhaseSeconds =
    (config.phase === 'focus' ? config.focusMinutes : config.breakMinutes) * 60
  const elapsedSeconds = Math.max(0, totalPhaseSeconds - config.remainingSeconds)
  const progressPct =
    totalPhaseSeconds > 0 ? Math.min(100, Math.round((elapsedSeconds / totalPhaseSeconds) * 100)) : 0

  const secondsPerLeaf = Math.max(
    15,
    Math.round((config.focusMinutes * 60) / Math.max(1, config.leavesPerCycle))
  )
  const minsPerLeaf = Math.floor(secondsPerLeaf / 60)
  const secsPerLeafRem = secondsPerLeaf % 60

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleSetFocusMinutes = (mins: number) => {
    const clamped = Math.max(1, Math.min(120, mins))
    onUpdateConfig({
      focusMinutes: clamped,
      remainingSeconds: config.phase === 'focus' ? clamped * 60 : config.remainingSeconds,
    })
  }

  const handleSetBreakMinutes = (mins: number) => {
    const clamped = Math.max(1, Math.min(60, mins))
    onUpdateConfig({
      breakMinutes: clamped,
      remainingSeconds: config.phase === 'break' ? clamped * 60 : config.remainingSeconds,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-900/95 p-3.5 text-xs">
      {/* Opt-In Toggle Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-emerald-400" />
          <span className="font-mono font-bold text-stone-100">
            Opt-In Pomodoro Vine Sync
          </span>
        </div>

        <button
          onClick={() =>
            onUpdateConfig({
              enabled: !config.enabled,
              isRunning: !config.enabled ? true : config.isRunning,
            })
          }
          className={`rounded-full px-3 py-1 font-mono text-[10.5px] font-bold transition ${
            config.enabled
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950'
              : 'border border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          {config.enabled ? 'Pomodoro Sync: ON' : 'Opt-In: OFF (Free Focus)'}
        </button>
      </div>

      <p className="font-mono text-[10.5px] text-stone-400 leading-snug">
        {config.enabled
          ? `Your plant grows in sync with your ${config.focusMinutes}m Pomodoro! 1 new leaf sprouts every ${
              minsPerLeaf > 0 ? `${minsPerLeaf}m ` : ''
            }${secsPerLeafRem > 0 ? `${secsPerLeafRem}s` : ''} of steady focus.`
          : 'Free Focus Mode active: Leaves grow calmly (1 new leaf every 3 minutes of steady focus). Opt in above to sync growth to a custom Pomodoro timer!'}
      </p>

      {/* Live Countdown Display + Controls */}
      {config.enabled && (
        <>
          <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 p-3">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {config.phase === 'focus' ? (
                  <>
                    <Leaf className="h-3 w-3" /> Focus Block · Cycle #{config.completedCycles + 1}
                  </>
                ) : (
                  <>
                    <Coffee className="h-3 w-3 text-amber-400" /> Cozy Break (Tab-Switching Free!)
                  </>
                )}
              </div>
              <div className="mt-0.5 font-mono text-2xl font-extrabold tracking-tight text-stone-100">
                {formatTime(config.remainingSeconds)}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onStartPause}
                className={`flex items-center gap-1 rounded-lg px-3 py-2 font-mono text-xs font-bold text-white transition ${
                  config.isRunning
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {config.isRunning ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Start
                  </>
                )}
              </button>
              <button
                onClick={onSkipPhase}
                className="rounded-lg border border-stone-700 bg-stone-800 p-2 text-stone-300 hover:bg-stone-700"
                title={config.phase === 'focus' ? 'Skip to Break' : 'Skip to Focus'}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onResetCycle}
                className="rounded-lg border border-stone-700 bg-stone-800 p-2 text-stone-300 hover:bg-stone-700"
                title="Reset Timer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-stone-400">
              <span>Cycle Progress ({progressPct}%)</span>
              <span>Target: {config.leavesPerCycle} Leaves / Cycle</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
              <div
                className={`h-full transition-all duration-300 ${
                  config.phase === 'focus'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Customizable Settings: Focus Mins, Break Mins, Leaves per Pomodoro */}
          <div className="grid grid-cols-3 gap-2 border-t border-stone-800 pt-2.5 font-mono">
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">
                Focus (mins)
              </label>
              <div className="flex flex-wrap gap-1 mb-1">
                {[15, 25, 45].map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSetFocusMinutes(m)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      config.focusMinutes === m
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={120}
                value={config.focusMinutes}
                onChange={(e) => handleSetFocusMinutes(Number(e.target.value) || 25)}
                className="w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-[11px] text-stone-100"
              />
            </div>

            <div>
              <label className="block text-[10px] text-stone-400 mb-1">
                Break (mins)
              </label>
              <div className="flex flex-wrap gap-1 mb-1">
                {[5, 10, 15].map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSetBreakMinutes(m)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      config.breakMinutes === m
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={60}
                value={config.breakMinutes}
                onChange={(e) => handleSetBreakMinutes(Number(e.target.value) || 5)}
                className="w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-[11px] text-stone-100"
              />
            </div>

            <div>
              <label className="block text-[10px] text-stone-400 mb-1">
                Leaves / Cycle
              </label>
              <div className="flex flex-wrap gap-1 mb-1">
                {[4, 6, 8].map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => onUpdateConfig({ leavesPerCycle: cnt })}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      config.leavesPerCycle === cnt
                        ? 'bg-teal-600 text-white'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {cnt}🌱
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={14}
                value={config.leavesPerCycle}
                onChange={(e) =>
                  onUpdateConfig({
                    leavesPerCycle: Math.max(1, Math.min(14, Number(e.target.value) || 5)),
                  })
                }
                className="w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-[11px] text-stone-100"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
