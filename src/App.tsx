import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Coffee,
  Layers,
  Leaf,
  Palette,
  Play,
  Square,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import {
  FocusMode,
  LeafNode,
  RoommateState,
  RoomSkinId,
  RoomUpgrade,
  SessionStats,
  VineSegment,
} from './types'
import { AWAY_DETECTED_QUOTES, INITIAL_UPGRADES, pickRandomDialogue } from './utils/dialogue'
import { ROOM_SKINS } from './utils/skins'
import { nukeAllActiveAudio, soundFX } from './utils/sound'
import {
  PomodoroSessionRecord,
  ViolationKind,
  loadSessions,
  makeId,
  penaltyCount,
  saveSessions,
  toDateKey,
} from './utils/sessions'
import { StudioCanvas } from './components/StudioCanvas'
import { PolaroidModal } from './components/PolaroidModal'
import { WebcamGuard } from './components/WebcamGuard'
import { PomodoroConfig, PomodoroPanel } from './components/PomodoroPanel'
import { StatsPanel } from './components/StatsPanel'

type ExpandablePanel = 'pomodoro' | 'stats' | 'upgrades' | null

declare global {
  interface Window {
    __leafClientId?: string
    __leafGuardSeq?: number
  }
}

// Cursor's built-in browser also loads localhost:5173; only a real browser tab may drive the guard.
const IS_GUARD_HOST = typeof navigator !== 'undefined' && !/Electron|Cursor/i.test(navigator.userAgent)
const CALM_DOWN_MS = 5000
const HEARTBEAT_MS = 2000
const DRIFT_GRACE_MS = 2500
const PAGE_DRIFT_DEBOUNCE_MS = 1200
const SESSION_SAVE_EVERY_MS = 5000
const STOP_CONFIRM_MS = 4000

// Stable across hot reloads so the server never sees a stale "active" client.
const CLIENT_ID = (() => {
  if (typeof window === 'undefined') return 'no-window'
  if (!window.__leafClientId) window.__leafClientId = makeId()
  return window.__leafClientId
})()

function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {})
}

// The sequence number lets the server drop a heartbeat that arrives after a newer "stop".
function guardStateBody(active: boolean) {
  window.__leafGuardSeq = (window.__leafGuardSeq ?? 0) + 1
  return { active, clientId: CLIENT_ID, seq: window.__leafGuardSeq }
}

function postGuardState(active: boolean) {
  return postJson('/api/focus-guard-state', guardStateBody(active))
}

function generateProceduralVineSegments(): VineSegment[] {
  const points = [
    { x: 106, y: 342 },
    { x: 94, y: 312 },
    { x: 122, y: 284 },
    { x: 98, y: 254 },
    { x: 134, y: 226 },
    { x: 112, y: 196 },
    { x: 148, y: 168 },
    { x: 126, y: 138 },
    { x: 164, y: 112 },
    { x: 148, y: 86 },
    { x: 188, y: 72 },
    { x: 224, y: 84 },
    { x: 258, y: 68 },
    { x: 292, y: 82 },
    { x: 318, y: 64 },
  ]
  const segments: VineSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const midY = (p0.y + p1.y) / 2
    const sway = i % 2 === 0 ? -16 : 16
    segments.push({
      x0: p0.x,
      y0: p0.y,
      cp1x: p0.x + sway,
      cp1y: midY + 6,
      cp2x: p1.x - sway * 0.6,
      cp2y: midY - 6,
      x1: p1.x,
      y1: p1.y,
      thickness: Math.max(2.4, 6.2 - i * 0.26),
    })
  }
  return segments
}

const BLOSSOM_COLORS = ['#f472b6', '#fb7185', '#fde047', '#c084fc', '#60a5fa']
const ANGRY_ROOMMATE_STATES: RoommateState[] = ['glaring_with_clipboard', 'sweeping_leaves', 'shivering']

function createInitialLeaves(segments: VineSegment[]): LeafNode[] {
  const initialCount = 5
  const list: LeafNode[] = []
  for (let i = 0; i < initialCount; i++) {
    const segIdx = Math.min(i, segments.length - 1)
    const seg = segments[segIdx]
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1
    list.push({
      id: i + 1,
      segmentIndex: segIdx,
      side,
      size: 15 + (i % 3) * 2,
      baseAngle: side * (0.55 + (i % 2) * 0.25),
      health: 1,
      status: 'attached',
      hasBlossom: i % 2 === 1,
      blossomScale: 1.05,
      blossomColor: BLOSSOM_COLORS[i % BLOSSOM_COLORS.length],
      x: seg.x1,
      y: seg.y1,
      vx: 0,
      vy: 0,
      rotation: 0,
      vRot: 0,
      swayPhase: Math.random() * Math.PI * 2,
      seed: (i + 1) * 1.73,
    })
  }
  return list
}

function dropTopLeaf(prev: LeafNode[], segments: VineSegment[]): LeafNode[] {
  const attached = prev.filter((l) => l.status === 'attached' || l.status === 'dying')
  if (attached.length === 0) return prev
  const victim = [...attached].sort((a, b) => b.segmentIndex - a.segmentIndex)[0]
  const seg = segments[Math.min(victim.segmentIndex, segments.length - 1)]
  return prev.map((leaf) => {
    if (leaf.id === victim.id) {
      return {
        ...leaf,
        health: 0.15,
        status: 'falling' as const,
        x: seg ? seg.x1 : 140,
        y: seg ? seg.y1 : 180,
        vx: 0.9 + Math.random() * 1.1,
        vy: 1.4,
        vRot: (Math.random() - 0.5) * 0.08,
      }
    }
    if (leaf.status === 'attached') {
      return { ...leaf, health: Math.max(0.5, leaf.health - 0.1) }
    }
    return leaf
  })
}

function formatTimer(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function App() {
  const studioCanvasRef = useRef<HTMLCanvasElement>(null)
  const vineSegments = useMemo(() => generateProceduralVineSegments(), [])

  const [skinId, setSkinId] = useState<RoomSkinId>('cozy_greenhouse')
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const leavesRef = useRef(leaves)
  leavesRef.current = leaves
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.38)
  const [nextLeafProgress, setNextLeafProgress] = useState<number>(0.1)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>('Pick your timers, then hit Start.')
  const [activePanel, setActivePanel] = useState<ExpandablePanel>(null)
  const [isPolaroidOpen, setIsPolaroidOpen] = useState<boolean>(false)
  const [stopArmed, setStopArmed] = useState<boolean>(false)

  const [stats, setStats] = useState<SessionStats>({
    focusSeconds: 0,
    unbrokenFocusSeconds: 0,
    comebackProgressSeconds: 0,
    tabSwitches: 0,
    authorizedTabSwitches: 0,
    phoneAlerts: 0,
    leavesGrown: 5,
    leavesLost: 0,
    goldenLeavesPainted: 0,
    roomTempCelsius: 22,
    currentTask: 'Deep Focus',
    speedMultiplier: 1,
  })

  // ---------- Sound ----------
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFX.isEnabled())
  useEffect(() => {
    const unsub = soundFX.onEnabledChange((val) => setSoundEnabled(val))
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'leaf_me_alone_sound_enabled') {
        const val = e.newValue !== 'false'
        setSoundEnabled(val)
        soundFX.setEnabled(val)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // ---------- Pomodoro ----------
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>({
    isRunning: false,
    phase: 'focus',
    focusMinutes: 25,
    breakMinutes: 5,
    leavesPerCycle: 5,
    remainingSeconds: 25 * 60,
    completedCycles: 0,
  })
  const phaseEndsAtRef = useRef<number>(0)
  const lastTickAtRef = useRef<number>(Date.now())
  const lastSessionSaveAtRef = useRef<number>(0)
  const leafAccumulatorSecRef = useRef<number>(0)
  const sessionStartedAtRef = useRef<number>(0)

  const isFocusSessionActive = pomodoro.isRunning && pomodoro.phase === 'focus'
  const isFocusSessionActiveRef = useRef<boolean>(isFocusSessionActive)
  isFocusSessionActiveRef.current = isFocusSessionActive

  // ---------- Session history (persisted) ----------
  const [sessions, setSessions] = useState<PomodoroSessionRecord[]>(() => loadSessions())
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  const currentSession = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : undefined
  const lastFinishedSession = useMemo(
    () => [...sessions].reverse().find((s) => s.status !== 'running'),
    [sessions]
  )
  const todayKey = toDateKey(Date.now())
  const todaysSessionCount = sessions.filter((s) => s.dateKey === todayKey).length

  // ---------- Red (angry) state: every reason is tracked separately ----------
  const [faceAway, setFaceAway] = useState<boolean>(false)
  const [extDrift, setExtDrift] = useState<{ drifting: boolean; reason: string }>({
    drifting: false,
    reason: '',
  })
  const [pageDrift, setPageDrift] = useState<boolean>(false)
  const [calmUntil, setCalmUntil] = useState<number | null>(null)
  const [lastRedReason, setLastRedReason] = useState<string>('')
  const [angryLook, setAngryLook] = useState<{ roommate: RoommateState; climax: boolean }>({
    roommate: 'glaring_with_clipboard',
    climax: false,
  })
  const [nowMs, setNowMs] = useState<number>(Date.now())

  const offScreen = extDrift.drifting || pageDrift
  const driftReason = extDrift.drifting && extDrift.reason ? extDrift.reason : 'You left the Chrome window'
  const hasActiveReason = isFocusSessionActive && (faceAway || offScreen)
  const isRed = isFocusSessionActive && (faceAway || offScreen || calmUntil !== null)
  const focusMode: FocusMode = isRed ? (angryLook.climax ? 'last_leaf_climax' : 'distracted') : 'locked_in'
  const roommateState: RoommateState = isRed ? angryLook.roommate : 'typing'
  const calmSecondsLeft = calmUntil !== null ? Math.max(1, Math.ceil((calmUntil - nowMs) / 1000)) : 0

  const resetRedState = useCallback(() => {
    setFaceAway(false)
    setExtDrift({ drifting: false, reason: '' })
    setPageDrift(false)
    setCalmUntil(null)
  }, [])

  useEffect(() => {
    if (!soundEnabled) {
      soundFX.setMood('silent')
      return
    }
    if (pomodoro.phase === 'awaiting_next_session') {
      soundFX.setMood('silent')
      return
    }
    soundFX.setMood(isRed ? 'storm' : 'studying')
  }, [soundEnabled, isRed, pomodoro.phase])

  // ---------- Leaves ----------
  const sproutOneLeaf = useCallback(() => {
    soundFX.playLeafSprout()
    setLeaves((prev) => {
      const healed = prev.map((l) =>
        l.status === 'attached' || l.status === 'dying'
          ? { ...l, status: 'attached' as const, health: Math.min(1, l.health + 0.35), hasBlossom: true }
          : l
      )
      const attached = healed.filter((l) => l.status === 'attached')
      if (attached.length >= vineSegments.length) return healed

      const occupied = new Set(attached.map((l) => l.segmentIndex))
      let targetSegIdx = 0
      for (let i = 0; i < vineSegments.length; i++) {
        if (!occupied.has(i)) {
          targetSegIdx = i
          break
        }
      }
      const seg = vineSegments[targetSegIdx]
      const newId = healed.length + 1
      const side: -1 | 1 = targetSegIdx % 2 === 0 ? -1 : 1
      const newLeaf: LeafNode = {
        id: newId,
        segmentIndex: targetSegIdx,
        side,
        size: 15 + (targetSegIdx % 3) * 2,
        baseAngle: side * (0.5 + (targetSegIdx % 2) * 0.25),
        health: 1,
        status: 'attached',
        hasBlossom: true,
        blossomScale: 1.1,
        blossomColor: BLOSSOM_COLORS[newId % BLOSSOM_COLORS.length],
        x: seg.x1,
        y: seg.y1,
        vx: 0,
        vy: 0,
        rotation: 0,
        vRot: 0,
        swayPhase: Math.random() * Math.PI * 2,
        seed: newId * 2.17,
      }
      return [...healed, newLeaf]
    })
    setStats((s) => ({ ...s, leavesGrown: s.leavesGrown + 1 }))
  }, [vineSegments])

  const attachedLeavesCount = leaves.filter((l) => l.status === 'attached' || l.status === 'dying').length
  const fallenLeavesCount = leaves.filter((l) => l.status === 'falling' || l.status === 'fallen').length

  useEffect(() => {
    setVineGrowthProgress(Math.min(1, Math.max(0.25, (attachedLeavesCount + 0.5) / vineSegments.length)))
  }, [attachedLeavesCount, vineSegments.length])

  // ---------- Violations ----------
  const registerViolation = useCallback(
    (kind: ViolationKind, message: string) => {
      if (!isFocusSessionActiveRef.current) return
      const sessionId = currentSessionIdRef.current
      const at = Date.now()
      if (sessionId) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, violations: [...s.violations, { id: makeId(), at, kind, message }] } : s
          )
        )
      }

      const attachedNow = leavesRef.current.filter((l) => l.status === 'attached' || l.status === 'dying')
      const climax = attachedNow.length <= 2
      setLeaves((prev) => dropTopLeaf(prev, vineSegments))
      leafAccumulatorSecRef.current = 0
      setNextLeafProgress(0)
      setDaysSinceDoomscroll(0)
      setStats((prev) => ({
        ...prev,
        tabSwitches: kind === 'new_tab' || kind === 'off_screen' ? prev.tabSwitches + 1 : prev.tabSwitches,
        phoneAlerts: kind === 'face_away' ? prev.phoneAlerts + 1 : prev.phoneAlerts,
        unbrokenFocusSeconds: 0,
        comebackProgressSeconds: 0,
        leavesLost: prev.leavesLost + 1,
        roomTempCelsius: Math.max(7, prev.roomTempCelsius - 3.5),
      }))

      if (kind === 'stopped_early') {
        soundFX.playClipboardPenalty()
        return
      }

      const roommate: RoommateState = climax
        ? 'dramatic_sickbed'
        : ANGRY_ROOMMATE_STATES[Math.floor(Math.random() * ANGRY_ROOMMATE_STATES.length)]
      setAngryLook({ roommate, climax })
      setLastRedReason(message)
      if (climax) soundFX.playThunderClimax()
      else soundFX.playClipboardPenalty()
      const quote =
        kind === 'face_away' && !climax
          ? AWAY_DETECTED_QUOTES[Math.floor(Math.random() * AWAY_DETECTED_QUOTES.length)]
          : pickRandomDialogue(roommate, attachedNow[0]?.id || 1)
      setDialogueText(`${message} — ${quote}`)
    },
    [vineSegments]
  )

  // One violation per "out of camera" episode.
  const prevFaceAwayRef = useRef(false)
  useEffect(() => {
    if (faceAway && !prevFaceAwayRef.current) registerViolation('face_away', 'You left the camera')
    prevFaceAwayRef.current = faceAway
  }, [faceAway, registerViolation])

  // One violation per "left the window" episode.
  const prevOffScreenRef = useRef(false)
  useEffect(() => {
    if (offScreen && !prevOffScreenRef.current) registerViolation('off_screen', driftReason)
    prevOffScreenRef.current = offScreen
  }, [offScreen, driftReason, registerViolation])

  // Stay angry for 5s after every reason is gone, then calm down.
  const prevHadReasonRef = useRef(false)
  useEffect(() => {
    if (prevHadReasonRef.current && !hasActiveReason && isFocusSessionActiveRef.current) {
      setCalmUntil(Date.now() + CALM_DOWN_MS)
    }
    prevHadReasonRef.current = hasActiveReason
  }, [hasActiveReason])

  useEffect(() => {
    if (calmUntil === null) return
    setNowMs(Date.now())
    const id = setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      if (now >= calmUntil) setCalmUntil(null)
    }, 250)
    return () => clearInterval(id)
  }, [calmUntil])

  const prevIsRedRef = useRef(false)
  useEffect(() => {
    if (prevIsRedRef.current && !isRed && isFocusSessionActiveRef.current) {
      setDialogueText('Back to normal. The ivy forgives you… barely. Keep going.')
    }
    prevIsRedRef.current = isRed
  }, [isRed])

  const handlePresenceChange = useCallback((present: boolean) => {
    if (!isFocusSessionActiveRef.current) return
    setFaceAway(!present)
  }, [])

  // ---------- Guard state shared with the dev server + Chrome extension ----------
  useEffect(() => {
    if (!IS_GUARD_HOST) return
    postGuardState(isFocusSessionActive)
    if (!isFocusSessionActive) {
      resetRedState()
      return
    }
    const id = setInterval(() => postGuardState(true), HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [isFocusSessionActive, resetRedState])

  useEffect(() => {
    if (!IS_GUARD_HOST) return
    const turnOffGuard = () => {
      try {
        const blob = new Blob([JSON.stringify(guardStateBody(false))], { type: 'application/json' })
        navigator.sendBeacon('/api/focus-guard-state', blob)
      } catch {}
    }
    window.addEventListener('pagehide', turnOffGuard)
    return () => window.removeEventListener('pagehide', turnOffGuard)
  }, [])

  // Events relayed by the dev server from the Chrome extension.
  const serverEventsRef = useRef({
    onNewTabBlocked: (_reason?: string) => {},
    onDriftState: (_drifting: boolean, _reason?: string, _source?: string) => {},
  })
  serverEventsRef.current = {
    onNewTabBlocked: (reason) => {
      if (!isFocusSessionActiveRef.current) return
      registerViolation('new_tab', reason || 'Opened a new tab')
      setCalmUntil(Date.now() + CALM_DOWN_MS)
    },
    onDriftState: (drifting, reason, source) => {
      if (!isFocusSessionActiveRef.current || source === 'page') return
      if (drifting) {
        if (Date.now() - sessionStartedAtRef.current < DRIFT_GRACE_MS) return
        if (document.hasFocus()) return
        setExtDrift((prev) =>
          prev.drifting && prev.reason === (reason || '') ? prev : { drifting: true, reason: reason || '' }
        )
      } else {
        setExtDrift((prev) => (prev.drifting ? { drifting: false, reason: '' } : prev))
      }
    },
  }

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    const onBlocked = (data: { reason?: string }) => serverEventsRef.current.onNewTabBlocked(data?.reason)
    const onDrift = (data: { drifting?: boolean; reason?: string; source?: string }) =>
      serverEventsRef.current.onDriftState(Boolean(data?.drifting), data?.reason, data?.source)
    hot.on('leaf-new-tab-blocked', onBlocked)
    hot.on('leaf-drift-state', onDrift)
    return () => {
      hot.off('leaf-new-tab-blocked', onBlocked)
      hot.off('leaf-drift-state', onDrift)
    }
  }, [])

  // Page-side focus check: clears drift the moment this tab has focus, and is the fallback
  // drift detector when the extension isn't installed.
  useEffect(() => {
    if (!isFocusSessionActive || !IS_GUARD_HOST) return
    let blurredSince: number | null = null
    const id = setInterval(() => {
      if (document.hasFocus()) {
        blurredSince = null
        setPageDrift(false)
        setExtDrift((prev) => (prev.drifting ? { drifting: false, reason: '' } : prev))
        return
      }
      const hasExtension = Boolean(document.documentElement.dataset.leafGuard)
      if (hasExtension || document.hidden) {
        blurredSince = null
        setPageDrift(false)
        return
      }
      if (Date.now() - sessionStartedAtRef.current < DRIFT_GRACE_MS) return
      if (blurredSince === null) blurredSince = Date.now()
      if (Date.now() - blurredSince >= PAGE_DRIFT_DEBOUNCE_MS) {
        setPageDrift(true)
        postJson('/api/drift-state', { drifting: true, source: 'page', reason: 'You left the Chrome window' })
      }
    }, 500)
    return () => clearInterval(id)
  }, [isFocusSessionActive])

  // ---------- Session lifecycle ----------
  const targetSecondsPerLeaf = Math.max(
    20,
    Math.round((pomodoro.focusMinutes * 60) / Math.max(1, pomodoro.leavesPerCycle))
  )

  const startFocusSession = useCallback(() => {
    const now = Date.now()
    const record: PomodoroSessionRecord = {
      id: makeId(),
      dateKey: toDateKey(now),
      startedAt: now,
      endedAt: null,
      plannedMinutes: pomodoro.focusMinutes,
      focusSeconds: 0,
      status: 'running',
      violations: [],
    }
    setSessions((prev) => [...prev, record])
    currentSessionIdRef.current = record.id
    setCurrentSessionId(record.id)
    sessionStartedAtRef.current = now
    phaseEndsAtRef.current = now + pomodoro.focusMinutes * 60 * 1000
    lastTickAtRef.current = now
    lastSessionSaveAtRef.current = now
    leafAccumulatorSecRef.current = 0
    isFocusSessionActiveRef.current = true
    resetRedState()
    setStopArmed(false)
    setNextLeafProgress(0.02)
    soundFX.playPomodoroBell()
    setDialogueText(`Focus started · ${pomodoro.focusMinutes}m. No pausing, no wandering off.`)
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: true,
      remainingSeconds: prev.focusMinutes * 60,
    }))
    setActivePanel(null)
    if (IS_GUARD_HOST) postGuardState(true)
  }, [pomodoro.focusMinutes, resetRedState])

  const stopSession = useCallback(() => {
    const wasFocus = pomodoro.isRunning && pomodoro.phase === 'focus'
    if (wasFocus) {
      const sessionId = currentSessionIdRef.current
      const now = Date.now()
      registerViolation('stopped_early', 'Stopped early')
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: 'stopped',
                endedAt: now,
                focusSeconds: Math.min(s.plannedMinutes * 60, Math.round((now - s.startedAt) / 1000)),
              }
            : s
        )
      )
      currentSessionIdRef.current = null
      setCurrentSessionId(null)
      setDialogueText('Stopped early — that cost a leaf. The timer resets to full when you start again.')
    } else {
      setDialogueText('Break skipped. Start the next session when you are ready.')
    }
    isFocusSessionActiveRef.current = false
    if (IS_GUARD_HOST) postGuardState(false)
    resetRedState()
    setStopArmed(false)
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0)
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: false,
      remainingSeconds: prev.focusMinutes * 60,
    }))
  }, [pomodoro.isRunning, pomodoro.phase, registerViolation, resetRedState])

  const completeFocus = () => {
    const now = Date.now()
    const sessionId = currentSessionIdRef.current
    const current = sessionsRef.current.find((s) => s.id === sessionId)
    const penalties = current ? penaltyCount(current) : 0
    if (sessionId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: 'completed', endedAt: now, focusSeconds: s.plannedMinutes * 60 } : s
        )
      )
    }
    currentSessionIdRef.current = null
    setCurrentSessionId(null)
    isFocusSessionActiveRef.current = false
    soundFX.playGoldenFanfare()
    sproutOneLeaf()
    if (penalties === 0) {
      setStats((s) => ({ ...s, goldenLeavesPainted: s.goldenLeavesPainted + 1 }))
    }
    setDialogueText(
      penalties === 0
        ? `Clean session! Golden leaf earned. Enjoy your ${pomodoro.breakMinutes}m break.`
        : `Session done with ${penalties} penalt${penalties === 1 ? 'y' : 'ies'}. Enjoy your ${pomodoro.breakMinutes}m break.`
    )
    phaseEndsAtRef.current = now + pomodoro.breakMinutes * 60 * 1000
    setPomodoro((prev) => ({
      ...prev,
      phase: 'break',
      remainingSeconds: prev.breakMinutes * 60,
      completedCycles: prev.completedCycles + 1,
    }))
  }

  const endBreak = () => {
    soundFX.playPomodoroBell()
    setDialogueText('Break over. Start the next session whenever you are ready.')
    setPomodoro((prev) => ({
      ...prev,
      phase: 'awaiting_next_session',
      isRunning: false,
      remainingSeconds: prev.focusMinutes * 60,
    }))
  }

  // Wall-clock timer, so a throttled background tab never drifts the countdown.
  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    const now = Date.now()
    const dt = Math.min(120, Math.max(0, Math.round((now - lastTickAtRef.current) / 1000)))
    lastTickAtRef.current = now
    const remaining = Math.max(0, Math.ceil((phaseEndsAtRef.current - now) / 1000))

    if (pomodoro.phase === 'focus') {
      if (remaining <= 0) {
        completeFocus()
        return
      }
      if (!isRed && dt > 0) {
        leafAccumulatorSecRef.current += dt
        if (leafAccumulatorSecRef.current >= targetSecondsPerLeaf) {
          leafAccumulatorSecRef.current -= targetSecondsPerLeaf
          setNextLeafProgress(0.02)
          sproutOneLeaf()
        } else {
          setNextLeafProgress(leafAccumulatorSecRef.current / targetSecondsPerLeaf)
        }
        setLeaves((prev) =>
          prev.some((l) => l.status === 'attached' && l.health < 1)
            ? prev.map((l) => (l.status === 'attached' && l.health < 1 ? { ...l, health: Math.min(1, l.health + 0.03) } : l))
            : prev
        )
        setStats((prev) => ({
          ...prev,
          focusSeconds: prev.focusSeconds + dt,
          unbrokenFocusSeconds: prev.unbrokenFocusSeconds + dt,
          roomTempCelsius: Math.min(24, prev.roomTempCelsius + 0.3 * dt),
        }))
      }
      const sessionId = currentSessionIdRef.current
      if (sessionId && now - lastSessionSaveAtRef.current >= SESSION_SAVE_EVERY_MS) {
        lastSessionSaveAtRef.current = now
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, focusSeconds: Math.min(s.plannedMinutes * 60, Math.round((now - s.startedAt) / 1000)) }
              : s
          )
        )
      }
    } else if (pomodoro.phase === 'break' && remaining <= 0) {
      endBreak()
      return
    }

    setPomodoro((prev) => (prev.remainingSeconds === remaining ? prev : { ...prev, remainingSeconds: remaining }))
  }

  useEffect(() => {
    if (!pomodoro.isRunning) return
    lastTickAtRef.current = Date.now()
    const id = setInterval(() => tickRef.current(), 1000)
    return () => clearInterval(id)
  }, [pomodoro.isRunning, pomodoro.phase])

  useEffect(() => {
    if (!stopArmed) return
    const id = setTimeout(() => setStopArmed(false), STOP_CONFIRM_MS)
    return () => clearTimeout(id)
  }, [stopArmed])

  const handleStartStopClick = () => {
    if (!pomodoro.isRunning) {
      startFocusSession()
      return
    }
    if (pomodoro.phase === 'focus' && !stopArmed) {
      setStopArmed(true)
      return
    }
    stopSession()
  }

  // ---------- Falling leaf physics ----------
  useEffect(() => {
    const floorLevel = 392
    const interval = setInterval(() => {
      setLeaves((prev) => {
        let changed = false
        const next = prev.map((leaf) => {
          if (leaf.status !== 'falling') return leaf
          changed = true
          const nextSway = leaf.swayPhase + 0.14
          const nx = leaf.x + leaf.vx + Math.sin(nextSway) * 1.8
          const ny = leaf.y + leaf.vy
          const nRot = leaf.rotation + leaf.vRot + Math.cos(nextSway) * 0.03
          if (ny >= floorLevel + (leaf.id % 5) * 6) {
            return {
              ...leaf,
              x: Math.min(350, Math.max(55, nx)),
              y: floorLevel + (leaf.id % 5) * 6,
              status: 'fallen' as const,
              health: 0.05,
              rotation: 0.25 * (leaf.id % 2 === 0 ? 1 : -1),
            }
          }
          return { ...leaf, x: nx, y: ny, rotation: nRot, swayPhase: nextSway, health: Math.max(0.08, leaf.health - 0.015) }
        })
        return changed ? next : prev
      })
    }, 32)
    return () => clearInterval(interval)
  }, [])

  // ---------- Upgrades ----------
  useEffect(() => {
    const focusMinutes = Math.floor(stats.focusSeconds / 60)
    setUpgrades((prev) => {
      let unlockedAny = false
      const updated = prev.map((u) => {
        if (!u.unlocked && focusMinutes >= u.unlockMinutes) {
          unlockedAny = true
          return { ...u, unlocked: true }
        }
        return u
      })
      return unlockedAny ? updated : prev
    })
  }, [stats.focusSeconds])

  const prevUnlockedCountRef = useRef(0)
  const unlockedUpgradesCount = upgrades.filter((u) => u.unlocked).length
  useEffect(() => {
    if (unlockedUpgradesCount > prevUnlockedCountRef.current) soundFX.playLeafSprout()
    prevUnlockedCountRef.current = unlockedUpgradesCount
  }, [unlockedUpgradesCount])

  const togglePanel = (panel: ExpandablePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  const comebackProgress = Math.min(1, stats.comebackProgressSeconds / 300)
  const sessionPenalties = currentSession ? penaltyCount(currentSession) : 0
  const redBannerText = !isRed
    ? ''
    : faceAway
    ? 'You left the camera — come back'
    : offScreen
    ? `${driftReason} — taking you back`
    : `${lastRedReason || 'Violation'} · calm in ${calmSecondsLeft}s`

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden select-none transition-colors duration-300 ${
        isRed ? 'bg-rose-950 text-stone-100 ring-8 ring-inset ring-rose-500/80' : 'bg-stone-950 text-stone-100'
      }`}
    >
      <header
        className={`flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 transition-colors ${
          isRed ? 'border-rose-500/60 bg-rose-950/90' : 'border-stone-800/80 bg-stone-950'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
              isRed
                ? 'animate-pulse border-rose-400 bg-rose-500/20 text-rose-300'
                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
            }`}
          >
            <Leaf className="h-4 w-4" />
          </div>
          <span className="font-serif text-base font-bold tracking-tight text-stone-100">Leaf Me Alone</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => togglePanel('pomodoro')}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1 font-mono text-xs font-bold transition ${
              activePanel === 'pomodoro'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                : pomodoro.phase === 'awaiting_next_session'
                ? 'animate-pulse border-emerald-400 bg-emerald-950/80 text-emerald-200'
                : pomodoro.phase === 'break'
                ? 'border-amber-500/40 bg-amber-950/50 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
            }`}
          >
            {pomodoro.phase === 'break' ? (
              <Coffee className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Timer className="h-3.5 w-3.5" />
            )}
            <span>
              {pomodoro.phase === 'awaiting_next_session'
                ? 'Break done · Start next'
                : `${pomodoro.phase === 'focus' ? 'Focus' : 'Break'} ${formatTimer(pomodoro.remainingSeconds)}`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {pomodoro.phase !== 'awaiting_next_session' && (
            <button
              onClick={handleStartStopClick}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-xs font-bold text-white transition ${
                !pomodoro.isRunning
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : stopArmed
                  ? 'animate-pulse bg-rose-500 ring-2 ring-rose-300'
                  : 'bg-rose-600 hover:bg-rose-500'
              }`}
              title={pomodoro.isRunning && pomodoro.phase === 'focus' ? 'Stopping early drops a leaf' : undefined}
            >
              {!pomodoro.isRunning ? (
                <>
                  <Play className="h-3 w-3" />
                  <span>Start</span>
                </>
              ) : pomodoro.phase === 'break' ? (
                <>
                  <Square className="h-3 w-3" />
                  <span>Skip break</span>
                </>
              ) : stopArmed ? (
                <>
                  <Square className="h-3 w-3" />
                  <span>Stop? −1 leaf</span>
                </>
              ) : (
                <>
                  <Square className="h-3 w-3" />
                  <span>Stop</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            onClick={() => togglePanel('stats')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              activePanel === 'stats'
                ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
            title="Session summary & weekly graph"
          >
            <BarChart3 className="h-3.5 w-3.5 text-sky-400" />
            <span>Stats</span>
            {todaysSessionCount > 0 && (
              <span className="rounded bg-stone-800 px-1 text-[10px] text-stone-300">{todaysSessionCount}</span>
            )}
          </button>

          <button
            onClick={() => togglePanel('upgrades')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              activePanel === 'upgrades'
                ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Palette className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Skins</span>
          </button>

          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              soundFX.setEnabled(next)
              if (!next) nukeAllActiveAudio()
            }}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              soundEnabled
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                : 'border-rose-500/40 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
            }`}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Sound On</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                <span className="hidden sm:inline">Muted</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsPolaroidOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-500"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Polaroid</span>
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-3">
        {isRed && (
          <div
            data-red-reason={faceAway ? 'face_away' : offScreen ? 'off_screen' : 'calming'}
            className="absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border-2 border-rose-400 bg-rose-950/95 px-4 py-2 font-mono text-xs font-bold text-rose-100 shadow-2xl"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce text-rose-400" />
            <span>WHY RED: {redBannerText}</span>
            <button
              onClick={() => setActivePanel('stats')}
              className="ml-2 rounded-lg bg-rose-800/80 px-2 py-0.5 text-[10px] text-rose-100 hover:bg-rose-700"
            >
              {sessionPenalties} this session
            </button>
          </div>
        )}

        <div
          className={`h-full w-full max-w-5xl rounded-2xl transition-all ${
            isRed ? 'shadow-2xl shadow-rose-950 ring-4 ring-rose-500' : ''
          }`}
        >
          <StudioCanvas
            focusMode={focusMode}
            roommateState={roommateState}
            skinId={skinId}
            isRoughWeather={isRed}
            leaves={leaves}
            vineSegments={vineSegments}
            vineGrowthProgress={vineGrowthProgress}
            nextLeafProgress={nextLeafProgress}
            upgrades={upgrades}
            daysSinceDoomscroll={daysSinceDoomscroll}
            goldenLeavesPainted={stats.goldenLeavesPainted}
            roomTempCelsius={stats.roomTempCelsius}
            comebackProgress={comebackProgress}
            dialogueText={dialogueText}
            canvasRef={studioCanvasRef}
          />
        </div>

        {pomodoro.phase === 'awaiting_next_session' && (
          <div className="backdrop-blur-xs absolute inset-0 z-20 flex items-center justify-center bg-black/60">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-emerald-500/40 bg-stone-900/95 p-6 text-center shadow-2xl">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-xl font-bold text-stone-100">Session &amp; break complete</h2>
              {lastFinishedSession && (
                <p className="font-mono text-xs text-stone-400">
                  Last session:{' '}
                  <strong className={penaltyCount(lastFinishedSession) ? 'text-rose-300' : 'text-emerald-300'}>
                    {penaltyCount(lastFinishedSession) === 0
                      ? 'clean'
                      : `${penaltyCount(lastFinishedSession)} penalt${penaltyCount(lastFinishedSession) === 1 ? 'y' : 'ies'}`}
                  </strong>{' '}
                  · {todaysSessionCount} today
                </p>
              )}
              <div className="flex w-full gap-2">
                <button
                  onClick={startFocusSession}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-mono text-xs font-extrabold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500"
                >
                  <Play className="h-4 w-4" />
                  Start next ({pomodoro.focusMinutes}m)
                </button>
                <button
                  onClick={() => setActivePanel('stats')}
                  className="flex items-center justify-center gap-1 rounded-xl border border-stone-700 px-3 py-2.5 font-mono text-xs font-bold text-stone-300 hover:bg-stone-800"
                >
                  <BarChart3 className="h-4 w-4" />
                  Stats
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-20">
          <WebcamGuard enabled={isFocusSessionActive && IS_GUARD_HOST} onPresenceChange={handlePresenceChange} />
        </div>

        {activePanel && (
          <div
            className={`absolute right-4 top-3 z-30 w-full rounded-2xl border border-stone-700/90 bg-stone-900/95 p-3.5 shadow-2xl backdrop-blur-md ${
              activePanel === 'stats' ? 'max-w-[22rem]' : 'max-w-xs'
            }`}
          >
            <div className="mb-2 flex items-center justify-between border-b border-stone-800 pb-1.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                {activePanel === 'pomodoro' && 'Pomodoro & Break'}
                {activePanel === 'stats' && 'Sessions & Weekly Focus'}
                {activePanel === 'upgrades' && 'Room Skins & Upgrades'}
              </span>
              <button
                onClick={() => setActivePanel(null)}
                className="rounded-lg p-0.5 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {activePanel === 'pomodoro' && (
              <PomodoroPanel
                config={pomodoro}
                onUpdateConfig={(partial) => setPomodoro((prev) => ({ ...prev, ...partial }))}
              />
            )}

            {activePanel === 'stats' && <StatsPanel sessions={sessions} />}

            {activePanel === 'upgrades' && (
              <div className="max-h-80 space-y-3 overflow-y-auto pr-0.5 font-mono text-xs">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-400">
                    <Palette className="h-3 w-3" /> Studio Room Skin (5 Themes)
                  </div>
                  <div className="space-y-1">
                    {ROOM_SKINS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSkinId(s.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition ${
                          skinId === s.id
                            ? 'border-amber-400 bg-amber-500/15 text-stone-100'
                            : 'border-stone-800 bg-stone-950/70 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.previewColor }} />
                          <div className="truncate">
                            <div className="text-[11px] font-bold">{s.name}</div>
                            <div className="truncate text-[9px] text-stone-500">{s.subtitle}</div>
                          </div>
                        </div>
                        {skinId === s.id && <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-stone-800 pt-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400">
                      <Layers className="h-3 w-3" /> Furniture ({unlockedUpgradesCount}/5)
                    </span>
                    <button
                      onClick={() => setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9.5px] font-bold text-amber-300"
                    >
                      Unlock All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {upgrades.map((u) => (
                      <div
                        key={u.id}
                        onClick={() =>
                          setUpgrades((prev) =>
                            prev.map((item) => (item.id === u.id ? { ...item, unlocked: !item.unlocked } : item))
                          )
                        }
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 transition ${
                          u.unlocked
                            ? 'border-emerald-500/40 bg-emerald-950/30 text-stone-100'
                            : 'border-stone-800 bg-stone-950/60 text-stone-500'
                        }`}
                      >
                        <span className="text-[11px] font-bold">{u.name}</span>
                        <span className="text-[10px] text-emerald-400">
                          {u.unlocked ? 'ON' : `${u.unlockMinutes}m`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <PolaroidModal
        isOpen={isPolaroidOpen}
        onClose={() => setIsPolaroidOpen(false)}
        studioCanvasRef={studioCanvasRef}
        stats={stats}
        attachedLeavesCount={attachedLeavesCount}
        fallenLeavesCount={fallenLeavesCount}
        upgrades={upgrades}
      />
    </div>
  )
}

export default App
