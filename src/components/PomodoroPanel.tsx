import React from 'react'
import { Coffee, Leaf, Lock, Play, Sparkles, Square, Timer } from 'lucide-react'

export interface PomodoroConfig {
  enabled: boolean
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
  onStartSession: () => void
  onStopSession: () => void
  onStartNextSession: () => void
}

export const PomodoroPanel: React.FC<PomodoroPanelProps> = ({
  config,
  onUpdateConfig,
  onStartSession,
  onStopSession,
  onStartNextSession,
}) => {
  const isLockedBecauseRunning =
    config.enabled && config.isRunning && config.phase !== 'awaiting_next_session'

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleSetFocusMinutes = (mins: number) => {
    if (isLockedBecauseRunning) return
    const clamped = Math.max(1, Math.min(120, mins))
    onUpdateConfig({
      focusMinutes: clamped,
      remainingSeconds: clamped * 60,
    })
  }

  const handleSetBreakMinutes = (mins: number) => {
    if (isLockedBecauseRunning) return
    const clamped = Math.max(1, Math.min(60, mins))
    onUpdateConfig({
      breakMinutes: clamped,
    })
  }

  const handleSetLeaves = (cnt: number) => {
    if (isLockedBecauseRunning) return
    onUpdateConfig({ leavesPerCycle: cnt })
  }

  return (
    <div className="flex flex-col gap-2.5 text-xs font-mono">
      {/* Header Toggle (Disabled while running!) */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold text-stone-200">
          <Timer className="h-3.5 w-3.5 text-emerald-400" />
          Pomodoro Timer
        </span>
        <button
          disabled={isLockedBecauseRunning}
          onClick={() => {
            if (isLockedBecauseRunning) return
            onUpdateConfig({
              enabled: !config.enabled,
              isRunning: false,
            })
          }}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
            isLockedBecauseRunning ? 'opacity-50 cursor-not-allowed ' : ''
          }${
            config.enabled
              ? 'bg-emerald-600 text-white'
              : 'bg-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          {config.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {config.enabled && (
        <>
          {config.phase === 'awaiting_next_session' ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-center">
              <span className="text-[11px] font-bold text-emerald-300">
                Break Over · Stopped (You can change timers below)
              </span>
              <button
                onClick={onStartNextSession}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Start Session #{config.completedCycles + 1} ({config.focusMinutes}m)
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-3 py-2">
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400">
                  {config.phase === 'focus' ? (
                    <>
                      <Leaf className="h-3 w-3" /> Focus #{config.completedCycles + 1}
                    </>
                  ) : (
                    <>
                      <Coffee className="h-3 w-3 text-amber-400" /> Break
                    </>
                  )}
                </div>
                <div className="text-xl font-extrabold text-stone-100">
                  {formatTime(config.remainingSeconds)}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!config.isRunning ? (
                  <button
                    onClick={onStartSession}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500"
                  >
                    <Play className="h-3 w-3" />
                    Start
                  </button>
                ) : (
                  <button
                    onClick={onStopSession}
                    className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500"
                    title="Stop session to unlock timer settings"
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Lock Notice when running */}
          {isLockedBecauseRunning && (
            <div className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/30 py-1 text-[10px] font-semibold text-amber-300">
              <Lock className="h-3 w-3" />
              Locked while running · Stop session to change timers
            </div>
          )}

          {/* 3-Column Presets (Disabled while running, editable initially or when stopped) */}
          <div
            className={`grid grid-cols-3 gap-1.5 pt-1 text-[10px] ${
              isLockedBecauseRunning ? 'opacity-45 pointer-events-none select-none' : ''
            }`}
          >
            <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
              <div className="text-stone-400 mb-1">Focus</div>
              <div className="flex gap-1">
                {[15, 25, 45].map((m) => (
                  <button
                    key={m}
                    disabled={isLockedBecauseRunning}
                    onClick={() => handleSetFocusMinutes(m)}
                    className={`flex-1 rounded py-0.5 font-bold ${
                      config.focusMinutes === m
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
              <div className="text-stone-400 mb-1">Break</div>
              <div className="flex gap-1">
                {[5, 10, 15].map((m) => (
                  <button
                    key={m}
                    disabled={isLockedBecauseRunning}
                    onClick={() => handleSetBreakMinutes(m)}
                    className={`flex-1 rounded py-0.5 font-bold ${
                      config.breakMinutes === m
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
              <div className="text-stone-400 mb-1">Leaves</div>
              <div className="flex gap-1">
                {[4, 5, 8].map((cnt) => (
                  <button
                    key={cnt}
                    disabled={isLockedBecauseRunning}
                    onClick={() => handleSetLeaves(cnt)}
                    className={`flex-1 rounded py-0.5 font-bold ${
                      config.leavesPerCycle === cnt
                        ? 'bg-teal-600 text-white'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
