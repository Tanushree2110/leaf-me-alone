import React, { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CircleStop, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import {
  DaySummary,
  PomodoroSessionRecord,
  VIOLATION_LABELS,
  penaltyCount,
  summarizeDays,
  toDateKey,
} from '../utils/sessions'

interface StatsPanelProps {
  sessions: PomodoroSessionRecord[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const CHART_W = 300
const CHART_H = 112
const PLOT_TOP = 14
const PLOT_BOTTOM = 92
const BAR_W = 26

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatMinutes(min: number) {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function trendLine(days: DaySummary[]): { start: number; end: number } | null {
  const n = days.length
  if (days.filter((d) => d.focusMinutes > 0).length < 2) return null
  const xs = days.map((_, i) => i)
  const ys = days.map((d) => d.focusMinutes)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den ? num / den : 0
  const intercept = my - slope * mx
  return { start: intercept, end: intercept + slope * (n - 1) }
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ sessions }) => {
  const todayKey = toDateKey(Date.now())
  const [selectedDay, setSelectedDay] = useState<string>(todayKey)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const week = useMemo(() => summarizeDays(sessions, 7), [sessions])
  const previousWeek = useMemo(
    () => summarizeDays(sessions, 7, Date.now() - 7 * DAY_MS),
    [sessions]
  )

  const totals = useMemo(
    () =>
      week.reduce(
        (acc, d) => ({
          minutes: acc.minutes + d.focusMinutes,
          completed: acc.completed + d.completed,
          clean: acc.clean + d.completedClean,
          withPenalties: acc.withPenalties + d.completedWithPenalties,
          stopped: acc.stopped + d.stopped,
          penalties: acc.penalties + d.penalties,
        }),
        { minutes: 0, completed: 0, clean: 0, withPenalties: 0, stopped: 0, penalties: 0 }
      ),
    [week]
  )
  const previousMinutes = previousWeek.reduce((sum, d) => sum + d.focusMinutes, 0)
  const trendPct =
    previousMinutes > 0 ? Math.round(((totals.minutes - previousMinutes) / previousMinutes) * 100) : null

  const maxMinutes = Math.max(25, ...week.map((d) => d.focusMinutes))
  const plotH = PLOT_BOTTOM - PLOT_TOP
  const slot = CHART_W / week.length
  const yFor = (minutes: number) => PLOT_BOTTOM - (Math.max(0, minutes) / maxMinutes) * plotH
  const trend = trendLine(week)

  const daySessions = useMemo(() => {
    const list = sessions
      .filter((s) => s.dateKey === selectedDay)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((s, i) => ({ session: s, number: i + 1 }))
    return list.reverse()
  }, [sessions, selectedDay])

  const selectedSummary = week.find((d) => d.dateKey === selectedDay)

  return (
    <div className="flex flex-col gap-2.5 font-mono text-xs">
      {/* Week summary */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-stone-800 bg-stone-950 p-1.5">
          <div className="text-base font-extrabold text-emerald-400">{totals.completed}</div>
          <div className="text-[9px] text-stone-400">Completed</div>
          <div className="text-[8.5px] text-stone-500">
            {totals.clean} clean · {totals.withPenalties} w/ penalty
          </div>
        </div>
        <div className="rounded-lg border border-stone-800 bg-stone-950 p-1.5">
          <div className="text-base font-extrabold text-amber-400">{totals.stopped}</div>
          <div className="text-[9px] text-stone-400">Stopped</div>
          <div className="text-[8.5px] text-stone-500">ended early</div>
        </div>
        <div className="rounded-lg border border-stone-800 bg-stone-950 p-1.5">
          <div className="text-base font-extrabold text-rose-400">{totals.penalties}</div>
          <div className="text-[9px] text-stone-400">Penalties</div>
          <div className="text-[8.5px] text-stone-500">last 7 days</div>
        </div>
      </div>

      {/* Weekly graph */}
      <div className="rounded-xl border border-stone-800 bg-stone-950 p-2">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="font-bold text-stone-200">
            Focus · {formatMinutes(totals.minutes)} this week
          </span>
          {trendPct === null ? (
            <span className="text-stone-500">{totals.minutes > 0 ? 'First week' : 'No data yet'}</span>
          ) : (
            <span
              className={`flex items-center gap-0.5 font-bold ${
                trendPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trendPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trendPct >= 0 ? '+' : ''}
              {trendPct}% vs last week
            </span>
          )}
        </div>

        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block h-auto w-full">
          <line x1={0} x2={CHART_W} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="#292524" strokeWidth={1} />
          {week.map((d, i) => {
            const cx = slot * i + slot / 2
            const x = cx - BAR_W / 2
            const completedTop = yFor(d.completedMinutes)
            const totalTop = yFor(d.completedMinutes + d.stoppedMinutes)
            const isSelected = d.dateKey === selectedDay
            return (
              <g
                key={d.dateKey}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedDay(d.dateKey)
                  setExpandedId(null)
                }}
              >
                <rect x={slot * i} y={0} width={slot} height={CHART_H} fill="transparent" />
                {isSelected && (
                  <rect
                    x={x - 3}
                    y={PLOT_TOP - 4}
                    width={BAR_W + 6}
                    height={PLOT_BOTTOM - PLOT_TOP + 6}
                    rx={5}
                    fill="#10b98114"
                    stroke="#10b98166"
                  />
                )}
                {d.stoppedMinutes > 0 && (
                  <rect
                    x={x}
                    y={totalTop}
                    width={BAR_W}
                    height={Math.max(0, completedTop - totalTop)}
                    rx={3}
                    fill="#f59e0b"
                    opacity={0.85}
                  />
                )}
                {d.completedMinutes > 0 && (
                  <rect
                    x={x}
                    y={completedTop}
                    width={BAR_W}
                    height={Math.max(0, PLOT_BOTTOM - completedTop)}
                    rx={3}
                    fill="#10b981"
                  />
                )}
                {d.focusMinutes === 0 && (
                  <rect x={x} y={PLOT_BOTTOM - 2} width={BAR_W} height={2} rx={1} fill="#44403c" />
                )}
                {d.focusMinutes > 0 && (
                  <text
                    x={cx}
                    y={totalTop - 3}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill="#d6d3d1"
                    fontFamily="ui-monospace, monospace"
                  >
                    {d.focusMinutes}
                  </text>
                )}
                <text
                  x={cx}
                  y={CHART_H - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={d.isToday ? 700 : 400}
                  fill={d.isToday ? '#34d399' : '#a8a29e'}
                  fontFamily="ui-monospace, monospace"
                >
                  {d.isToday ? 'Today' : d.label}
                </text>
              </g>
            )
          })}
          {trend && (
            <line
              x1={slot / 2}
              x2={slot * (week.length - 0.5)}
              y1={yFor(trend.start)}
              y2={yFor(trend.end)}
              stroke="#e7e5e4"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              opacity={0.6}
              pointerEvents="none"
            />
          )}
        </svg>

        <div className="mt-0.5 flex items-center justify-center gap-3 text-[9px] text-stone-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> completed min
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-500" /> stopped min
          </span>
          {trend && <span>- - trend</span>}
        </div>
      </div>

      {/* Sessions of the selected day */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold text-stone-200">
          {selectedDay === todayKey ? 'Today' : selectedSummary?.label ?? selectedDay} ·{' '}
          {daySessions.length} session{daySessions.length === 1 ? '' : 's'}
        </span>
        {selectedSummary && (
          <span className="text-stone-500">
            {selectedSummary.completed} done · {selectedSummary.stopped} stopped ·{' '}
            {selectedSummary.penalties} penalties
          </span>
        )}
      </div>

      <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-0.5">
        {daySessions.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-800 py-3 text-center text-[10px] text-stone-500">
            No sessions on this day
          </div>
        )}
        {daySessions.map(({ session, number }) => {
          const penalties = penaltyCount(session)
          const isOpen = expandedId === session.id
          return (
            <div key={session.id} className="rounded-lg border border-stone-800 bg-stone-950">
              <button
                onClick={() => setExpandedId(isOpen ? null : session.id)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px]"
              >
                <span className="flex items-center gap-1.5 text-stone-300">
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="font-bold text-stone-100">#{number}</span>
                  <span>{formatClock(session.startedAt)}</span>
                  <span className="text-stone-500">
                    {Math.round(session.focusSeconds / 60)}/{session.plannedMinutes}m
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {penalties > 0 && <span className="font-bold text-rose-400">{penalties} penalty</span>}
                  {session.status === 'completed' && (
                    <span className="flex items-center gap-0.5 font-bold text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </span>
                  )}
                  {session.status === 'stopped' && (
                    <span className="flex items-center gap-0.5 font-bold text-amber-400">
                      <CircleStop className="h-3 w-3" /> Stopped
                    </span>
                  )}
                  {session.status === 'running' && (
                    <span className="flex items-center gap-0.5 font-bold text-sky-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Live
                    </span>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-0.5 border-t border-stone-800 px-2 py-1.5">
                  {session.violations.length === 0 ? (
                    <div className="text-center text-[10px] text-emerald-400">Clean session · no penalties</div>
                  ) : (
                    [...session.violations]
                      .sort((a, b) => a.at - b.at)
                      .map((v) => (
                        <div key={v.id} className="flex items-start justify-between gap-2 text-[10px]">
                          <span className="font-bold text-rose-200">{v.message || VIOLATION_LABELS[v.kind]}</span>
                          <span className="shrink-0 text-[9px] text-stone-500">{formatClock(v.at)}</span>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
