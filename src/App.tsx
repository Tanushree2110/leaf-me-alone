import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Award,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CloudRain,
  Coffee,
  FastForward,
  GitBranch,
  Layers,
  Leaf,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
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

const INITIAL_ALLOWED_TABS: AllowedTab[] = [
  { id: 'tab-1', title: 'IDE / Localhost', url: 'http://localhost:5173' },
  { id: 'tab-2', title: 'Docs & Reference', url: 'https://react.dev' },
  { id: 'tab-3', title: 'Design / Sprint Spec', url: 'https://figma.com' },
]

export function App() {
  const studioCanvasRef = useRef<HTMLCanvasElement>(null)
  const vineSegments = useMemo(() => generateProceduralVineSegments(), [])

  const [focusMode, setFocusMode] = useState<FocusMode>('locked_in')
  const [roommateState, setRoommateState] = useState<RoommateState>('typing')
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.38)
  const [nextLeafProgress, setNextLeafProgress] = useState<number>(0.12)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>(
    'Headphones on. Your existing tabs are whitelisted & safe—plant growth is synced to your focus timer!'
  )

  // Sound & Ambient Rain state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true)
  const [ambientRainOn, setAmbientRainOn] = useState<boolean>(false)

  // Opt-In Customizable Pomodoro State
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>({
    enabled: true, // Opt-in active by default so leaf growth is paced to Pomodoro
    isRunning: true,
    phase: 'focus',
    focusMinutes: 25,
    breakMinutes: 5,
    leavesPerCycle: 5,
    remainingSeconds: 25 * 60,
    completedCycles: 0,
  })
  const leafAccumulatorSecRef = useRef<number>(0)

  // Expandable UI Drawers & Modals
  const [activePanel, setActivePanel] = useState<ExpandablePanel>(null)
  const [isPolaroidOpen, setIsPolaroidOpen] = useState<boolean>(false)
  const [isWebcamExpanded, setIsWebcamExpanded] = useState<boolean>(true)

  // Webcam Guard State
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('initializing')

  // Allowed Tabs Whitelist State
  const [allowedTabs, setAllowedTabs] = useState<AllowedTab[]>(INITIAL_ALLOWED_TABS)
  const [isWhitelistLocked, setIsWhitelistLocked] = useState<boolean>(false)
  const [activeAllowedTabId, setActiveAllowedTabId] = useState<string | null>('tab-1')
  const [extensionConnected] = useState<boolean>(false)

  // Track recent browser tab switches so single switches to existing tabs are SAFE,
  // and only rapid doomscroll tab-hopping (4+ switches within 15 seconds) counts as a violation
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
    currentTask: 'Deep Work Sprint',
    speedMultiplier: 1,
  })

  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      type: 'focus',
      message: 'Session started. Existing tabs are safe to switch between; vine synced to Pomodoro.',
      quote: 'Chlorophyll levels optimal. Approved workspace tabs only.',
    },
  ])

  const appendLog = useCallback(
    (type: ActivityLogItem['type'], message: string, quote?: string) => {
      const item: ActivityLogItem = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        type,
        message,
        quote,
      }
      setActivityLog((prev) => [item, ...prev.slice(0, 24)])
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
      if (attached.length >= vineSegments.length) {
        return healed
      }

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
      reason = 'Opened an unapproved tab',
      customQuotes?: string[],
      logType: ActivityLogItem['type'] = 'distraction'
    ) => {
      // If currently on a Pomodoro Break, never penalize!
      if (pomodoro.enabled && pomodoro.phase === 'break') return

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
          appendLog(
            'climax',
            `THE LAST LEAF CLIMAX! Only 1 trembling leaf remains after Leaf #${victim.id} fell!`,
            quote
          )
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
          appendLog(
            logType,
            `${reason} — Leaf #${victim.id} withered and detached onto the floor.`,
            quote
          )
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
    [appendLog, vineSegments, pomodoro.enabled, pomodoro.phase]
  )

  // Select an Allowed Whitelisted Tab (does not open duplicate window unless openNewWindow=true)
  const handleSwitchToAllowedTab = (tab: AllowedTab, openNewWindow = false) => {
    soundFX.playSoftClick()
    setActiveAllowedTabId(tab.id)
    setStats((prev) => ({
      ...prev,
      authorizedTabSwitches: prev.authorizedTabSwitches + 1,
    }))

    const quote = `Working on whitelisted tab "${tab.title}". Approved—your vine keeps growing!`
    setDialogueText(quote)
    appendLog(
      'tab_whitelist',
      `Active allowed tab: "${tab.title}"${tab.parentId ? ' (Expanded Sub-Tab)' : ''}`,
      quote
    )

    if (openNewWindow && tab.url && tab.url.startsWith('http')) {
      window.open(tab.url, '_blank', 'noopener,noreferrer')
    }
  }

  // Real browser `visibilitychange` listener:
  // Normal switching to your existing open browser tabs is SAFE & ALLOWED!
  // Only rapid doomscroll tab-hopping (4+ tab switches within 15 seconds) triggers a violation.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        const now = Date.now()
        const recent = recentTabSwitchTimestampsRef.current.filter((t) => now - t < 15000)
        recent.push(now)
        recentTabSwitchTimestampsRef.current = recent

        if (recent.length >= 4) {
          recentTabSwitchTimestampsRef.current = []
          triggerDistraction(
            'Rapid Tab-Hopping Detected (4+ switches in 15s — Doomscroll cadence!)'
          )
        } else {
          // Normal switch to an existing allowed tab: completely safe!
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
    triggerDistraction(
      'Webcam Guard: Stared down at phone (>6.5s below horizon)!',
      PHONE_DETECTED_QUOTES,
      'camera'
    )
  }, [triggerDistraction])

  const handleAwayDetected = useCallback(() => {
    triggerDistraction(
      'Webcam Guard: Drifted away from desk frame!',
      AWAY_DETECTED_QUOTES,
      'camera'
    )
  }, [triggerDistraction])

  const handleCameraBackFocused = useCallback(() => {
    if (focusMode === 'distracted') {
      setFocusMode('locked_in')
      setRoommateState('typing')
      setDialogueText('Eyes back on screen! Putting the clipboard away and regrowing the vine.')
    }
  }, [focusMode])

  const handleAddInitialTab = (title: string, url: string) => {
    if (isWhitelistLocked) return
    soundFX.playSoftClick()
    setAllowedTabs((prev) => [...prev, { id: `tab-${Date.now()}`, title, url }])
  }

  const handleRemoveInitialTab = (id: string) => {
    if (isWhitelistLocked) return
    setAllowedTabs((prev) => prev.filter((t) => t.id !== id && t.parentId !== id))
  }

  const handleExpandSubTab = (parentId: string, title: string, url: string) => {
    soundFX.playSoftClick()
    const parent = allowedTabs.find((t) => t.id === parentId)
    const subTab: AllowedTab = {
      id: `sub-${Date.now()}`,
      title,
      url,
      parentId,
    }
    setAllowedTabs((prev) => [...prev, subTab])
    setActiveAllowedTabId(subTab.id)
    appendLog(
      'tab_whitelist',
      `Expanded sub-tab "${title}" from allowed tab "${parent?.title ?? 'Root'}".`,
      `"Branching "${title}" from "${parent?.title}"—approved under workspace tree."`
    )
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

  // How many seconds of focus are needed to sprout 1 new leaf:
  // - If Pomodoro Sync is ON: (focusMinutes * 60) / leavesPerCycle (e.g., 25m / 5 leaves = 300s = 5 mins per leaf)
  // - If Pomodoro Sync is OFF (Free Focus): 180s (3 mins per leaf)
  const targetSecondsPerLeaf = useMemo(() => {
    if (pomodoro.enabled) {
      return Math.max(20, Math.round((pomodoro.focusMinutes * 60) / Math.max(1, pomodoro.leavesPerCycle)))
    }
    return 180
  }, [pomodoro.enabled, pomodoro.focusMinutes, pomodoro.leavesPerCycle])

  // Main 1-second Focus, Pomodoro Sync & O. Henry Redemption Loop
  useEffect(() => {
    const timer = setInterval(() => {
      const delta = stats.speedMultiplier

      // If Pomodoro is enabled and paused, pause progression
      if (pomodoro.enabled && !pomodoro.isRunning) return

      // Handle Pomodoro countdown if enabled
      if (pomodoro.enabled) {
        setPomodoro((prev) => {
          const nextRem = prev.remainingSeconds - delta
          if (nextRem <= 0) {
            if (prev.phase === 'focus') {
              // Completed a full Pomodoro Focus Block!
              soundFX.playGoldenFanfare()
              sproutOneLeaf()
              setDialogueText(
                `Pomodoro #${prev.completedCycles + 1} complete! Vine is thriving—enjoy your ${prev.breakMinutes}m break!`
              )
              appendLog(
                'focus',
                `Completed ${prev.focusMinutes}m Pomodoro Focus Block! Starting ${prev.breakMinutes}m Break.`
              )
              return {
                ...prev,
                phase: 'break',
                remainingSeconds: prev.breakMinutes * 60,
                completedCycles: prev.completedCycles + 1,
              }
            } else {
              // Break finished -> back to Focus
              soundFX.playPomodoroBell()
              setDialogueText('Break complete! Headphones back on—starting next Pomodoro focus block.')
              return {
                ...prev,
                phase: 'focus',
                remainingSeconds: prev.focusMinutes * 60,
              }
            }
          }
          return { ...prev, remainingSeconds: nextRem }
        })
      }

      // Check camera focus state
      const isCameraFocusedOrTyping =
        !webcamEnabled ||
        cameraStatus === 'focused' ||
        cameraStatus === 'keyboard_glance' ||
        cameraStatus === 'initializing' ||
        cameraStatus === 'permission_denied'

      if (!isCameraFocusedOrTyping) return

      // Advance Leaf Growth synced to Pomodoro (or Free Focus cadence)
      if (
        (focusMode === 'locked_in' || focusMode === 'golden_comeback') &&
        (!pomodoro.enabled || pomodoro.phase === 'focus')
      ) {
        leafAccumulatorSecRef.current += delta
        const ratio = leafAccumulatorSecRef.current / targetSecondsPerLeaf

        if (ratio >= 1) {
          leafAccumulatorSecRef.current = 0
          setNextLeafProgress(0.02)
          sproutOneLeaf()
        } else {
          setNextLeafProgress(ratio)
        }

        // Gradually heal any slightly wilted leaves
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
            appendLog(
              'redemption',
              'THE O. HENRY TWIST! Locked in for 5 straight minutes — Roommate painted a permanent Golden Leaf on the brick wall!',
              quote
            )
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

  // Unlock cozy studio upgrades automatically as focus time grows
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
        appendLog(
          'upgrade',
          `Cozy Studio Upgrade Unlocked (${upg.unlockMinutes}m focus): ${upg.name}!`,
          `"${upg.description}"`
        )
      }
      return newlyUnlocked ? updated : prev
    })
  }, [stats.focusSeconds, appendLog])

  const handleLockInAndSprout = () => {
    setFocusMode('locked_in')
    setRoommateState('typing')
    const quote = pickRandomDialogue('typing')
    setDialogueText(quote)
    sproutOneLeaf()
    leafAccumulatorSecRef.current = 0
    setNextLeafProgress(0.1)

    setStats((prev) => ({
      ...prev,
      focusSeconds: prev.focusSeconds + 180,
      unbrokenFocusSeconds: prev.unbrokenFocusSeconds + 180,
      roomTempCelsius: Math.min(24, prev.roomTempCelsius + 3),
    }))

    appendLog('focus', 'Sprouted a new emerald leaf & boosted studio sunlight!', quote)
  }

  const handleTriggerLastLeafClimax = () => {
    soundFX.playThunderClimax()
    setFocusMode('last_leaf_climax')
    setRoommateState('dramatic_sickbed')
    const quote = pickRandomDialogue('dramatic_sickbed')
    setDialogueText(quote)
    setDaysSinceDoomscroll(0)

    setLeaves((prev) => {
      let keptOne = false
      return prev.map((leaf, idx) => {
        if (!keptOne && (leaf.status === 'attached' || idx === 0)) {
          keptOne = true
          return {
            ...leaf,
            status: 'attached' as const,
            health: 0.45,
            segmentIndex: 2,
          }
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

    setStats((prev) => ({
      ...prev,
      comebackProgressSeconds: 45,
      roomTempCelsius: 8,
    }))

    appendLog(
      'climax',
      'Entered "The Last Leaf" Climax: Thunderstorm hit the window! Only 1 trembling leaf remains.',
      quote
    )
  }

  const handleTriggerGoldenLeafTwist = () => {
    soundFX.playGoldenFanfare()
    setFocusMode('golden_comeback')
    setRoommateState('painting_golden_leaf')
    sproutOneLeaf()
    const quote = pickRandomDialogue('painting_golden_leaf')
    setDialogueText(quote)

    setStats((prev) => ({
      ...prev,
      comebackProgressSeconds: 300,
      goldenLeavesPainted: prev.goldenLeavesPainted + 1,
      roomTempCelsius: 23,
    }))

    appendLog(
      'redemption',
      'THE O. HENRY TWIST! Roommate painted a permanent Golden Leaf on the brick wall!',
      quote
    )
  }

  const handleSweepFloor = () => {
    soundFX.playSoftClick()
    setRoommateState('sweeping_leaves')
    const quote = pickRandomDialogue('sweeping_leaves')
    setDialogueText(quote)
    setTimeout(() => {
      setLeaves((prev) => prev.filter((l) => l.status !== 'fallen'))
    }, 900)
    appendLog('distraction', 'Roommate swept up the crispy dead leaves from the floor.', quote)
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
    setStats({
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
      currentTask: stats.currentTask,
      speedMultiplier: 1,
    })
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
      {/* 1. CLEAN, BEAUTIFUL TOP NAVIGATION BAR */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-stone-800/80 bg-stone-950/95 px-4 py-2">
        {/* Left: Brand & Current Focus Task */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-inner">
            <Leaf className="h-4 w-4" />
          </div>
          <div className="shrink-0">
            <h1 className="font-serif text-base font-bold leading-none tracking-tight text-stone-100">
              Leaf Me Alone
            </h1>
            <span className="font-mono text-[9.5px] text-stone-400">
              Cozy Focus Roommate
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-900/90 px-2.5 py-1">
            <span className="font-mono text-[10px] font-bold uppercase text-emerald-400">
              Task:
            </span>
            <input
              type="text"
              value={stats.currentTask}
              onChange={(e) => setStats((s) => ({ ...s, currentTask: e.target.value }))}
              className="w-36 bg-transparent font-mono text-xs text-stone-100 focus:outline-none"
              placeholder="Current focus task..."
            />
          </div>
        </div>

        {/* Center: Opt-In Customizable Pomodoro Pill */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => togglePanel('pomodoro')}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold transition ${
              activePanel === 'pomodoro'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                : pomodoro.enabled
                ? pomodoro.phase === 'focus'
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/50'
                  : 'border-amber-500/40 bg-amber-950/50 text-amber-300 hover:bg-amber-900/50'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200'
            }`}
            title="Click to customize Opt-In Pomodoro Timer & Leaf Growth Cadence"
          >
            <Timer className="h-3.5 w-3.5" />
            {pomodoro.enabled ? (
              <>
                <span>
                  {pomodoro.phase === 'focus' ? 'Focus' : 'Break'}:{' '}
                  {formatTimer(pomodoro.remainingSeconds)}
                </span>
                <span className="hidden md:inline rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-emerald-300/90">
                  {pomodoro.leavesPerCycle}🌱/{pomodoro.focusMinutes}m
                </span>
              </>
            ) : (
              <span>Pomodoro: Off (Free Focus)</span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {pomodoro.enabled && (
            <button
              onClick={() => {
                soundFX.playSoftClick()
                setPomodoro((p) => ({ ...p, isRunning: !p.isRunning }))
              }}
              className="rounded-xl border border-stone-800 bg-stone-900 p-1.5 text-stone-300 hover:bg-stone-800 hover:text-white"
              title={pomodoro.isRunning ? 'Pause Pomodoro' : 'Resume Pomodoro'}
            >
              {pomodoro.isRunning ? (
                <Pause className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Play className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>
          )}
        </div>

        {/* Right: Clean Expandable Menus + SoundFX + Polaroid */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => togglePanel('tabs')}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-xs font-semibold transition ${
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
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-xs font-semibold transition ${
              activePanel === 'upgrades'
                ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Room ({unlockedUpgradesCount}/5)</span>
          </button>

          <button
            onClick={() => togglePanel('log')}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-xs font-semibold transition ${
              activePanel === 'log'
                ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
            title="Roommate's Clipboard Log"
          >
            <ClipboardList className="h-3.5 w-3.5 text-rose-400" />
          </button>

          {/* SoundFX Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              soundFX.setEnabled(next)
              if (next) soundFX.playSoftClick()
              else setAmbientRainOn(false)
            }}
            className={`rounded-xl border p-1.5 transition ${
              soundEnabled
                ? 'border-stone-800 bg-stone-900 text-emerald-400 hover:bg-stone-800'
                : 'border-stone-800 bg-stone-900 text-stone-500 hover:text-stone-300'
            }`}
            title={soundEnabled ? 'Sound Effects: ON' : 'Sound Effects: Muted'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Cozy Lo-Fi Rain Ambient Sound Toggle */}
          <button
            onClick={() => {
              if (!soundEnabled) {
                setSoundEnabled(true)
                soundFX.setEnabled(true)
              }
              const playing = soundFX.toggleAmbientRain()
              setAmbientRainOn(playing)
            }}
            className={`rounded-xl border p-1.5 transition ${
              ambientRainOn
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:bg-stone-800'
            }`}
            title="Toggle Cozy Lo-Fi Rain Sound"
          >
            <CloudRain className="h-4 w-4" />
          </button>

          {/* Export Polaroid Card */}
          <button
            onClick={() => {
              soundFX.playSoftClick()
              setIsPolaroidOpen(true)
            }}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-md shadow-emerald-950/50 hover:bg-emerald-500"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Polaroid</span>
          </button>
        </div>
      </header>

      {/* 2. SIMPLE, CLEAR ALLOWED TABS BAR */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-stone-800/70 bg-stone-900/50 px-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold text-stone-400 shrink-0">
            {isWhitelistLocked ? (
              <>
                <Lock className="h-3 w-3 text-amber-400" /> Whitelisted Tabs:
              </>
            ) : (
              'Initial Allowed Tabs:'
            )}
          </span>

          {allowedTabs.map((tab) => {
            const isSelected = activeAllowedTabId === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleSwitchToAllowedTab(tab, false)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-0.5 font-mono text-[11px] font-medium transition shrink-0 ${
                  isSelected
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                    : 'border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700'
                }`}
              >
                {tab.parentId && <GitBranch className="h-2.5 w-2.5 text-teal-400" />}
                <span>{tab.title}</span>
                {isSelected && <Check className="h-2.5 w-2.5 text-emerald-400" />}
              </button>
            )
          })}

          <button
            onClick={() => togglePanel('tabs')}
            className="flex items-center gap-1 rounded-lg border border-dashed border-stone-700 px-2 py-0.5 font-mono text-[10.5px] text-stone-400 hover:border-emerald-500/50 hover:text-emerald-300 shrink-0"
          >
            <Plus className="h-2.5 w-2.5" />
            {isWhitelistLocked ? 'Expand Sub-Tab' : 'Add / Lock Initial Tabs'}
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 shrink-0 font-mono text-[10.5px] text-stone-400">
          <span className="text-emerald-400/90">
            ✓ Existing tabs safe ({stats.authorizedTabSwitches} switches)
          </span>
          <span>·</span>
          <span className="text-rose-400/90">
            Violations: {stats.tabSwitches + stats.phoneAlerts}
          </span>
          {stats.goldenLeavesPainted > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-300 font-bold">
                🏆 {stats.goldenLeavesPainted} Gold
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3. MAIN CENTER STUDIO STAGE (Zero scroll, clean & spacious) */}
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

        {/* FLOATING LIVE WEBCAM GUARD (Bottom-Left Corner) */}
        <div className="absolute bottom-4 left-4 z-20 max-w-xs">
          {isWebcamExpanded ? (
            <div className="relative shadow-2xl">
              <button
                onClick={() => setIsWebcamExpanded(false)}
                className="absolute -top-2 -right-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-stone-700 bg-stone-900 text-stone-400 hover:text-white"
                title="Minimize Webcam HUD to pill"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <WebcamGuard
                enabled={webcamEnabled}
                onToggleEnabled={() => setWebcamEnabled((v) => !v)}
                status={cameraStatus}
                onStatusChange={setCameraStatus}
                onPhoneDetected={handlePhoneDetected}
                onAwayDetected={handleAwayDetected}
                onBackFocused={handleCameraBackFocused}
                compact
              />
            </div>
          ) : (
            <button
              onClick={() => setIsWebcamExpanded(true)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold shadow-xl backdrop-blur-md transition ${
                cameraStatus === 'phone_detected'
                  ? 'border-rose-500 bg-rose-950/90 text-rose-200 animate-pulse'
                  : cameraStatus === 'away_detected'
                  ? 'border-amber-500 bg-amber-950/90 text-amber-200 animate-pulse'
                  : cameraStatus === 'keyboard_glance'
                  ? 'border-sky-500 bg-sky-950/90 text-sky-200'
                  : 'border-stone-700 bg-stone-900/90 text-emerald-300'
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              <span>
                Cam:{' '}
                {cameraStatus === 'phone_detected'
                  ? 'PHONE DETECTED!'
                  : cameraStatus === 'away_detected'
                  ? 'AWAY!'
                  : cameraStatus === 'keyboard_glance'
                  ? 'TYPING (SAFE)'
                  : webcamEnabled
                  ? 'FOCUSED'
                  : 'OFF'}
              </span>
              <ChevronUp className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* EXPANDABLE OVERLAY POP-OVER PANELS (Top-Right over Studio) */}
        {activePanel && (
          <div className="absolute top-3 right-4 z-30 w-full max-w-md rounded-2xl border border-stone-700/90 bg-stone-900/95 p-3.5 shadow-2xl backdrop-blur-md">
            <div className="mb-2.5 flex items-center justify-between border-b border-stone-800 pb-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                {activePanel === 'pomodoro' && 'Opt-In Pomodoro & Leaf Pacing'}
                {activePanel === 'tabs' && 'Allowed Tabs Whitelist & Sub-Tab Tree'}
                {activePanel === 'upgrades' && 'Cozy Studio Upgrades (5)'}
                {activePanel === 'log' && "Roommate's Clipboard Review Log"}
                {activePanel === 'demo' && 'Story Simulator & Character States'}
              </span>
              <button
                onClick={() => setActivePanel(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-4 w-4" />
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
                onResetCycle={() => {
                  soundFX.playSoftClick()
                  leafAccumulatorSecRef.current = 0
                  setNextLeafProgress(0)
                  setPomodoro((prev) => ({
                    ...prev,
                    remainingSeconds:
                      (prev.phase === 'focus' ? prev.focusMinutes : prev.breakMinutes) * 60,
                  }))
                }}
                onSkipPhase={() => {
                  soundFX.playPomodoroBell()
                  setPomodoro((prev) => {
                    const nextPhase = prev.phase === 'focus' ? 'break' : 'focus'
                    return {
                      ...prev,
                      phase: nextPhase,
                      remainingSeconds:
                        (nextPhase === 'focus' ? prev.focusMinutes : prev.breakMinutes) * 60,
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
                onLockWhitelist={() => {
                  soundFX.playSoftClick()
                  setIsWhitelistLocked(true)
                  appendLog(
                    'tab_whitelist',
                    `Locked initial whitelist with ${allowedTabs.length} root tabs. Only sub-tab expansions allowed now!`
                  )
                }}
                onUnlockWhitelistReset={() => setIsWhitelistLocked(false)}
                onAddInitialTab={handleAddInitialTab}
                onRemoveInitialTab={handleRemoveInitialTab}
                onExpandSubTab={handleExpandSubTab}
                onSwitchToAllowedTab={handleSwitchToAllowedTab}
                onTriggerUnauthorizedTab={(title) =>
                  triggerDistraction(
                    `Tried opening unapproved new tab "${title || 'Unwhitelisted Tab'}" while whitelist was locked!`
                  )
                }
              />
            )}

            {activePanel === 'upgrades' && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                <div className="flex items-center justify-between pb-1">
                  <span className="font-mono text-[10.5px] text-stone-400">
                    Unlocks automatically with focus time (or click to preview):
                  </span>
                  <button
                    onClick={() => {
                      soundFX.playLeafSprout()
                      setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))
                    }}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300"
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
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-2 transition ${
                      u.unlocked
                        ? 'border-emerald-500/40 bg-emerald-950/30 text-stone-100'
                        : 'border-stone-800 bg-stone-950/60 text-stone-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {u.unlocked ? '✓' : `${u.unlockMinutes}m`}
                      </span>
                      <div>
                        <div className="font-mono text-[11px] font-bold">{u.name}</div>
                        <div className="font-mono text-[9.5px] text-stone-400">
                          {u.description}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[9.5px] uppercase">
                      {u.unlocked ? 'On' : 'Locked'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'log' && (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1 font-mono text-xs">
                {activityLog.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-stone-800 bg-stone-950 p-2"
                  >
                    <div className="flex items-center justify-between text-[9.5px] text-stone-500">
                      <span className="font-bold uppercase text-emerald-400">
                        {item.type}
                      </span>
                      <span>{item.timestamp}</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-stone-200">{item.message}</p>
                    {item.quote && (
                      <p className="mt-0.5 italic text-[10px] text-stone-400">
                        {item.quote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'demo' && (
              <div className="space-y-3 font-mono text-xs">
                <p className="text-[10.5px] text-stone-400">
                  Preview any of the 4 dramatic acts or 6 roommate animations immediately:
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={handleLockInAndSprout}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/50 p-2 font-bold text-emerald-300 hover:bg-emerald-900/60"
                  >
                    <Sun className="h-3.5 w-3.5" /> 1. Sprout Leaf
                  </button>
                  <button
                    onClick={() =>
                      triggerDistraction('Simulated Unapproved Tab Outside Whitelist')
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-950/50 p-2 font-bold text-orange-300 hover:bg-orange-900/60"
                  >
                    <ThermometerSnowflake className="h-3.5 w-3.5" /> 2. Drop Leaf
                  </button>
                  <button
                    onClick={handleTriggerLastLeafClimax}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 p-2 font-bold text-rose-300 hover:bg-rose-900/60"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> 3. Last Leaf Storm
                  </button>
                  <button
                    onClick={handleTriggerGoldenLeafTwist}
                    className="flex items-center gap-1.5 rounded-lg border border-yellow-500/40 bg-yellow-950/50 p-2 font-bold text-yellow-300 hover:bg-yellow-900/60"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> 4. Golden Leaf Twist
                  </button>
                </div>

                <div className="border-t border-stone-800 pt-2">
                  <span className="block text-[10px] text-stone-400 mb-1.5">
                    6 Character States:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        'typing',
                        'glaring_with_clipboard',
                        'sweeping_leaves',
                        'shivering',
                        'dramatic_sickbed',
                        'painting_golden_leaf',
                      ] as RoommateState[]
                    ).map((st) => (
                      <button
                        key={st}
                        onClick={() => {
                          soundFX.playSoftClick()
                          setRoommateState(st)
                          setDialogueText(pickRandomDialogue(st))
                          if (st === 'dramatic_sickbed') setFocusMode('last_leaf_climax')
                          else if (st === 'painting_golden_leaf') setFocusMode('golden_comeback')
                          else if (st === 'typing') setFocusMode('locked_in')
                          else setFocusMode('distracted')
                        }}
                        className={`rounded-lg border px-2 py-1 text-left text-[10px] font-semibold transition ${
                          roommateState === st
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                            : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-stone-800 pt-2">
                  <button
                    onClick={handleSweepFloor}
                    className="rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1 text-[10.5px] text-stone-200 hover:bg-stone-700"
                  >
                    Sweep Floor ({fallenLeavesCount})
                  </button>
                  <button
                    onClick={handleResetSession}
                    className="flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1 text-[10.5px] text-stone-200 hover:bg-stone-700"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset Studio
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. SIMPLE, SELF-EXPLANATORY FOOTER STATUS BAR */}
      <footer className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-stone-800/80 bg-stone-950 px-4 font-mono text-xs">
        <div className="flex items-center gap-3 min-w-0 truncate">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold shrink-0">
            <Leaf className="h-3.5 w-3.5" />
            {attachedLeavesCount}/14 Leaves
          </span>
          <span className="text-stone-600">·</span>
          <span className="truncate text-[11px] text-stone-400">
            {pomodoro.enabled
              ? `Synced to ${pomodoro.focusMinutes}m Pomodoro (1 leaf every ${Math.floor(
                  targetSecondsPerLeaf / 60
                )}m ${targetSecondsPerLeaf % 60}s)`
              : 'Free Focus Mode (1 leaf every 3m 00s)'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {fallenLeavesCount > 0 && (
            <button
              onClick={handleSweepFloor}
              className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/50"
            >
              🧹 Sweep {fallenLeavesCount} Fallen
            </button>
          )}

          <button
            onClick={() =>
              setStats((s) => ({
                ...s,
                speedMultiplier: s.speedMultiplier === 1 ? 15 : 1,
              }))
            }
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
              stats.speedMultiplier > 1
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200'
            }`}
            title="Fast-forward timer 15x to preview leaf growth & upgrades"
          >
            <FastForward className="h-3 w-3" />
            <span>{stats.speedMultiplier}x Pace</span>
          </button>

          <button
            onClick={() => togglePanel('demo')}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[11px] font-bold transition ${
              activePanel === 'demo'
                ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5 text-purple-400" />
            <span>Test Story Moments</span>
          </button>
        </div>
      </footer>

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
