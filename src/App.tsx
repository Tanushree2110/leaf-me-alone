import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Award,
  Camera,
  ClipboardList,
  Coffee,
  EyeOff,
  FastForward,
  Flame,
  Leaf,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Sun,
  ThermometerSnowflake,
  Wind,
  Zap,
} from 'lucide-react'
import {
  ActivityLogItem,
  FocusMode,
  LeafNode,
  RoommateState,
  RoomUpgrade,
  SessionStats,
  VineSegment,
} from './types'
import { INITIAL_UPGRADES, pickRandomDialogue } from './utils/dialogue'
import { StudioCanvas } from './components/StudioCanvas'
import { PolaroidModal } from './components/PolaroidModal'

function generateProceduralVineSegments(): VineSegment[] {
  // Starts at the terracotta pot on the window sill (x=106, y=342) and climbs up the windowpane
  const points = [
    { x: 106, y: 342 },
    { x: 96, y: 298 },
    { x: 132, y: 256 },
    { x: 112, y: 210 },
    { x: 158, y: 174 },
    { x: 136, y: 128 },
    { x: 184, y: 92 },
    { x: 222, y: 68 },
  ]
  const segments: VineSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const midY = (p0.y + p1.y) / 2
    const sway = i % 2 === 0 ? -22 : 22
    segments.push({
      x0: p0.x,
      y0: p0.y,
      cp1x: p0.x + sway,
      cp1y: midY + 10,
      cp2x: p1.x - sway * 0.6,
      cp2y: midY - 10,
      x1: p1.x,
      y1: p1.y,
      thickness: Math.max(2.2, 6.2 - i * 0.6),
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
      size: 13 + (i % 3) * 2.5,
      baseAngle: side * (0.55 + (i % 2) * 0.25),
      health: 1,
      status: 'attached',
      hasBlossom: i % 2 === 1,
      blossomScale: 1,
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
  const [leaves, setLeaves] = useState<LeafNode[]>(() => createInitialLeaves(vineSegments))
  const [vineGrowthProgress, setVineGrowthProgress] = useState<number>(0.78)
  const [upgrades, setUpgrades] = useState<RoomUpgrade[]>(INITIAL_UPGRADES)
  const [daysSinceDoomscroll, setDaysSinceDoomscroll] = useState<number>(4)
  const [dialogueText, setDialogueText] = useState<string>(
    "Headphones on. Deep work mode engaged. Look at that procedural ivy reach for the sun!"
  )
  const [isPolaroidOpen, setIsPolaroidOpen] = useState<boolean>(false)
  const [isCompactCornerMode, setIsCompactCornerMode] = useState<boolean>(false)
  const [realTabDetectionEnabled, setRealTabDetectionEnabled] = useState<boolean>(true)

  const [stats, setStats] = useState<SessionStats>({
    focusSeconds: 240,
    unbrokenFocusSeconds: 240,
    comebackProgressSeconds: 0,
    tabSwitches: 0,
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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: 'focus',
      message: 'Session started in Locked-In Mode. Sunlight pouring through the studio window.',
      quote: 'Chlorophyll levels optimal. Not a single Reddit tab in sight.',
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

  // Trigger a distraction event (either from real tab switch or manual simulation button)
  const triggerDistraction = useCallback(
    (reason = 'Switched browser tab') => {
      setDaysSinceDoomscroll(0)

      setLeaves((prevLeaves) => {
        const attached = prevLeaves.filter((l) => l.status === 'attached' || l.status === 'dying')
        if (attached.length === 0) return prevLeaves

        // Pick newest leaf at top of vine to wither and fall
        const victim = attached[attached.length - 1]
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
          // Slightly drain health of remaining leaves
          if (leaf.status === 'attached') {
            return { ...leaf, health: Math.max(0.45, leaf.health - 0.12) }
          }
          return leaf
        })

        // Determine if we just hit "The Last Leaf" Climax (1 leaf left!)
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
          // Alternate between glaring with clipboard, sweeping leaves, and shivering in puffer jacket
          const nextStates: RoommateState[] = [
            'glaring_with_clipboard',
            'sweeping_leaves',
            'shivering',
          ]
          const chosenState = nextStates[Math.floor(Math.random() * nextStates.length)]
          setRoommateState(chosenState)
          const quote = pickRandomDialogue(chosenState, victim.id)
          setDialogueText(quote)
          appendLog(
            'distraction',
            `${reason} — Leaf #${victim.id} withered and detached onto the apartment floor.`,
            quote
          )
        }

        return updated
      })

      setStats((prev) => ({
        ...prev,
        tabSwitches: prev.tabSwitches + 1,
        unbrokenFocusSeconds: 0,
        comebackProgressSeconds: 0,
        leavesLost: prev.leavesLost + 1,
        roomTempCelsius: Math.max(7, prev.roomTempCelsius - 3.5),
      }))
    },
    [appendLog, vineSegments]
  )

  // Listen to real browser `visibilitychange` so switching tabs triggers the passive-aggressive roommate!
  useEffect(() => {
    if (!realTabDetectionEnabled) return
    const handleVisibility = () => {
      if (document.hidden) {
        triggerDistraction('Detected real browser tab switch (visibilitychange)')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [realTabDetectionEnabled, triggerDistraction])

  // Physics loop for falling leaves landing on the studio floor
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

  // Main 1-second Focus & O. Henry Redemption Progression Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setStats((prev) => {
        const delta = prev.speedMultiplier

        // If in Locked-In Mode or Golden Comeback, accumulate focus & warm up studio
        if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
          const newFocus = prev.focusSeconds + delta
          const newUnbroken = prev.unbrokenFocusSeconds + delta
          const newTemp = Math.min(24, prev.roomTempCelsius + 0.35 * delta)

          return {
            ...prev,
            focusSeconds: newFocus,
            unbrokenFocusSeconds: newUnbroken,
            roomTempCelsius: newTemp,
          }
        }

        // If in "The Last Leaf" Climax, track the 5-minute (300s) O. Henry Redemption timer!
        if (focusMode === 'last_leaf_climax') {
          const nextComeback = prev.comebackProgressSeconds + delta * 6 // Scaled so user can experience the climax comeback smoothly
          if (nextComeback >= 300) {
            // O. HENRY TWIST UNLOCKED!
            setFocusMode('golden_comeback')
            setRoommateState('painting_golden_leaf')
            const quote = pickRandomDialogue('painting_golden_leaf')
            setDialogueText(quote)
            appendLog(
              'redemption',
              'THE O. HENRY TWIST! Locked in for 5 straight minutes before the last leaf fell — Roommate painted a permanent Golden Leaf on the brick wall!',
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
  }, [focusMode, appendLog])

  // Unlock cozy studio upgrades & sprout new procedural leaves as focus time grows
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

  // Action: Lock Back In (Resume Deep Work & Sprout a Leaf)
  const handleLockInAndSprout = () => {
    setFocusMode('locked_in')
    setRoommateState('typing')
    const quote = pickRandomDialogue('typing')
    setDialogueText(quote)
    setVineGrowthProgress((p) => Math.min(1, p + 0.08))

    setLeaves((prev) => {
      // Heal existing attached leaves and sprout a new emerald leaf + blossom
      const healed = prev.map((l) =>
        l.status === 'attached' || l.status === 'dying'
          ? { ...l, status: 'attached' as const, health: 1, hasBlossom: true }
          : l
      )
      const attachedCount = healed.filter((l) => l.status === 'attached').length
      if (attachedCount >= 8) return healed

      const newId = healed.length + 1
      const segIdx = Math.min(attachedCount, vineSegments.length - 1)
      const seg = vineSegments[segIdx]
      const side: -1 | 1 = newId % 2 === 0 ? -1 : 1
      const newLeaf: LeafNode = {
        id: newId,
        segmentIndex: segIdx,
        side,
        size: 13 + (newId % 3) * 2.5,
        baseAngle: side * (0.5 + (newId % 2) * 0.25),
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

    setStats((prev) => ({
      ...prev,
      focusSeconds: prev.focusSeconds + 180,
      unbrokenFocusSeconds: prev.unbrokenFocusSeconds + 180,
      leavesGrown: prev.leavesGrown + 1,
      roomTempCelsius: Math.min(24, prev.roomTempCelsius + 3),
    }))

    appendLog(
      'focus',
      'Locked-In Focus Boost (+3m): Sunlight intensified, vine grew upward, and a new emerald leaf bloomed!',
      quote
    )
  }

  // Action: Jump straight to "The Last Leaf" Climax (1 trembling leaf left in thunderstorm)
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
            health: 0.42,
            segmentIndex: Math.min(3, vineSegments.length - 1),
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
      'Entered "The Last Leaf" Climax: Thunderstorm hit the window! Only 1 trembling leaf remains on the vine.',
      quote
    )
  }

  // Action: Trigger O. Henry Golden Leaf Comeback immediately
  const handleTriggerGoldenLeafTwist = () => {
    setFocusMode('golden_comeback')
    setRoommateState('painting_golden_leaf')
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
      'THE O. HENRY TWIST UNLOCKED! Roommate climbed out of bed in a beret and painted a permanent Golden Leaf on the brick wall!',
      quote
    )
  }

  // Action: Sweep floor corpses clean
  const handleSweepFloor = () => {
    setRoommateState('sweeping_leaves')
    const quote = pickRandomDialogue('sweeping_leaves')
    setDialogueText(quote)
    setTimeout(() => {
      setLeaves((prev) => prev.filter((l) => l.status !== 'fallen'))
    }, 900)
    appendLog('distraction', 'Roommate swept up the crispy dead leaves from the apartment floor.', quote)
  }

  // Action: Reset full studio
  const handleResetSession = () => {
    setFocusMode('locked_in')
    setRoommateState('typing')
    setLeaves(createInitialLeaves(vineSegments))
    setVineGrowthProgress(0.78)
    setDaysSinceDoomscroll(4)
    setDialogueText(pickRandomDialogue('typing'))
    setStats({
      focusSeconds: 240,
      unbrokenFocusSeconds: 240,
      comebackProgressSeconds: 0,
      tabSwitches: 0,
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Top Navigation & Status Header */}
      <header className="border-b border-stone-800/80 bg-stone-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-xl font-bold tracking-tight text-stone-100">
                  Leaf Me Alone
                </h1>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  The Last Leaf × Desk Tamagotchi
                </span>
              </div>
              <p className="font-mono text-xs text-stone-400">
                Melodramatic focus roommate &amp; mathematical ivy whose survival depends on your attention span
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Real Tab-Switch Detection Toggle */}
            <button
              onClick={() => setRealTabDetectionEnabled((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-xs font-semibold transition ${
                realTabDetectionEnabled
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
                  : 'border-stone-700 bg-stone-900 text-stone-400'
              }`}
              title="When enabled, switching to another browser tab automatically triggers Distraction Mode"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  realTabDetectionEnabled ? 'animate-pulse bg-emerald-400' : 'bg-stone-500'
                }`}
              />
              Tab-Switch Sensor: {realTabDetectionEnabled ? 'ARMED' : 'PAUSED'}
            </button>

            {/* Compact Corner Companion Mode Toggle */}
            <button
              onClick={() => setIsCompactCornerMode((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-xs font-semibold text-stone-300 hover:bg-stone-800"
            >
              {isCompactCornerMode ? (
                <>
                  <Maximize2 className="h-3.5 w-3.5 text-emerald-400" />
                  Expand Full Studio
                </>
              ) : (
                <>
                  <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
                  Corner Companion Mode
                </>
              )}
            </button>

            {/* Export Daily Lease Inspection Polaroid Button */}
            <button
              onClick={() => setIsPolaroidOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 font-mono text-xs font-bold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-500"
            >
              <Camera className="h-4 w-4" />
              Daily Lease Inspection Card
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main
        className={`mx-auto px-4 py-6 sm:px-6 ${
          isCompactCornerMode ? 'max-w-xl' : 'max-w-7xl'
        }`}
      >
        {/* Active Anchor Task Bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-800 bg-stone-900/70 px-4 py-3">
          <div className="flex flex-1 items-center gap-3 min-w-[260px]">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
              Anchor Task:
            </span>
            <input
              type="text"
              value={stats.currentTask}
              onChange={(e) => setStats((s) => ({ ...s, currentTask: e.target.value }))}
              className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 font-mono text-xs text-stone-100 focus:border-emerald-500 focus:outline-none"
              placeholder="What are you locking in on right now?"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Play className="h-3.5 w-3.5" />
              <span>Focus: {Math.floor(stats.focusSeconds / 60)}m {stats.focusSeconds % 60}s</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-400">
              <EyeOff className="h-3.5 w-3.5" />
              <span>Tab Switches: {stats.tabSwitches}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-300">
              <Award className="h-3.5 w-3.5" />
              <span>Golden Leaves: {stats.goldenLeavesPainted}</span>
            </div>
          </div>
        </div>

        <div
          className={`grid gap-6 ${
            isCompactCornerMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'
          }`}
        >
          {/* LEFT / MAIN COLUMN: Interactive Procedural Studio Canvas + Simulation Deck */}
          <div className={isCompactCornerMode ? 'col-span-1' : 'lg:col-span-8 space-y-5'}>
            <StudioCanvas
              focusMode={focusMode}
              roommateState={roommateState}
              leaves={leaves}
              vineSegments={vineSegments}
              vineGrowthProgress={vineGrowthProgress}
              upgrades={upgrades}
              daysSinceDoomscroll={daysSinceDoomscroll}
              goldenLeavesPainted={stats.goldenLeavesPainted}
              roomTempCelsius={stats.roomTempCelsius}
              comebackProgress={comebackProgress}
              dialogueText={dialogueText}
              canvasRef={studioCanvasRef}
            />

            {/* Interactive Director / Simulation Deck (Test all 3 acts & 6 character states in 1 click) */}
            <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4 shadow-xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-stone-300">
                    Real-Time Reaction Deck &amp; Story Simulator
                  </h2>
                  <p className="font-mono text-[11px] text-stone-400">
                    Switch to another browser tab to trigger real detection, or test any phase &amp; roommate state below:
                  </p>
                </div>
                <button
                  onClick={() =>
                    setStats((s) => ({
                      ...s,
                      speedMultiplier: s.speedMultiplier === 1 ? 15 : 1,
                    }))
                  }
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                    stats.speedMultiplier > 1
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <FastForward className="h-3.5 w-3.5" />
                  Time Speed: {stats.speedMultiplier}x
                </button>
              </div>

              {/* Primary 4 Story Phase Triggers */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  onClick={handleLockInAndSprout}
                  className="flex flex-col items-start gap-1 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-900/50"
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300">
                    <Sun className="h-4 w-4" />
                    1. Locked-In Boost
                  </div>
                  <span className="font-mono text-[11px] text-stone-300">
                    Sunlight rays + sprout emerald leaf &amp; unlock room upgrades
                  </span>
                </button>

                <button
                  onClick={() => triggerDistraction('Simulated Tab-Switch Spree (Reddit/X)')}
                  className="flex flex-col items-start gap-1 rounded-xl border border-orange-500/30 bg-orange-950/40 p-3 text-left transition hover:border-orange-400 hover:bg-orange-900/50"
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-orange-300">
                    <ThermometerSnowflake className="h-4 w-4" />
                    2. Drift Off / Tab Hop
                  </div>
                  <span className="font-mono text-[11px] text-stone-300">
                    Frost creeps in, newest leaf dies &amp; falls, clipboard review
                  </span>
                </button>

                <button
                  onClick={handleTriggerLastLeafClimax}
                  className="flex flex-col items-start gap-1 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-left transition hover:border-rose-400 hover:bg-rose-900/50"
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-rose-300">
                    <ShieldAlert className="h-4 w-4" />
                    3. "The Last Leaf" Climax
                  </div>
                  <span className="font-mono text-[11px] text-stone-300">
                    Thunderstorm + 1 trembling leaf + Victorian sickbed drama
                  </span>
                </button>

                <button
                  onClick={handleTriggerGoldenLeafTwist}
                  className="flex flex-col items-start gap-1 rounded-xl border border-yellow-500/40 bg-yellow-950/40 p-3 text-left transition hover:border-yellow-400 hover:bg-yellow-900/50"
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-yellow-300">
                    <Sparkles className="h-4 w-4" />
                    4. O. Henry Twist!
                  </div>
                  <span className="font-mono text-[11px] text-stone-300">
                    Beret + paints permanent Golden Leaf onto the brick wall
                  </span>
                </button>
              </div>

              {/* Direct 6 Character State Switcher */}
              <div className="mt-3.5 border-t border-stone-800 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    Direct Roommate State Inspector (6 States):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSweepFloor}
                      className="rounded-md border border-stone-700 bg-stone-800 px-2 py-0.5 font-mono text-[10px] text-stone-300 hover:bg-stone-700"
                    >
                      Sweep Floor Leaves ({fallenLeavesCount})
                    </button>
                    <button
                      onClick={handleResetSession}
                      className="flex items-center gap-1 rounded-md border border-stone-700 bg-stone-800 px-2 py-0.5 font-mono text-[10px] text-stone-300 hover:bg-stone-700"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset Studio
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
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
                      className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-medium transition ${
                        roommateState === st
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700 hover:text-stone-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Cozy Apartment Upgrades + Passive-Aggressive Performance Log */}
          {!isCompactCornerMode && (
            <div className="lg:col-span-4 space-y-5">
              {/* Botanical & Apartment Telemetry Card */}
              <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Botanical &amp; Room Telemetry
                  </h3>
                  <span className="rounded-md bg-stone-800 px-2 py-0.5 font-mono text-[11px] text-stone-300">
                    {stats.roomTempCelsius.toFixed(0)}°C Studio
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="rounded-xl border border-stone-800 bg-stone-950/80 p-2.5">
                    <div className="font-mono text-xl font-extrabold text-emerald-400">
                      {attachedLeavesCount}
                    </div>
                    <div className="font-mono text-[10px] uppercase text-stone-400">
                      Live Leaves
                    </div>
                  </div>
                  <div className="rounded-xl border border-stone-800 bg-stone-950/80 p-2.5">
                    <div className="font-mono text-xl font-extrabold text-orange-400">
                      {fallenLeavesCount}
                    </div>
                    <div className="font-mono text-[10px] uppercase text-stone-400">
                      Floor Corpses
                    </div>
                  </div>
                  <div className="rounded-xl border border-stone-800 bg-stone-950/80 p-2.5">
                    <div className="font-mono text-xl font-extrabold text-yellow-400">
                      {stats.goldenLeavesPainted}
                    </div>
                    <div className="font-mono text-[10px] uppercase text-stone-400">
                      Golden Leaves
                    </div>
                  </div>
                </div>

                {/* O. Henry Redemption Meter when in Last Leaf Climax */}
                {focusMode === 'last_leaf_climax' && (
                  <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-950/30 p-3">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-yellow-300">
                      <span>O. Henry Redemption Streak</span>
                      <span>{Math.round(comebackProgress * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-300"
                        style={{ width: `${Math.round(comebackProgress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] text-yellow-200/80">
                      Stay on this tab to paint the permanent Golden Leaf onto the brick wall!
                    </p>
                  </div>
                )}
              </div>

              {/* Cozy Apartment Upgrades (Unlocks with Focus Time) */}
              <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
                      Cozy Studio Upgrades
                    </h3>
                    <p className="font-mono text-[11px] text-stone-400">
                      Unlocks automatically as unbroken focus accumulates
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setUpgrades((prev) => prev.map((u) => ({ ...u, unlocked: true })))
                    }
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                  >
                    Unlock All
                  </button>
                </div>

                <div className="space-y-2">
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
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition ${
                        u.unlocked
                          ? 'border-emerald-500/40 bg-emerald-950/30 text-stone-100'
                          : 'border-stone-800 bg-stone-950/60 text-stone-500 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                            u.unlocked
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-stone-800 text-stone-500'
                          }`}
                        >
                          {u.unlocked ? '✓' : `${u.unlockMinutes}m`}
                        </div>
                        <div>
                          <div className="font-mono text-xs font-bold">{u.name}</div>
                          <div className="font-mono text-[10px] text-stone-400">
                            {u.description}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] font-semibold uppercase">
                        {u.unlocked ? 'Active' : 'Locked'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roommate's Passive-Aggressive Clipboard Log */}
              <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-rose-400" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-stone-200">
                    Roommate&apos;s Clipboard Log
                  </h3>
                </div>

                <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
                  {activityLog.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-stone-800/90 bg-stone-950/90 p-2.5 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between text-[10px] text-stone-500">
                        <span
                          className={`font-bold uppercase ${
                            item.type === 'focus'
                              ? 'text-emerald-400'
                              : item.type === 'redemption'
                              ? 'text-yellow-400'
                              : item.type === 'climax'
                              ? 'text-rose-400'
                              : item.type === 'upgrade'
                              ? 'text-amber-400'
                              : 'text-orange-400'
                          }`}
                        >
                          {item.type}
                        </span>
                        <span>{item.timestamp}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-200">{item.message}</p>
                      {item.quote && (
                        <p className="mt-1 border-l-2 border-stone-700 pl-2 italic text-[11px] text-stone-400">
                          {item.quote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
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
