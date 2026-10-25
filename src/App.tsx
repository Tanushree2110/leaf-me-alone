import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Coffee,
  Layers,
  Leaf,
  Palette,
  Play,
  ShieldCheck,
  Square,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import {
  ActivityLogItem,
  CameraStatus,
  FocusMode,
  LeafNode,
  RoommateState,
  RoomSkinId,
  RoomUpgrade,
  SessionStats,
  VineSegment,
} from './types'
import {
  AWAY_DETECTED_QUOTES,
  INITIAL_UPGRADES,
  PHONE_DETECTED_QUOTES,
  pickRandomDialogue,
} from './utils/dialogue'
import { ROOM_SKINS } from './utils/skins'
import { nukeAllActiveAudio, soundFX } from './utils/sound'
import { StudioCanvas } from './components/StudioCanvas'
import { PolaroidModal } from './components/PolaroidModal'
import { WebcamGuard } from './components/WebcamGuard'
import { AllowedTabsManager } from './components/AllowedTabsManager'
import { PomodoroConfig, PomodoroPanel } from './components/PomodoroPanel'

type ExpandablePanel = 'pomodoro' | 'tabs' | 'upgrades' | 'log' | null

interface SessionLogRecord {
  sessionNumber: number
  startedAt: string
  totalViolations: number
  faceAwayCount: number
  blockedNewTabCount: number
  events: ActivityLogItem[]
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

export function App() {
  const studioCanvasRef = useRef<HTMLCanvasElement>(null)
  const vineSegments = useMemo(() => generateProceduralVineSegments(), [])

  const [focusMode, setFocusMode] = useState<FocusMode>('locked_in')
  const [roommateState, setRoommateState] = useState<RoommateState>('typing')
  const [skinId, setSkinId] = useState<RoomSkinId>('cozy_greenhouse')
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.38)
  const [nextLeafProgress, setNextLeafProgress] = useState<number>(0.1)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>(
    'Select your Pomodoro timer, then click Start!'
  )

  // Live Red Reason Banner (shown whenever the screen is RED so you always know WHY!)
  const [currentRedReason, setCurrentRedReason] = useState<string | null>(null)

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFX.isEnabled())

  useEffect(() => {
    const unsub = soundFX.onEnabledChange((val) => {
      setSoundEnabled(val)
    })
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

  // Opt-In Customizable Pomodoro State
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>({
    enabled: true,
    isRunning: false,
    phase: 'focus',
    focusMinutes: 25,
    breakMinutes: 5,
    leavesPerCycle: 5,
    remainingSeconds: 25 * 60,
    completedCycles: 0,
  })
  const leafAccumulatorSecRef = useRef<number>(0)

  // Minimal Popovers
  const [activePanel, setActivePanel] = useState<ExpandablePanel>(null)
  const [isPolaroidOpen, setIsPolaroidOpen] = useState<boolean>(false)

  // Webcam Guard State
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('focused')

  // Chrome Tab Guard State
  const [extensionConnected, setExtensionConnected] = useState<boolean>(false)
  const [allowedTabsCount, setAllowedTabsCount] = useState<number>(1)

  const lastDistractionMsRef = useRef<number>(0)

  // Simple Per-Session Violation Log & Metrics
  const [sessionsLog, setSessionsLog] = useState<SessionLogRecord[]>(() => [
    {
      sessionNumber: 1,
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      totalViolations: 0,
      faceAwayCount: 0,
      blockedNewTabCount: 0,
      events: [],
    },
  ])

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

  const recordViolationInCurrentSession = useCallback(
    (category: 'face_away' | 'blocked_new_tab', reason: string) => {
      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const entry: ActivityLogItem = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: timeStr,
        type: category === 'face_away' ? 'camera' : 'distraction',
        message: reason,
      }

      setSessionsLog((prev) => {
        const copy = [...prev]
        const current = { ...copy[0] }
        current.totalViolations += 1
        if (category === 'face_away') current.faceAwayCount += 1
        else current.blockedNewTabCount += 1
        current.events = [entry, ...current.events]
        copy[0] = current
        return copy
      })
    },
    []
  )

  const isRoughWeather =
    cameraStatus === 'away_detected' ||
    cameraStatus === 'phone_detected' ||
    focusMode === 'distracted' ||
    focusMode === 'last_leaf_climax'

  // Sync Background Music (Soothing Pad whenever GREEN & Sound On vs Thunder Storm when RED)
  useEffect(() => {
    if (!soundEnabled) {
      soundFX.setMood('silent')
      return
    }
    if (pomodoro.enabled && pomodoro.phase === 'awaiting_next_session') {
      soundFX.setMood('silent')
      return
    }
    if (isRoughWeather) {
      soundFX.setMood('storm')
    } else {
      soundFX.setMood('studying')
    }
  }, [soundEnabled, isRoughWeather, pomodoro.enabled, pomodoro.phase])

  const togglePanel = (panel: ExpandablePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  // Sprout one new healthy emerald leaf on the next available vine node
  const sproutOneLeaf = useCallback(() => {
    soundFX.playLeafSprout()
    setLeaves((prev) => {
      const healed = prev.map((l) =>
        l.status === 'attached' || l.status === 'dying'
          ? {
              ...l,
              status: 'attached' as const,
              health: Math.min(1, l.health + 0.35),
              hasBlossom: true,
            }
          : l
      )

      const attached = healed.filter((l) => l.status === 'attached')
      if (attached.length >= vineSegments.length) return healed

      const occupiedIndices = new Set(attached.map((l) => l.segmentIndex))
      let targetSegIdx = 0
      for (let i = 0; i < vineSegments.length; i++) {
        if (!occupiedIndices.has(i)) {
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

      const nextCount = attached.length + 1
      setVineGrowthProgress(Math.min(1, Math.max(0.25, (nextCount + 0.5) / vineSegments.length)))

      return [...healed, newLeaf]
    })

    setStats((s) => ({ ...s, leavesGrown: s.leavesGrown + 1 }))
  }, [vineSegments])

  // Trigger a Violation (ONLY from: 1. Face Away on Camera >=3s, or 2. Blocked Standalone New Tab!)
  const triggerDistraction = useCallback(
    (
      reason: string,
      category: 'face_away' | 'blocked_new_tab',
      customQuotes?: string[]
    ) => {
      if (
        pomodoro.enabled &&
        (pomodoro.phase === 'break' || pomodoro.phase === 'awaiting_next_session')
      ) {
        return
      }

      lastDistractionMsRef.current = Date.now()
      setCurrentRedReason(reason)
      setDaysSinceDoomscroll(0)
      leafAccumulatorSecRef.current = 0
      setNextLeafProgress(0)

      recordViolationInCurrentSession(category, reason)

      // ALWAYS get angry & turn the studio RED on every single violation (even if all leaves have already fallen!)
      const nextStates: RoommateState[] = [
        'glaring_with_clipboard',
        'sweeping_leaves',
        'shivering',
      ]
      const chosenState = customQuotes
        ? 'glaring_with_clipboard'
        : nextStates[Math.floor(Math.random() * nextStates.length)]

      const attachedNow = leaves.filter(
        (l) => l.status === 'attached' || l.status === 'dying'
      )
      if (attachedNow.length === 2) {
        soundFX.playThunderClimax()
        setFocusMode('last_leaf_climax')
        setRoommateState('dramatic_sickbed')
        const quote = pickRandomDialogue('dramatic_sickbed', attachedNow[0]?.id || 1)
        setDialogueText(`${reason} — ${quote}`)
      } else {
        soundFX.playClipboardPenalty()
        setFocusMode('distracted')
        setRoommateState(chosenState)
        const quote = customQuotes
          ? customQuotes[Math.floor(Math.random() * customQuotes.length)]
          : pickRandomDialogue(chosenState, attachedNow[0]?.id || 1)
        setDialogueText(`${reason} — ${quote}`)
      }

      setLeaves((prevLeaves) => {
        const attached = prevLeaves.filter(
          (l) => l.status === 'attached' || l.status === 'dying'
        )
        if (attached.length === 0) return prevLeaves

        const sorted = [...attached].sort((a, b) => b.segmentIndex - a.segmentIndex)
        const victim = sorted[0]
        const seg = vineSegments[Math.min(victim.segmentIndex, vineSegments.length - 1)]

        return prevLeaves.map((leaf) => {
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
      })

      setStats((prev) => ({
        ...prev,
        tabSwitches: category === 'blocked_new_tab' ? prev.tabSwitches + 1 : prev.tabSwitches,
        phoneAlerts: category === 'face_away' ? prev.phoneAlerts + 1 : prev.phoneAlerts,
        unbrokenFocusSeconds: 0,
        comebackProgressSeconds: 0,
        leavesLost: prev.leavesLost + 1,
        roomTempCelsius: Math.max(7, prev.roomTempCelsius - 3.5),
      }))
    },
    [leaves, vineSegments, pomodoro.enabled, pomodoro.phase, recordViolationInCurrentSession]
  )

  // Listen to Chrome Extension events (compatible with both v1.0 and v1.3 of the extension!) + Vite WS bridge
  const allowedChromeTabIdsRef = useRef<Set<string>>(new Set())
  const gameChromeTabIdRef = useRef<number | null>(null)
  const hasSnapshottedInitialTabsRef = useRef<boolean>(false)

  useEffect(() => {
    let lastHandledBlockCount = 0

    const handleBlockedTabEvent = (reason?: string) => {
      if (Date.now() - lastDistractionMsRef.current < 250) return
      triggerDistraction(
        reason || 'Blocked opening a standalone New Tab / Window (+ / Cmd+T / Cmd+N)',
        'blocked_new_tab'
      )
    }

    const isBlankNewTab = (url?: string, title?: string) => {
      const u = (url || '').trim().toLowerCase()
      const t = (title || '').trim().toLowerCase()
      return (
        !u ||
        u.startsWith('chrome://newtab') ||
        u.startsWith('chrome-extension://') ||
        u.startsWith('edge://newtab') ||
        u === 'about:blank' ||
        t === 'new tab'
      )
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data) return
      const data = event.data

      if (data.type === 'LEAF_EXTENSION_READY') {
        setExtensionConnected(true)
      }

      if (data.type === 'LEAF_CHROME_GUARD_STATUS') {
        setExtensionConnected(true)
        if (typeof data.allowedCount === 'number') {
          setAllowedTabsCount(data.allowedCount)
        }
      }

      // v1.0 / v1.1 / v1.2 sync message
      if (data.type === 'LEAF_CHROME_TABS_SYNC' && Array.isArray(data.tabs)) {
        setExtensionConnected(true)
        const tabs = data.tabs as Array<{
          chromeTabId: number
          title: string
          url: string
          openerTabId: number | null
        }>

        const gameTab = tabs.find(
          (t) =>
            t.url &&
            (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
        )
        if (gameTab && gameTab.chromeTabId) {
          gameChromeTabIdRef.current = gameTab.chromeTabId
        }

        if (!hasSnapshottedInitialTabsRef.current && tabs.length > 0) {
          hasSnapshottedInitialTabsRef.current = true
          tabs.forEach((t) => {
            if (t.chromeTabId && !isBlankNewTab(t.url, t.title)) {
              allowedChromeTabIdsRef.current.add(String(t.chromeTabId))
            }
          })
          setAllowedTabsCount(allowedChromeTabIdsRef.current.size || tabs.length)
        } else if (hasSnapshottedInitialTabsRef.current) {
          // Check if any new tab appeared in the sync list
          for (const t of tabs) {
            const idStr = String(t.chromeTabId)
            if (allowedChromeTabIdsRef.current.has(idStr)) continue

            const openedFromAllowed =
              t.openerTabId &&
              allowedChromeTabIdsRef.current.has(String(t.openerTabId))

            if (openedFromAllowed && !isBlankNewTab(t.url, t.title)) {
              allowedChromeTabIdsRef.current.add(idStr)
              setAllowedTabsCount(allowedChromeTabIdsRef.current.size)
            } else if (isBlankNewTab(t.url, t.title) || !openedFromAllowed) {
              allowedChromeTabIdsRef.current.add(idStr)
              handleBlockedTabEvent(
                'Blocked opening a standalone New Tab (+ / Cmd+T)'
              )
            }
          }
        }
      }

      // v1.0 / v1.1 tab created message
      if (data.type === 'LEAF_CHROME_TAB_CREATED' && data.tab) {
        const newTab = data.tab as {
          chromeTabId: number
          title: string
          url: string
          openerTabId: number | null
        }
        const idStr = String(newTab.chromeTabId)
        const openedFromAllowed =
          newTab.openerTabId &&
          allowedChromeTabIdsRef.current.has(String(newTab.openerTabId))

        if (openedFromAllowed && !isBlankNewTab(newTab.url, newTab.title)) {
          allowedChromeTabIdsRef.current.add(idStr)
          setAllowedTabsCount(allowedChromeTabIdsRef.current.size)
        } else {
          allowedChromeTabIdsRef.current.add(idStr)
          handleBlockedTabEvent(
            'Blocked opening a standalone New Tab (+ / Cmd+T)'
          )
        }
      }

      // v1.0 tab activated message
      if (data.type === 'LEAF_CHROME_TAB_ACTIVATED' && data.tab) {
        const actTab = data.tab as {
          chromeTabId: number
          title: string
          url: string
          openerTabId: number | null
        }
        if (isBlankNewTab(actTab.url, actTab.title)) {
          handleBlockedTabEvent(
            'Blocked opening a standalone New Tab (+ / Cmd+T)'
          )
        }
      }

      if (data.type === 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED') {
        handleBlockedTabEvent(data.reason)
      }
    }

    if (import.meta.hot) {
      import.meta.hot.on(
        'leaf-new-tab-blocked',
        (data: { count?: number; reason?: string }) => {
          if (data?.count && data.count > lastHandledBlockCount) {
            lastHandledBlockCount = data.count
            handleBlockedTabEvent(data.reason)
          }
        }
      )
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [triggerDistraction])

  // Block Cmd+T / Ctrl+T shortcut while on the game page
  // NOTE: Switching between or closing your existing tabs (visibilitychange) is 100% ALLOWED and NEVER triggers red!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N')
      ) {
        e.preventDefault()
        const isNewWin = e.key === 'n' || e.key === 'N'
        triggerDistraction(
          isNewWin
            ? 'Blocked opening a New Browser Window (Cmd+N)!'
            : 'Blocked opening a standalone New Tab (Cmd+T)!',
          'blocked_new_tab'
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [triggerDistraction])

  const handlePhoneDetected = useCallback(() => {
    triggerDistraction(
      'Face outside of camera screen',
      'face_away',
      PHONE_DETECTED_QUOTES
    )
  }, [triggerDistraction])

  const handleAwayDetected = useCallback(() => {
    triggerDistraction(
      'Face outside of camera screen',
      'face_away',
      AWAY_DETECTED_QUOTES
    )
  }, [triggerDistraction])

  // Whenever your face is visible on screen, clear the RED banner after 3s of a tab alert or immediately after returning to camera!
  const handleCameraBackFocused = useCallback(() => {
    if (Date.now() - lastDistractionMsRef.current < 3000) return
    if (focusMode === 'distracted' || focusMode === 'last_leaf_climax' || currentRedReason) {
      setCurrentRedReason(null)
      setFocusMode('locked_in')
      setRoommateState('typing')
      setDialogueText('On screen & focused! Sunlight is back—watch the ivy climb.')
    }
  }, [focusMode, currentRedReason])

  // Falling leaf physics loop
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
          return {
            ...leaf,
            x: nx,
            y: ny,
            rotation: nRot,
            swayPhase: nextSway,
            health: Math.max(0.08, leaf.health - 0.015),
          }
        })
        return changed ? next : prev
      })
    }, 32)
    return () => clearInterval(interval)
  }, [])

  const targetSecondsPerLeaf = useMemo(() => {
    if (pomodoro.enabled) {
      return Math.max(
        20,
        Math.round((pomodoro.focusMinutes * 60) / Math.max(1, pomodoro.leavesPerCycle))
      )
    }
    return 180
  }, [pomodoro.enabled, pomodoro.focusMinutes, pomodoro.leavesPerCycle])

  const handleStartPomodoroSession = useCallback(() => {
    soundFX.playPomodoroBell()
    setCurrentRedReason(null)
    setFocusMode('locked_in')
    setRoommateState('typing')
    setDialogueText(`Pomodoro Session started (${pomodoro.focusMinutes}m)! Timer locked.`)
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: true,
      remainingSeconds: prev.focusMinutes * 60,
    }))
  }, [pomodoro.focusMinutes])

  const handleStopPomodoroSession = useCallback(() => {
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0)
    setCurrentRedReason(null)
    setDialogueText('Pomodoro stopped. You can now switch or select your Pomodoro timers.')
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: false,
      remainingSeconds: prev.focusMinutes * 60,
    }))
  }, [])

  const handleStartNextSession = useCallback(() => {
    soundFX.playPomodoroBell()
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0.05)
    setCurrentRedReason(null)
    setFocusMode('locked_in')
    setRoommateState('typing')
    const nextSessionNum = sessionsLog.length + 1
    setSessionsLog((prev) => [
      {
        sessionNumber: nextSessionNum,
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        totalViolations: 0,
        faceAwayCount: 0,
        blockedNewTabCount: 0,
        events: [],
      },
      ...prev,
    ])
    setDialogueText(`Starting Pomodoro Session #${nextSessionNum}! Timer locked.`)
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: true,
      remainingSeconds: prev.focusMinutes * 60,
    }))
    setActivePanel(null)
  }, [sessionsLog.length])

  // Main 1-second Focus, Pomodoro Break, & Stop-After-Break Loop
  useEffect(() => {
    const timer = setInterval(() => {
      const delta = stats.speedMultiplier

      if (
        pomodoro.enabled &&
        (!pomodoro.isRunning || pomodoro.phase === 'awaiting_next_session')
      ) {
        return
      }

      if (pomodoro.enabled) {
        setPomodoro((prev) => {
          const nextRem = prev.remainingSeconds - delta
          if (nextRem <= 0) {
            if (prev.phase === 'focus') {
              soundFX.playGoldenFanfare()
              sproutOneLeaf()
              setDialogueText(
                `Focus complete! Enjoy your ${prev.breakMinutes}m break—game will stop automatically when break ends.`
              )
              return {
                ...prev,
                phase: 'break',
                remainingSeconds: prev.breakMinutes * 60,
                completedCycles: prev.completedCycles + 1,
              }
            } else if (prev.phase === 'break') {
              soundFX.playPomodoroBell()
              setDialogueText(
                'Pomodoro break complete! Game stopped—you can now switch timers or start your next session.'
              )
              return {
                ...prev,
                phase: 'awaiting_next_session',
                isRunning: false,
                remainingSeconds: 0,
              }
            }
          }
          return { ...prev, remainingSeconds: nextRem }
        })
      }

      if (pomodoro.enabled && pomodoro.phase !== 'focus') return

      const isCameraFocused =
        !webcamEnabled ||
        cameraStatus === 'focused' ||
        cameraStatus === 'initializing' ||
        cameraStatus === 'permission_denied'

      if (!isCameraFocused) return

      if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
        leafAccumulatorSecRef.current += delta
        const ratio = leafAccumulatorSecRef.current / targetSecondsPerLeaf

        if (ratio >= 1) {
          leafAccumulatorSecRef.current = 0
          setNextLeafProgress(0.02)
          sproutOneLeaf()
        } else {
          setNextLeafProgress(ratio)
        }

        setLeaves((prev) =>
          prev.map((l) =>
            l.status === 'attached' && l.health < 1
              ? { ...l, health: Math.min(1, l.health + 0.03) }
              : l
          )
        )
      }

      setStats((prev) => {
        if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
          return {
            ...prev,
            focusSeconds: prev.focusSeconds + delta,
            unbrokenFocusSeconds: prev.unbrokenFocusSeconds + delta,
            roomTempCelsius: Math.min(24, prev.roomTempCelsius + 0.3 * delta),
          }
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [
    focusMode,
    webcamEnabled,
    cameraStatus,
    stats.speedMultiplier,
    pomodoro.enabled,
    pomodoro.isRunning,
    pomodoro.phase,
    targetSecondsPerLeaf,
    sproutOneLeaf,
  ])

  // Unlock cozy studio upgrades automatically
  useEffect(() => {
    const focusMinutes = Math.floor(stats.focusSeconds / 60)
    setUpgrades((prev) => {
      let newlyUnlocked: RoomUpgrade | null = null
      const updated = prev.map((u) => {
        if (!u.unlocked && focusMinutes >= u.unlockMinutes) {
          newlyUnlocked = u
          return { ...u, unlocked: true }
        }
        return u
      })
      if (newlyUnlocked) {
        soundFX.playLeafSprout()
      }
      return newlyUnlocked ? updated : prev
    })
  }, [stats.focusSeconds])

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const attachedLeavesCount = leaves.filter(
    (l) => l.status === 'attached' || l.status === 'dying'
  ).length
  const fallenLeavesCount = leaves.filter(
    (l) => l.status === 'falling' || l.status === 'fallen'
  ).length
  const comebackProgress = Math.min(1, stats.comebackProgressSeconds / 300)
  const unlockedUpgradesCount = upgrades.filter((u) => u.unlocked).length
  const currentSession = sessionsLog[0]

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden select-none transition-colors duration-300 ${
        isRoughWeather
          ? 'bg-rose-950 text-stone-100 ring-8 ring-inset ring-rose-500/80'
          : 'bg-stone-950 text-stone-100'
      }`}
    >
      {/* SINGLE MINIMAL TOP BAR */}
      <header
        className={`flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 transition-colors ${
          isRoughWeather
            ? 'border-rose-500/60 bg-rose-950/90'
            : 'border-stone-800/80 bg-stone-950'
        }`}
      >
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
              isRoughWeather
                ? 'border-rose-400 bg-rose-500/20 text-rose-300 animate-pulse'
                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
            }`}
          >
            <Leaf className="h-4 w-4" />
          </div>
          <span className="font-serif text-base font-bold tracking-tight text-stone-100">
            Leaf Me Alone
          </span>
        </div>

        {/* Center: Minimal Pomodoro Pill + Start / Stop Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => togglePanel('pomodoro')}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1 font-mono text-xs font-bold transition ${
              activePanel === 'pomodoro'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                : pomodoro.enabled
                ? pomodoro.phase === 'awaiting_next_session'
                  ? 'border-emerald-400 bg-emerald-950/80 text-emerald-200 animate-pulse'
                  : pomodoro.phase === 'break'
                  ? 'border-amber-500/40 bg-amber-950/50 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
                : 'border-stone-800 bg-stone-900 text-stone-400'
            }`}
          >
            {pomodoro.phase === 'break' ? (
              <Coffee className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Timer className="h-3.5 w-3.5" />
            )}
            <span>
              {!pomodoro.enabled
                ? 'Free Focus'
                : pomodoro.phase === 'awaiting_next_session'
                ? 'Break Done · Start Next'
                : `${pomodoro.phase === 'focus' ? 'Focus' : 'Break'} ${formatTimer(
                    pomodoro.remainingSeconds
                  )}`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {pomodoro.enabled && pomodoro.phase !== 'awaiting_next_session' && (
            <button
              onClick={
                pomodoro.isRunning ? handleStopPomodoroSession : handleStartPomodoroSession
              }
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-xs font-bold text-white transition ${
                pomodoro.isRunning
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {pomodoro.isRunning ? (
                <>
                  <Square className="h-3 w-3" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  <span>Start</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: Clean Controls (Tabs, Violations Log, Room & Skins, Sound, Polaroid) */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            onClick={() => togglePanel('tabs')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              activePanel === 'tabs'
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Tabs</span>
          </button>

          {/* Session Violations & Log Button */}
          <button
            onClick={() => togglePanel('log')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              activePanel === 'log'
                ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                : currentSession.totalViolations > 0
                ? 'border-rose-500/40 bg-rose-950/50 text-rose-300 hover:bg-rose-900/50'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
            title="Session Violation Log & Metrics"
          >
            <ClipboardList className="h-3.5 w-3.5 text-rose-400" />
            <span>Violations ({currentSession.totalViolations})</span>
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

          {/* Mood Music & Storm Audio Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              soundFX.setEnabled(next)
              if (!next) {
                nukeAllActiveAudio()
              }
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

          {/* Export Polaroid */}
          <button
            onClick={() => setIsPolaroidOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-500"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Polaroid</span>
          </button>
        </div>
      </header>

      {/* FULL-SCREEN STUDIO STAGE */}
      <main className="relative flex flex-1 min-h-0 w-full items-center justify-center p-3 overflow-hidden">
        {/* LIVE RED REASON BANNER (Shows exact reason why it is RED + violation count!) */}
        {isRoughWeather && currentRedReason && (
          <div className="
            absolute top-5 left-1/2 -translate-x-1/2 z-30
            flex items-center gap-2.5 rounded-xl border-2 border-rose-400
            bg-rose-950/95 px-4 py-2 font-mono text-xs font-bold text-rose-100 shadow-2xl
          ">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 animate-bounce" />
            <span>WHY RED: {currentRedReason}</span>
            <button
              onClick={() => setActivePanel('log')}
              className="ml-2 rounded-lg bg-rose-800/80 px-2 py-0.5 text-[10px] text-rose-100 hover:bg-rose-700"
            >
              View Log ({currentSession.totalViolations})
            </button>
          </div>
        )}

        <div
          className={`h-full w-full max-w-5xl rounded-2xl transition-all ${
            isRoughWeather ? 'ring-4 ring-rose-500 shadow-2xl shadow-rose-950' : ''
          }`}
        >
          <StudioCanvas
            focusMode={focusMode}
            roommateState={roommateState}
            skinId={skinId}
            isRoughWeather={isRoughWeather}
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

        {/* CENTER OVERLAY WHEN POMODORO BREAK ENDS -> GAME STOPS UNTIL NEXT SESSION */}
        {pomodoro.enabled && pomodoro.phase === 'awaiting_next_session' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-emerald-500/40 bg-stone-900/95 p-6 text-center shadow-2xl">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-xl font-bold text-stone-100">
                Pomodoro &amp; Break Complete
              </h2>
              <p className="font-mono text-xs text-stone-400">
                Session #{currentSession.sessionNumber} had{' '}
                <strong>{currentSession.totalViolations} violations</strong>. You can change your Pomodoro timers or start the next session now!
              </p>
              <button
                onClick={handleStartNextSession}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-mono text-xs font-extrabold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500"
              >
                <Play className="h-4 w-4" />
                Start Next Pomodoro ({pomodoro.focusMinutes}m)
              </button>
            </div>
          </div>
        )}

        {/* ALWAYS-MOUNTED LIVE WEBCAM GUARD */}
        <div className="absolute bottom-4 left-4 z-20">
          <WebcamGuard
            enabled={webcamEnabled}
            onToggleEnabled={() => setWebcamEnabled((v) => !v)}
            status={cameraStatus}
            onStatusChange={setCameraStatus}
            onPhoneDetected={handlePhoneDetected}
            onAwayDetected={handleAwayDetected}
            onBackFocused={handleCameraBackFocused}
          />
        </div>

        {/* MINIMAL POPOVER PANELS (Top-Right over Studio) */}
        {activePanel && (
          <div className="absolute top-3 right-4 z-30 w-full max-w-xs rounded-2xl border border-stone-700/90 bg-stone-900/95 p-3.5 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between border-b border-stone-800 pb-1.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                {activePanel === 'pomodoro' && 'Pomodoro & Break'}
                {activePanel === 'tabs' && 'Browser Tab Protection'}
                {activePanel === 'log' && 'Session Violation Log'}
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
                onUpdateConfig={(partial) => {
                  setPomodoro((prev) => ({ ...prev, ...partial }))
                }}
                onStartSession={handleStartPomodoroSession}
                onStopSession={handleStopPomodoroSession}
                onStartNextSession={handleStartNextSession}
              />
            )}

            {activePanel === 'tabs' && (
              <AllowedTabsManager
                extensionConnected={extensionConnected}
                allowedTabsCount={allowedTabsCount}
              />
            )}

            {activePanel === 'log' && (
              <div className="flex flex-col gap-2.5 font-mono text-xs max-h-80 overflow-y-auto pr-0.5">
                {/* Simple 3-Metric Summary for Current Session */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
                    <div className="text-base font-extrabold text-rose-400">
                      {currentSession.totalViolations}
                    </div>
                    <div className="text-[9px] text-stone-400">Total Red</div>
                  </div>
                  <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
                    <div className="text-base font-extrabold text-amber-400">
                      {currentSession.faceAwayCount}
                    </div>
                    <div className="text-[9px] text-stone-400">Face Away</div>
                  </div>
                  <div className="rounded-lg border border-stone-800 bg-stone-950 p-2">
                    <div className="text-base font-extrabold text-rose-300">
                      {currentSession.blockedNewTabCount}
                    </div>
                    <div className="text-[9px] text-stone-400">New Tab</div>
                  </div>
                </div>

                {/* Per-Session Violation Log */}
                {sessionsLog.map((sess) => (
                  <div
                    key={sess.sessionNumber}
                    className="rounded-xl border border-stone-800 bg-stone-950 p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between border-b border-stone-800 pb-1 text-[10px]">
                      <span className="font-bold text-emerald-400">
                        Session #{sess.sessionNumber} ({sess.startedAt})
                      </span>
                      <span className="font-bold text-rose-400">
                        {sess.totalViolations} violations
                      </span>
                    </div>

                    {sess.events.length === 0 ? (
                      <div className="py-1.5 text-center text-[10px] text-stone-500">
                        0 violations — clean focus session!
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {sess.events.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-start justify-between gap-2 rounded bg-stone-900/90 px-2 py-1 text-[10px]"
                          >
                            <span className="text-rose-200">{ev.message}</span>
                            <span className="shrink-0 text-[9px] text-stone-500">
                              {ev.timestamp}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'upgrades' && (
              <div className="space-y-3 font-mono text-xs max-h-80 overflow-y-auto pr-0.5">
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
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.previewColor }}
                          />
                          <div className="truncate">
                            <div className="text-[11px] font-bold">{s.name}</div>
                            <div className="truncate text-[9px] text-stone-500">
                              {s.subtitle}
                            </div>
                          </div>
                        </div>
                        {skinId === s.id && (
                          <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        )}
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
                      onClick={() => {
                        soundFX.playLeafSprout()
                        setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))
                      }}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9.5px] font-bold text-amber-300"
                    >
                      Unlock All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {upgrades.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => {
                          setUpgrades((prev) =>
                            prev.map((item) =>
                              item.id === u.id ? { ...item, unlocked: !item.unlocked } : item
                            )
                          )
                        }}
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

      {/* Shareable Polaroid / Specimen Card Modal */}
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
