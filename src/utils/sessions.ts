export type ViolationKind = 'face_away' | 'off_screen' | 'new_tab' | 'stopped_early'

export interface ViolationEvent {
  id: string
  at: number
  kind: ViolationKind
  message: string
}

export interface PomodoroSessionRecord {
  id: string
  dateKey: string
  startedAt: number
  endedAt: number | null
  plannedMinutes: number
  focusSeconds: number
  status: 'running' | 'completed' | 'stopped'
  violations: ViolationEvent[]
}

export interface DaySummary {
  dateKey: string
  label: string
  isToday: boolean
  focusMinutes: number
  completedMinutes: number
  stoppedMinutes: number
  completed: number
  completedClean: number
  completedWithPenalties: number
  stopped: number
  penalties: number
}

const STORAGE_KEY = 'leaf_me_alone_sessions_v1'
const MAX_STORED_SESSIONS = 500

export const VIOLATION_LABELS: Record<ViolationKind, string> = {
  face_away: 'Left the camera',
  off_screen: 'Left the Chrome window',
  new_tab: 'Opened a new tab/window',
  stopped_early: 'Stopped early',
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function toDateKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function penaltyCount(session: PomodoroSessionRecord): number {
  return session.violations.length
}

export function loadSessions(): PomodoroSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // A session still marked "running" means the page was closed or refreshed mid-focus.
    return parsed.map((s: PomodoroSessionRecord) =>
      s.status === 'running'
        ? {
            ...s,
            status: 'stopped' as const,
            endedAt: s.startedAt + s.focusSeconds * 1000,
            violations: [
              ...s.violations,
              {
                id: makeId(),
                at: s.startedAt + s.focusSeconds * 1000,
                kind: 'stopped_early' as const,
                message: 'Game closed mid-session',
              },
            ],
          }
        : s
    )
  } catch {
    return []
  }
}

export function saveSessions(sessions: PomodoroSessionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_STORED_SESSIONS)))
  } catch {}
}

export function summarizeDays(
  sessions: PomodoroSessionRecord[],
  days: number,
  endMs: number = Date.now()
): DaySummary[] {
  const todayKey = toDateKey(endMs)
  const result: DaySummary[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endMs)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const dateKey = toDateKey(d.getTime())
    const daySessions = sessions.filter((s) => s.dateKey === dateKey)
    const completed = daySessions.filter((s) => s.status === 'completed')
    const stopped = daySessions.filter((s) => s.status === 'stopped')
    const completedSeconds = completed.reduce((sum, s) => sum + s.focusSeconds, 0)
    const stoppedSeconds = daySessions
      .filter((s) => s.status !== 'completed')
      .reduce((sum, s) => sum + s.focusSeconds, 0)
    result.push({
      dateKey,
      label: d.toLocaleDateString([], { weekday: 'short' }),
      isToday: dateKey === todayKey,
      focusMinutes: Math.round((completedSeconds + stoppedSeconds) / 60),
      completedMinutes: Math.round(completedSeconds / 60),
      stoppedMinutes: Math.round(stoppedSeconds / 60),
      completed: completed.length,
      completedClean: completed.filter((s) => penaltyCount(s) === 0).length,
      completedWithPenalties: completed.filter((s) => penaltyCount(s) > 0).length,
      stopped: stopped.length,
      penalties: daySessions.reduce((sum, s) => sum + penaltyCount(s), 0),
    })
  }
  return result
}
