import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Award,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  EyeOff,
  FastForward,
  GitBranch,
  Layers,
  Leaf,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  ThermometerSnowflake,
  Video,
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
import { StudioCanvas } from './components/StudioCanvas'
import { PolaroidModal } from './components/PolaroidModal'
import { WebcamGuard } from './components/WebcamGuard'
import { AllowedTabsManager } from './components/AllowedTabsManager'

type ExpandablePanel = 'tabs' | 'upgrades' | 'simulator' | 'log' | null

function generateProceduralVineSegments(): VineSegment[] {
  // 15 points = 14 climbing segments winding up the windowpane and arching across the top
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
  const initialCount = 6
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
  { id: 'tab-1', title: 'VS Code / Localhost', url: 'http://localhost:5173' },
  { id: 'tab-2', title: 'React / MDN Docs', url: 'https://react.dev' },
  { id: 'tab-3', title: 'Figma Sprint Spec', url: 'https://figma.com' },
]

export function App() {
  const studioCanvasRef = useRef<HTMLCanvasElement>(null)
  const vineSegments = useMemo(() => generateProceduralVineSegments(), [])

  const [focusMode, setFocusMode] = useState<FocusMode>('locked_in')
  const [roommateState, setRoommateState] = useState<RoommateState>('typing')
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.45)
  const [nextLeafProgress, setNextLeafProgress] = useState<number>(0.25)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>(
    'Headphones on. Eyes on screen (or glancing at keyboard to type)—watch the ivy vine grow!'
  )

  // Expandable UI Drawers & Modals (Zero-scroll single-screen layout)
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
  const authorizedSwitchUntilRef = useRef<number>(0)
  const [authorizedPassSecondsLeft, setAuthorizedPassSecondsLeft] = useState<number>(0)

  const [stats, setStats] = useState<SessionStats>({
    focusSeconds: 240,
    unbrokenFocusSeconds: 240,
    comebackProgressSeconds: 0,
    tabSwitches: 0,
    authorizedTabSwitches: 0,
    phoneAlerts: 0,
    leavesGrown: 6,
    leavesLost: 0,
    goldenLeavesPainted: 0,
    roomTempCelsius: 22,
    currentTask: 'Ship Leaf Me Alone MVP',
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
      message: 'Session started. Looking at screen or typing on keyboard grows a new leaf every ~7s!',
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
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  // Helper to sprout one new healthy emerald leaf on the next available vine node
  const sproutOneLeaf = useCallback(() => {
    setLeaves((prev) => {
      // First heal all currently attached/dying leaves toward 1.0 health
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

      // Find the lowest segmentIndex (0..13) that doesn't currently have an attached leaf
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
      setVineGrowthProgress(Math.min(1, Math.max(0.2, (nextCount + 0.5) / vineSegments.length)))

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
      setDaysSinceDoomscroll(0)
      setNextLeafProgress(0)

      setLeaves((prevLeaves) => {
        const attached = prevLeaves.filter((l) => l.status === 'attached' || l.status === 'dying')
        if (attached.length === 0) return prevLeaves

        // Pick the highest segmentIndex attached leaf to wither and fall
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
    [appendLog, vineSegments]
  )

  const handleSwitchToAllowedTab = (tab: AllowedTab) => {
    setActiveAllowedTabId(tab.id)
    authorizedSwitchUntilRef.current = Date.now() + 20000
    setAuthorizedPassSecondsLeft(20)

    setStats((prev) => ({
      ...prev,
      authorizedTabSwitches: prev.authorizedTabSwitches + 1,
    }))

    const quote = `Switching to whitelisted tab "${tab.title}". Approved—keep that focus flow going!`
    setDialogueText(quote)
    appendLog(
      'tab_whitelist',
      `Switched to allowed tab: "${tab.title}"${tab.parentId ? ' (Expanded Sub-Tab)' : ''}`,
      quote
    )

    if (tab.url && tab.url.startsWith('http') && tab.url !== 'http://localhost:5173') {
      window.open(tab.url, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    if (authorizedPassSecondsLeft <= 0) return
    const timer = setInterval(() => {
      const rem = Math.max(0, Math.ceil((authorizedSwitchUntilRef.current - Date.now()) / 1000))
      setAuthorizedPassSecondsLeft(rem)
    }, 500)
    return () => clearInterval(timer)
  }, [authorizedPassSecondsLeft])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (Date.now() <= authorizedSwitchUntilRef.current) {
          return
        }
        triggerDistraction(
          'Switched to an UNAPPROVED browser tab (not selected from your Allowed Tabs Whitelist)'
        )
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [triggerDistraction])

  const handlePhoneDetected = useCallback(() => {
    triggerDistraction(
      'Webcam Guard: Stared down below horizon >6.5s (Phone Doomscroll)!',
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
      setDialogueText('Eyes on screen / typing! Putting the clipboard away and regrowing the vine.')
    }
  }, [focusMode])

  const handleAddInitialTab = (title: string, url: string) => {
    if (isWhitelistLocked) return
    setAllowedTabs((prev) => [...prev, { id: `tab-${Date.now()}`, title, url }])
  }

  const handleRemoveInitialTab = (id: string) => {
    if (isWhitelistLocked) return
    setAllowedTabs((prev) => prev.filter((t) => t.id !== id && t.parentId !== id))
  }

  const handleExpandSubTab = (parentId: string, title: string, url: string) => {
    const parent = allowedTabs.find((t) => t.id === parentId)
    const subTab: AllowedTab = {
      id: `sub-${Date.now()}`,
      title,
      url,
      parentId,
    }
    setAllowedTabs((prev) => [...prev, subTab])
    setActiveAllowedTabId(subTab.id)
    authorizedSwitchUntilRef.current = Date.now() + 20000
    setAuthorizedPassSecondsLeft(20)
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

  // Main 1-second Focus, Leaf Sprouting & O. Henry Redemption Progression Loop
  useEffect(() => {
    const timer = setInterval(() => {
      // Only grow when user isn't actively flagged for phone/away
      const isCameraFocusedOrTyping =
        !webcamEnabled ||
        cameraStatus === 'focused' ||
        cameraStatus === 'keyboard_glance' ||
        cameraStatus === 'initializing' ||
        cameraStatus === 'permission_denied'

      if (!isCameraFocusedOrTyping) return

      // Advance Next-Leaf Growth Bar while focused! (Sprouts a new leaf every ~7 seconds at 1x speed)
      if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
        setVineGrowthProgress((v) => Math.min(1, v + 0.012 * stats.speedMultiplier))
        setLeaves((prev) =>
          prev.map((l) =>
            l.status === 'attached' && l.health < 1
              ? { ...l, health: Math.min(1, l.health + 0.08) }
              : l
          )
        )
        setNextLeafProgress((prog) => {
          const step = 0.15 * Math.min(4, stats.speedMultiplier)
          if (prog + step >= 1) {
            sproutOneLeaf()
            return 0.05
          }
          return prog + step
        })
      }

      setStats((prev) => {
        const delta = prev.speedMultiplier

        if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
          return {
            ...prev,
            focusSeconds: prev.focusSeconds + delta,
            unbrokenFocusSeconds: prev.unbrokenFocusSeconds + delta,
            roomTempCelsius: Math.min(24, prev.roomTempCelsius + 0.4 * delta),
          }
        }

        if (focusMode === 'last_leaf_climax') {
          const nextComeback = prev.comebackProgressSeconds + delta * 10
          if (nextComeback >= 300) {
            setFocusMode('golden_comeback')
            setRoommateState('painting_golden_leaf')
            sproutOneLeaf()
            const quote = pickRandomDialogue('painting_golden_leaf')
            setDialogueText(quote)
            appendLog(
              'redemption',
              'THE O. HENRY TWIST! Locked in before the last leaf fell — Roommate painted a permanent Golden Leaf on the brick wall!',
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
  }, [focusMode, webcamEnabled, cameraStatus, stats.speedMultiplier, sproutOneLeaf, appendLog])

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
    setNextLeafProgress(0.35)

    setStats((prev) => ({
      ...prev,
      focusSeconds: prev.focusSeconds + 180,
      unbrokenFocusSeconds: prev.unbrokenFocusSeconds + 180,
      roomTempCelsius: Math.min(24, prev.roomTempCelsius + 3),
    }))

    appendLog(
      'focus',
      'Locked-In Boost (+3m): Sunlight intensified, vine grew upward, and a new emerald leaf bloomed!',
      quote
    )
  }

  const handleTriggerLastLeafClimax = () => {
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
    setRoommateState('sweeping_leaves')
    const quote = pickRandomDialogue('sweeping_leaves')
    setDialogueText(quote)
    setTimeout(() => {
      setLeaves((prev) => prev.filter((l) => l.status !== 'fallen'))
    }, 900)
    appendLog('distraction', 'Roommate swept up the crispy dead leaves from the floor.', quote)
  }

  const handleResetSession = () => {
    setFocusMode('locked_in')
    setRoommateState('typing')
    setLeaves(createInitialLeaves(vineSegments))
    setVineGrowthProgress(0.45)
    setNextLeafProgress(0.25)
    setDaysSinceDoomscroll(4)
    setDialogueText(pickRandomDialogue('typing'))
    setStats({
      focusSeconds: 240,
      unbrokenFocusSeconds: 240,
      comebackProgressSeconds: 0,
      tabSwitches: 0,
      authorizedTabSwitches: 0,
      phoneAlerts: 0,
      leavesGrown: 6,
      leavesLost: 0,
      goldenLeavesPainted: 0,
      roomTempCelsius: 22,
      currentTask: stats.currentTask,
      speedMultiplier: 1,
    })
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
      {/* 1. COMPACT TOP HEADER BAR */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stone-800 bg-stone-950 px-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
            <Leaf className="h-4 w-4" />
          </div>
          <span className="font-serif text-sm font-bold tracking-tight text-stone-100 shrink-0">
            Leaf Me Alone
          </span>

          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900/90 px-2 py-1">
            <span className="font-mono text-[10px] font-bold uppercase text-emerald-400">
              Task:
            </span>
            <input
              type="text"
              value={stats.currentTask}
              onChange={(e) => setStats((s) => ({ ...s, currentTask: e.target.value }))}
              className="w-36 bg-transparent font-mono text-[11px] text-stone-100 focus:outline-none"
            />
          </div>
        </div>

        {/* Compact Live Telemetry Pills */}
        <div className="hidden md:flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400">
            <Play className="h-3 w-3" />
            {Math.floor(stats.focusSeconds / 60)}m {stats.focusSeconds % 60}s
          </span>
          <span className="flex items-center gap-1 text-emerald-300 font-bold">
            <Leaf className="h-3 w-3" />
            Leaves: {attachedLeavesCount}/14
          </span>
          <span
            className="flex items-center gap-1 text-teal-300"
            title="Authorized switches to your whitelisted tabs"
          >
            <ShieldCheck className="h-3 w-3" />
            Allowed: {stats.authorizedTabSwitches}
          </span>
          <span
            className="flex items-center gap-1 text-rose-400"
            title="Unauthorized tab switches & phone doomscrolls"
          >
            <EyeOff className="h-3 w-3" />
            Violations: {stats.tabSwitches + stats.phoneAlerts}
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <Award className="h-3 w-3" />
            Gold: {stats.goldenLeavesPainted}
          </span>
        </div>

        {/* Expandable Section Menu Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => togglePanel('tabs')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
              activePanel === 'tabs'
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Tabs ({allowedTabs.length})</span>
            {activePanel === 'tabs' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <button
            onClick={() => togglePanel('upgrades')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
              activePanel === 'upgrades'
                ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span>Room ({unlockedUpgradesCount}/5)</span>
          </button>

          <button
            onClick={() => togglePanel('simulator')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
              activePanel === 'simulator'
                ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Sliders className="h-3.5 w-3.5 text-purple-400" />
            <span className="hidden sm:inline">States</span>
          </button>

          <button
            onClick={() => togglePanel('log')}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
              activePanel === 'log'
                ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Log</span>
          </button>

          <button
            onClick={() => setIsPolaroidOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white hover:bg-emerald-500"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Polaroid</span>
          </button>
        </div>
      </header>

      {/* 2. WHITELISTED TABS QUICK-SWITCH BAR */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-stone-800/80 bg-stone-900/60 px-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
            {isWhitelistLocked ? '🔒 Allowed Tabs:' : '🔓 Initial Tabs:'}
          </span>

          {allowedTabs.map((tab) => {
            const isSelected = activeAllowedTabId === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleSwitchToAllowedTab(tab)}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-medium transition shrink-0 ${
                  isSelected
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                    : 'border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700'
                }`}
                title="Click to authorize switching to this allowed tab"
              >
                {tab.parentId && <GitBranch className="h-2.5 w-2.5 text-teal-400" />}
                <span>{tab.title}</span>
                {isSelected && <Check className="h-2.5 w-2.5 text-emerald-400" />}
              </button>
            )
          })}

          <button
            onClick={() => setActivePanel('tabs')}
            className="flex items-center gap-1 rounded-md border border-dashed border-stone-700 px-2 py-0.5 font-mono text-[10px] text-stone-400 hover:border-emerald-500/50 hover:text-emerald-300 shrink-0"
          >
            <Plus className="h-2.5 w-2.5" />
            {isWhitelistLocked ? 'Expand from Tab' : 'Configure / Lock'}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
          {authorizedPassSecondsLeft > 0 ? (
            <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 font-bold text-emerald-300">
              Safe Tab Switch Pass: {authorizedPassSecondsLeft}s
            </span>
          ) : (
            <span className="text-stone-400 hidden lg:inline">
              Keyboard glances (6.5s grace) = SAFE · Unapproved tab = Leaf drops
            </span>
          )}
        </div>
      </div>

      {/* 3. MAIN CENTER STAGE (Fits remaining viewport height with 0 scrolling) */}
      <main className="relative flex flex-1 min-h-0 w-full items-center justify-center p-2.5 overflow-hidden">
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
                Cam Guard:{' '}
                {cameraStatus === 'phone_detected'
                  ? 'PHONE DETECTED!'
                  : cameraStatus === 'away_detected'
                  ? 'AWAY FROM DESK!'
                  : cameraStatus === 'keyboard_glance'
                  ? 'KEYBOARD GLANCE (SAFE)'
                  : webcamEnabled
                  ? 'ABOVE LINE (GROWING)'
                  : 'OFF'}
              </span>
              <ChevronUp className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* EXPANDABLE OVERLAY DRAWERS */}
        {activePanel && (
          <div className="absolute top-3 right-3 z-30 w-full max-w-sm rounded-2xl border border-stone-700 bg-stone-900/95 p-3 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between border-b border-stone-800 pb-1.5">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                {activePanel === 'tabs' && 'Allowed Tabs & Branch Expansion'}
                {activePanel === 'upgrades' && 'Cozy Studio Upgrades (5)'}
                {activePanel === 'simulator' && 'Roommate State & Story Inspector'}
                {activePanel === 'log' && "Roommate's Clipboard Review Log"}
              </span>
              <button
                onClick={() => setActivePanel(null)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activePanel === 'tabs' && (
              <AllowedTabsManager
                allowedTabs={allowedTabs}
                isWhitelistLocked={isWhitelistLocked}
                activeAllowedTabId={activeAllowedTabId}
                onLockWhitelist={() => {
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
                onTriggerUnauthorizedTab={() =>
                  triggerDistraction('Opened an UNAPPROVED new tab outside whitelist!')
                }
              />
            )}

            {activePanel === 'upgrades' && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                <div className="flex items-center justify-between pb-1">
                  <span className="font-mono text-[10.5px] text-stone-400">
                    Click any item to toggle or unlock via focus time:
                  </span>
                  <button
                    onClick={() =>
                      setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))
                    }
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300"
                  >
                    Unlock All
                  </button>
                </div>
                {upgrades.map((u) => (
                  <div
                    key={u.id}
                    onClick={() =>
                      setUpgrades((prev) =>
                        prev.map((item) =>
                          item.id === u.id ? { ...item, unlocked: !item.unlocked } : item
                        )
                      )
                    }
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

            {activePanel === 'simulator' && (
              <div className="space-y-2.5 font-mono text-xs">
                <p className="text-[10.5px] text-stone-400">
                  Inspect any of the 6 character states or studio maintenance actions:
                </p>
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
                        setRoommateState(st)
                        setDialogueText(pickRandomDialogue(st))
                        if (st === 'dramatic_sickbed') setFocusMode('last_leaf_climax')
                        else if (st === 'painting_golden_leaf') setFocusMode('golden_comeback')
                        else if (st === 'typing') setFocusMode('locked_in')
                        else setFocusMode('distracted')
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[10px] font-semibold transition ${
                        roommateState === st
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
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
          </div>
        )}
      </main>

      {/* 4. COMPACT BOTTOM QUICK-ACTION DOCK */}
      <footer className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-stone-800 bg-stone-950 px-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleLockInAndSprout}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/60"
          >
            <Sun className="h-3.5 w-3.5" />
            <span>1. Sprout Leaf Now</span>
          </button>

          <button
            onClick={() =>
              triggerDistraction('Opened an unapproved tab outside your initial whitelist')
            }
            className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-950/50 px-2.5 py-1 font-mono text-[11px] font-bold text-orange-300 hover:bg-orange-900/60"
          >
            <ThermometerSnowflake className="h-3.5 w-3.5" />
            <span>2. Unapproved Tab</span>
          </button>

          <button
            onClick={handlePhoneDetected}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 font-mono text-[11px] font-bold text-rose-300 hover:bg-rose-900/60"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Sim Phone</span>
          </button>

          <button
            onClick={handleTriggerLastLeafClimax}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/50 px-2.5 py-1 font-mono text-[11px] font-bold text-purple-300 hover:bg-purple-900/60"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>3. Last Leaf Climax</span>
          </button>

          <button
            onClick={handleTriggerGoldenLeafTwist}
            className="flex items-center gap-1.5 rounded-lg border border-yellow-500/40 bg-yellow-950/50 px-2.5 py-1 font-mono text-[11px] font-bold text-yellow-300 hover:bg-yellow-900/60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>4. O. Henry Twist</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() =>
              setStats((s) => ({
                ...s,
                speedMultiplier: s.speedMultiplier === 1 ? 15 : 1,
              }))
            }
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold transition ${
              stats.speedMultiplier > 1
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200'
            }`}
          >
            <FastForward className="h-3 w-3" />
            <span>{stats.speedMultiplier}x Speed</span>
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
