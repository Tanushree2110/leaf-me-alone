import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CloudRain,
  Coffee,
  FastForward,
  Layers,
  Leaf,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSnowflake,
  Timer,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react'
import {
  ActivityLogItem,
  AllowedTab,
  CameraStatus,
  FocusMode,
  LeafNode,
  RoommateState,
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
import { soundFX } from './utils/sound'
import { StudioCanvas } from './components/StudioCanvas'
import { PolaroidModal } from './components/PolaroidModal'
import { WebcamGuard } from './components/WebcamGuard'
import { AllowedTabsManager } from './components/AllowedTabsManager'
import { PomodoroConfig, PomodoroPanel } from './components/PomodoroPanel'

type ExpandablePanel = 'pomodoro' | 'tabs' | 'upgrades' | 'log' | 'demo' | null

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

const STORAGE_KEY_TABS = 'leaf_me_alone_chrome_tabs_v2'

function loadSavedChromeTabs(): AllowedTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TABS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [
    {
      id: 'tab-current',
      title: 'Leaf Me Alone (Chrome)',
      url: typeof window !== 'undefined' ? window.location.href : 'http://localhost:5173',
    },
  ]
}

export function App() {
  const studioCanvasRef = useRef<HTMLCanvasElement>(null)
  const vineSegments = useMemo(() => generateProceduralVineSegments(), [])

  const [focusMode, setFocusMode] = useState<FocusMode>('locked_in')
  const [roommateState, setRoommateState] = useState<RoommateState>('typing')
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.38)
  const [nextLeafProgress, setNextLeafProgress] = useState<number>(0.1)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>(
    'Headphones on. Deep work mode engaged—watch the ivy climb!'
  )

  // Sound & Cozy Lo-Fi Rain state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true)
  const [ambientRainOn, setAmbientRainOn] = useState<boolean>(false)

  // Opt-In Customizable Pomodoro State (with Break -> Stop Until Next Session)
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>({
    enabled: true,
    isRunning: true,
    phase: 'focus',
    focusMinutes: 25,
    breakMinutes: 5,
    leavesPerCycle: 5,
    remainingSeconds: 25 * 60,
    completedCycles: 0,
  })
  const leafAccumulatorSecRef = useRef<number>(0)

  // Minimal Popovers (all closed by default; webcam collapsed into sleek pill by default)
  const [activePanel, setActivePanel] = useState<ExpandablePanel>(null)
  const [isPolaroidOpen, setIsPolaroidOpen] = useState<boolean>(false)
  const [isWebcamExpanded, setIsWebcamExpanded] = useState<boolean>(false)

  // Webcam Guard State
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('initializing')

  // Chrome Tabs State (no fake Cursor/Docs placeholders!)
  const [allowedTabs, setAllowedTabs] = useState<AllowedTab[]>(() => loadSavedChromeTabs())
  const [isWhitelistLocked, setIsWhitelistLocked] = useState<boolean>(false)
  const [activeAllowedTabId, setActiveAllowedTabId] = useState<string | null>('tab-current')
  const [extensionConnected, setExtensionConnected] = useState<boolean>(false)

  // Save allowed tabs to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(allowedTabs))
    } catch {}
  }, [allowedTabs])

  const recentTabSwitchTimestampsRef = useRef<number[]>([])

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

  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      type: 'focus',
      message: 'Session started in Chrome.',
    },
  ])

  const appendLog = useCallback(
    (type: ActivityLogItem['type'], message: string, quote?: string) => {
      const item: ActivityLogItem = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        type,
        message,
        quote,
      }
      setActivityLog((prev) => [item, ...prev.slice(0, 20)])
    },
    []
  )

  const togglePanel = (panel: ExpandablePanel) => {
    soundFX.playSoftClick()
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

  // Trigger a distraction event
  const triggerDistraction = useCallback(
    (
      reason = 'Unapproved tab switch',
      customQuotes?: string[],
      logType: ActivityLogItem['type'] = 'distraction'
    ) => {
      // Never penalize during Pomodoro Break or when game is stopped between sessions!
      if (
        pomodoro.enabled &&
        (pomodoro.phase === 'break' ||
          pomodoro.phase === 'awaiting_next_session' ||
          !pomodoro.isRunning)
      ) {
        return
      }

      setDaysSinceDoomscroll(0)
      leafAccumulatorSecRef.current = 0
      setNextLeafProgress(0)

      setLeaves((prevLeaves) => {
        const attached = prevLeaves.filter((l) => l.status === 'attached' || l.status === 'dying')
        if (attached.length === 0) return prevLeaves

        const sorted = [...attached].sort((a, b) => b.segmentIndex - a.segmentIndex)
        const victim = sorted[0]
        const seg = vineSegments[Math.min(victim.segmentIndex, vineSegments.length - 1)]
        const remainingAfterDrop = attached.length - 1

        const updated = prevLeaves.map((leaf) => {
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

        if (remainingAfterDrop === 1) {
          soundFX.playThunderClimax()
          setFocusMode('last_leaf_climax')
          setRoommateState('dramatic_sickbed')
          const quote = pickRandomDialogue('dramatic_sickbed', victim.id)
          setDialogueText(quote)
          appendLog('climax', `Last Leaf Climax! Only 1 leaf left.`, quote)
        } else {
          soundFX.playClipboardPenalty()
          setFocusMode('distracted')
          const nextStates: RoommateState[] = [
            'glaring_with_clipboard',
            'sweeping_leaves',
            'shivering',
          ]
          const chosenState = customQuotes
            ? 'glaring_with_clipboard'
            : nextStates[Math.floor(Math.random() * nextStates.length)]
          setRoommateState(chosenState)
          const quote = customQuotes
            ? customQuotes[Math.floor(Math.random() * customQuotes.length)].replace(
                '#3',
                `#${victim.id}`
              )
            : pickRandomDialogue(chosenState, victim.id)
          setDialogueText(quote)
          appendLog(logType, `${reason} — Leaf #${victim.id} dropped.`, quote)
        }

        return updated
      })

      setStats((prev) => ({
        ...prev,
        tabSwitches: logType === 'distraction' ? prev.tabSwitches + 1 : prev.tabSwitches,
        phoneAlerts: logType === 'camera' ? prev.phoneAlerts + 1 : prev.phoneAlerts,
        unbrokenFocusSeconds: 0,
        comebackProgressSeconds: 0,
        leavesLost: prev.leavesLost + 1,
        roomTempCelsius: Math.max(7, prev.roomTempCelsius - 3.5),
      }))
    },
    [appendLog, vineSegments, pomodoro.enabled, pomodoro.phase, pomodoro.isRunning]
  )

  // Listen for Chrome Extension messages if loaded in Chrome
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data) return
      const data = event.data

      if (data.type === 'LEAF_EXTENSION_READY') {
        setExtensionConnected(true)
      }

      if (data.type === 'LEAF_CHROME_TABS_SYNC' && Array.isArray(data.tabs)) {
        setExtensionConnected(true)
        if (!isWhitelistLocked) {
          const synced: AllowedTab[] = data.tabs.map(
            (t: { chromeTabId: number; title: string; url: string; active: boolean }) => ({
              id: `chrome-${t.chromeTabId}`,
              chromeTabId: t.chromeTabId,
              title: t.title,
              url: t.url,
              isActive: t.active,
            })
          )
          if (synced.length > 0) {
            setAllowedTabs(synced)
          }
        }
      }

      if (data.type === 'LEAF_CHROME_TAB_CREATED' && data.tab && isWhitelistLocked) {
        const newTab = data.tab
        // Check if opened from an allowed parent tab (openerTabId)
        setAllowedTabs((prev) => {
          const parent = prev.find(
            (p) => p.chromeTabId && p.chromeTabId === newTab.openerTabId
          )
          if (parent) {
            const sub: AllowedTab = {
              id: `chrome-${newTab.chromeTabId}`,
              chromeTabId: newTab.chromeTabId,
              title: newTab.title || 'Sub-tab',
              url: newTab.url || '',
              parentId: parent.id,
            }
            return [...prev, sub]
          } else {
            triggerDistraction(`Opened unapproved new Chrome tab "${newTab.title}"`)
            return prev
          }
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isWhitelistLocked, triggerDistraction])

  const handleRequestExtensionSync = () => {
    soundFX.playSoftClick()
    window.postMessage({ type: 'LEAF_APP_REQUEST_SYNC' }, '*')
  }

  const handleSwitchToAllowedTab = (tab: AllowedTab, openNewWindow = false) => {
    soundFX.playSoftClick()
    setActiveAllowedTabId(tab.id)
    setStats((prev) => ({
      ...prev,
      authorizedTabSwitches: prev.authorizedTabSwitches + 1,
    }))

    if (tab.chromeTabId && extensionConnected) {
      window.postMessage(
        { type: 'LEAF_APP_ACTIVATE_TAB', chromeTabId: tab.chromeTabId },
        '*'
      )
      return
    }

    if (openNewWindow && tab.url && tab.url.startsWith('http')) {
      window.open(tab.url, '_blank', 'noopener,noreferrer')
    }
  }

  // Existing tabs are SAFE to switch between; only rapid doomscroll tab-hopping (4+ in 15s) penalizes
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        const now = Date.now()
        const recent = recentTabSwitchTimestampsRef.current.filter((t) => now - t < 15000)
        recent.push(now)
        recentTabSwitchTimestampsRef.current = recent

        if (recent.length >= 4) {
          recentTabSwitchTimestampsRef.current = []
          triggerDistraction('Rapid Tab-Hopping (4+ switches in 15s)')
        } else {
          setStats((prev) => ({
            ...prev,
            authorizedTabSwitches: prev.authorizedTabSwitches + 1,
          }))
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [triggerDistraction])

  const handlePhoneDetected = useCallback(() => {
    triggerDistraction('Webcam: Phone glance detected!', PHONE_DETECTED_QUOTES, 'camera')
  }, [triggerDistraction])

  const handleAwayDetected = useCallback(() => {
    triggerDistraction('Webcam: Stepped away from desk!', AWAY_DETECTED_QUOTES, 'camera')
  }, [triggerDistraction])

  const handleCameraBackFocused = useCallback(() => {
    if (focusMode === 'distracted') {
      setFocusMode('locked_in')
      setRoommateState('typing')
      setDialogueText('Eyes back on screen! Resuming deep work.')
    }
  }, [focusMode])

  const handleAddInitialTab = (title: string, url: string, openInChrome = false) => {
    if (isWhitelistLocked) return
    soundFX.playSoftClick()
    const newTab: AllowedTab = { id: `tab-${Date.now()}`, title, url }
    setAllowedTabs((prev) => [...prev, newTab])
    setActiveAllowedTabId(newTab.id)
    if (openInChrome && url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleRemoveInitialTab = (id: string) => {
    if (isWhitelistLocked) return
    setAllowedTabs((prev) => prev.filter((t) => t.id !== id && t.parentId !== id))
  }

  const handleExpandSubTab = (parentId: string, title: string, url: string) => {
    soundFX.playSoftClick()
    const subTab: AllowedTab = {
      id: `sub-${Date.now()}`,
      title,
      url,
      parentId,
    }
    setAllowedTabs((prev) => [...prev, subTab])
    setActiveAllowedTabId(subTab.id)
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

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

  // Start the next Pomodoro session after a Break has finished and stopped the game
  const handleStartNextSession = useCallback(() => {
    soundFX.playPomodoroBell()
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0.05)
    setFocusMode('locked_in')
    setRoommateState('typing')
    setDialogueText(
      `Starting Pomodoro Session #${pomodoro.completedCycles + 1}! Headphones on—let's grow!`
    )
    setPomodoro((prev) => ({
      ...prev,
      phase: 'focus',
      isRunning: true,
      remainingSeconds: prev.focusMinutes * 60,
    }))
    setActivePanel(null)
  }, [pomodoro.completedCycles])

  // Main 1-second Focus, Pomodoro Break, & Stop-After-Break Loop
  useEffect(() => {
    const timer = setInterval(() => {
      const delta = stats.speedMultiplier

      // If Pomodoro is enabled and either paused OR stopped awaiting next session, do nothing!
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
              // Focus block finished -> Start Pomodoro Break
              soundFX.playGoldenFanfare()
              sproutOneLeaf()
              setDialogueText(
                `Focus complete! Enjoy your ${prev.breakMinutes}m break—game will stop automatically when break ends.`
              )
              appendLog('focus', `Focus complete! Started ${prev.breakMinutes}m Break.`)
              return {
                ...prev,
                phase: 'break',
                remainingSeconds: prev.breakMinutes * 60,
                completedCycles: prev.completedCycles + 1,
              }
            } else if (prev.phase === 'break') {
              // Break finished -> STOP GAME UNTIL NEXT POMODORO SESSION BEGINS!
              soundFX.playPomodoroBell()
              setDialogueText(
                'Pomodoro break complete! Game is paused until you start your next Pomodoro session.'
              )
              appendLog(
                'focus',
                'Break finished. Game stopped awaiting next Pomodoro session.'
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

      // During break, pause leaf growth & penalties
      if (pomodoro.enabled && pomodoro.phase !== 'focus') return

      const isCameraFocusedOrTyping =
        !webcamEnabled ||
        cameraStatus === 'focused' ||
        cameraStatus === 'keyboard_glance' ||
        cameraStatus === 'initializing' ||
        cameraStatus === 'permission_denied'

      if (!isCameraFocusedOrTyping) return

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

        if (focusMode === 'last_leaf_climax') {
          const nextComeback = prev.comebackProgressSeconds + delta
          if (nextComeback >= 300) {
            soundFX.playGoldenFanfare()
            setFocusMode('golden_comeback')
            setRoommateState('painting_golden_leaf')
            sproutOneLeaf()
            const quote = pickRandomDialogue('painting_golden_leaf')
            setDialogueText(quote)
            appendLog('redemption', 'Painted a permanent Golden Leaf on the brick wall!')
            return {
              ...prev,
              focusSeconds: prev.focusSeconds + delta,
              unbrokenFocusSeconds: prev.unbrokenFocusSeconds + delta,
              comebackProgressSeconds: 300,
              goldenLeavesPainted: prev.goldenLeavesPainted + 1,
              roomTempCelsius: 23,
            }
          }
          return {
            ...prev,
            comebackProgressSeconds: nextComeback,
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
    appendLog,
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
        const upg = newlyUnlocked as RoomUpgrade
        soundFX.playLeafSprout()
        appendLog('upgrade', `Unlocked ${upg.name}!`)
      }
      return newlyUnlocked ? updated : prev
    })
  }, [stats.focusSeconds, appendLog])

  const handleLockInAndSprout = () => {
    setFocusMode('locked_in')
    setRoommateState('typing')
    setDialogueText(pickRandomDialogue('typing'))
    sproutOneLeaf()
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0.1)
  }

  const handleTriggerLastLeafClimax = () => {
    soundFX.playThunderClimax()
    setFocusMode('last_leaf_climax')
    setRoommateState('dramatic_sickbed')
    setDialogueText(pickRandomDialogue('dramatic_sickbed'))
    setDaysSinceDoomscroll(0)

    setLeaves((prev) => {
      let keptOne = false
      return prev.map((leaf, idx) => {
        if (!keptOne && (leaf.status === 'attached' || idx === 0)) {
          keptOne = true
          return { ...leaf, status: 'attached' as const, health: 0.45, segmentIndex: 2 }
        }
        if (leaf.status === 'attached') {
          const seg = vineSegments[Math.min(leaf.segmentIndex, vineSegments.length - 1)]
          return {
            ...leaf,
            status: 'falling' as const,
            health: 0.1,
            x: seg.x1,
            y: seg.y1,
            vx: 1.2 + Math.random(),
            vy: 1.8,
            vRot: 0.06,
          }
        }
        return leaf
      })
    })

    setStats((prev) => ({ ...prev, comebackProgressSeconds: 45, roomTempCelsius: 8 }))
  }

  const handleTriggerGoldenLeafTwist = () => {
    soundFX.playGoldenFanfare()
    setFocusMode('golden_comeback')
    setRoommateState('painting_golden_leaf')
    sproutOneLeaf()
    setDialogueText(pickRandomDialogue('painting_golden_leaf'))
    setStats((prev) => ({
      ...prev,
      comebackProgressSeconds: 300,
      goldenLeavesPainted: prev.goldenLeavesPainted + 1,
      roomTempCelsius: 23,
    }))
  }

  const handleSweepFloor = () => {
    soundFX.playSoftClick()
    setRoommateState('sweeping_leaves')
    setDialogueText(pickRandomDialogue('sweeping_leaves'))
    setTimeout(() => {
      setLeaves((prev) => prev.filter((l) => l.status !== 'fallen'))
    }, 900)
  }

  const handleResetSession = () => {
    soundFX.playSoftClick()
    setFocusMode('locked_in')
    setRoommateState('typing')
    setLeaves(createInitialLeaves(vineSegments))
    setVineGrowthProgress(0.38)
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0.1)
    setDaysSinceDoomscroll(4)
    setDialogueText(pickRandomDialogue('typing'))
  }

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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stone-950 text-stone-100 select-none">
      {/* SINGLE MINIMAL TOP BAR */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stone-800/80 bg-stone-950 px-4">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
            <Leaf className="h-4 w-4" />
          </div>
          <span className="font-serif text-base font-bold tracking-tight text-stone-100">
            Leaf Me Alone
          </span>
        </div>

        {/* Center: Minimal Pomodoro Pill */}
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
              onClick={() => {
                soundFX.playSoftClick()
                setPomodoro((p) => ({ ...p, isRunning: !p.isRunning }))
              }}
              className="rounded-lg border border-stone-800 bg-stone-900 p-1.5 text-stone-300 hover:bg-stone-800"
              title={pomodoro.isRunning ? 'Pause' : 'Start'}
            >
              {pomodoro.isRunning ? (
                <Pause className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Play className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>
          )}
        </div>

        {/* Right: Clean Icon/Label Controls */}
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
            <span>Tabs ({allowedTabs.length})</span>
          </button>

          <button
            onClick={() => togglePanel('upgrades')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              activePanel === 'upgrades'
                ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Room ({unlockedUpgradesCount}/5)</span>
          </button>

          {/* Clear "Rain" Label on the Lo-Fi Rain Ambient Button */}
          <button
            onClick={() => {
              if (!soundEnabled) {
                setSoundEnabled(true)
                soundFX.setEnabled(true)
              }
              const playing = soundFX.toggleAmbientRain()
              setAmbientRainOn(playing)
            }}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              ambientRainOn
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
            title="Cozy Lo-Fi Rain Ambient Sound"
          >
            <CloudRain className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden md:inline">Rain</span>
          </button>

          {/* Sound Effects Mute/Unmute */}
          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              soundFX.setEnabled(next)
              if (next) soundFX.playSoftClick()
              else setAmbientRainOn(false)
            }}
            className={`rounded-lg border p-1.5 transition ${
              soundEnabled
                ? 'border-stone-800 bg-stone-900 text-emerald-400 hover:bg-stone-800'
                : 'border-stone-800 bg-stone-900 text-stone-500'
            }`}
            title={soundEnabled ? 'Sound Effects: ON' : 'Muted'}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          {/* Demo / Story Preview */}
          <button
            onClick={() => togglePanel('demo')}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold transition ${
              activePanel === 'demo'
                ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
            title="Test Story Moments & Speed"
          >
            <Wand2 className="h-3.5 w-3.5 text-purple-400" />
          </button>

          {/* Export Polaroid */}
          <button
            onClick={() => {
              soundFX.playSoftClick()
              setIsPolaroidOpen(true)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-500"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Polaroid</span>
          </button>
        </div>
      </header>

      {/* FULL-SCREEN STUDIO STAGE */}
      <main className="relative flex flex-1 min-h-0 w-full items-center justify-center p-3 overflow-hidden">
        <div className="h-full w-full max-w-5xl">
          <StudioCanvas
            focusMode={focusMode}
            roommateState={roommateState}
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
                The game is paused between sessions. Ready to lock back in for Session #
                {pomodoro.completedCycles + 1}?
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

        {/* ALWAYS-MOUNTED LIVE WEBCAM GUARD (Bottom-Left Corner) */}
        <div className="absolute bottom-4 left-4 z-20">
          <WebcamGuard
            enabled={webcamEnabled}
            onToggleEnabled={() => setWebcamEnabled((v) => !v)}
            status={cameraStatus}
            onStatusChange={setCameraStatus}
            onPhoneDetected={handlePhoneDetected}
            onAwayDetected={handleAwayDetected}
            onBackFocused={handleCameraBackFocused}
            isExpanded={isWebcamExpanded}
            onToggleExpanded={() => setIsWebcamExpanded((v) => !v)}
          />
        </div>

        {/* MINIMAL POPOVER PANELS (Top-Right over Studio) */}
        {activePanel && (
          <div className="absolute top-3 right-4 z-30 w-full max-w-xs rounded-2xl border border-stone-700/90 bg-stone-900/95 p-3.5 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between border-b border-stone-800 pb-1.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                {activePanel === 'pomodoro' && 'Pomodoro & Break'}
                {activePanel === 'tabs' && 'Allowed Chrome Tabs'}
                {activePanel === 'upgrades' && 'Room Upgrades'}
                {activePanel === 'demo' && 'Story Simulator'}
                {activePanel === 'log' && 'Clipboard Log'}
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
                  soundFX.playSoftClick()
                  setPomodoro((prev) => ({ ...prev, ...partial }))
                }}
                onStartPause={() => {
                  soundFX.playPomodoroBell()
                  setPomodoro((prev) => ({ ...prev, isRunning: !prev.isRunning }))
                }}
                onStartNextSession={handleStartNextSession}
                onResetCycle={() => {
                  soundFX.playSoftClick()
                  leafAccumulatorSecRef.current = 0
                  setNextLeafProgress(0)
                  setPomodoro((prev) => ({
                    ...prev,
                    phase: 'focus',
                    isRunning: true,
                    remainingSeconds: prev.focusMinutes * 60,
                  }))
                }}
                onSkipPhase={() => {
                  soundFX.playPomodoroBell()
                  setPomodoro((prev) => {
                    if (prev.phase === 'focus') {
                      return {
                        ...prev,
                        phase: 'break',
                        remainingSeconds: prev.breakMinutes * 60,
                        completedCycles: prev.completedCycles + 1,
                      }
                    }
                    // Skipping/finishing break stops the game until next session!
                    return {
                      ...prev,
                      phase: 'awaiting_next_session',
                      isRunning: false,
                      remainingSeconds: 0,
                    }
                  })
                }}
              />
            )}

            {activePanel === 'tabs' && (
              <AllowedTabsManager
                allowedTabs={allowedTabs}
                isWhitelistLocked={isWhitelistLocked}
                activeAllowedTabId={activeAllowedTabId}
                extensionConnected={extensionConnected}
                onRequestExtensionSync={handleRequestExtensionSync}
                onLockWhitelist={() => {
                  soundFX.playSoftClick()
                  setIsWhitelistLocked(true)
                }}
                onUnlockWhitelistReset={() => setIsWhitelistLocked(false)}
                onAddInitialTab={handleAddInitialTab}
                onRemoveInitialTab={handleRemoveInitialTab}
                onExpandSubTab={handleExpandSubTab}
                onSwitchToAllowedTab={handleSwitchToAllowedTab}
              />
            )}

            {activePanel === 'upgrades' && (
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-end pb-1">
                  <button
                    onClick={() => {
                      soundFX.playLeafSprout()
                      setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))
                    }}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    Unlock All
                  </button>
                </div>
                {upgrades.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      soundFX.playSoftClick()
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
            )}

            {activePanel === 'demo' && (
              <div className="space-y-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={handleLockInAndSprout}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/50 p-2 text-[11px] font-bold text-emerald-300"
                  >
                    <Sun className="h-3.5 w-3.5" /> +1 Leaf
                  </button>
                  <button
                    onClick={() => triggerDistraction('Simulated Distraction')}
                    className="flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-950/50 p-2 text-[11px] font-bold text-orange-300"
                  >
                    <ThermometerSnowflake className="h-3.5 w-3.5" /> Drop Leaf
                  </button>
                  <button
                    onClick={handleTriggerLastLeafClimax}
                    className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/50 p-2 text-[11px] font-bold text-rose-300"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> Last Leaf
                  </button>
                  <button
                    onClick={handleTriggerGoldenLeafTwist}
                    className="flex items-center gap-1 rounded-lg border border-yellow-500/40 bg-yellow-950/50 p-2 text-[11px] font-bold text-yellow-300"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Gold Leaf
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-stone-800 pt-2">
                  <button
                    onClick={() =>
                      setStats((s) => ({
                        ...s,
                        speedMultiplier: s.speedMultiplier === 1 ? 15 : 1,
                      }))
                    }
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${
                      stats.speedMultiplier > 1
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-stone-700 bg-stone-800 text-stone-300'
                    }`}
                  >
                    <FastForward className="h-3 w-3" /> {stats.speedMultiplier}x Speed
                  </button>

                  {fallenLeavesCount > 0 && (
                    <button
                      onClick={handleSweepFloor}
                      className="rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-[10px] text-stone-200"
                    >
                      Sweep ({fallenLeavesCount})
                    </button>
                  )}

                  <button
                    onClick={handleResetSession}
                    className="flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-[10px] text-stone-200"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                </div>
              </div>
            )}

            {activePanel === 'log' && (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 font-mono text-[10.5px]">
                {activityLog.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-stone-800 bg-stone-950 p-2 text-stone-300"
                  >
                    <span className="text-stone-500">{item.timestamp} · </span>
                    {item.message}
                  </div>
                ))}
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
