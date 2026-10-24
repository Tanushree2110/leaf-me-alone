export type RoommateState =
  | 'typing'
  | 'glaring_with_clipboard'
  | 'sweeping_leaves'
  | 'shivering'
  | 'dramatic_sickbed'
  | 'painting_golden_leaf'

export type FocusMode = 'locked_in' | 'distracted' | 'last_leaf_climax' | 'golden_comeback'

export interface LeafNode {
  id: number
  segmentIndex: number
  side: -1 | 1
  size: number
  baseAngle: number
  health: number // 1.0 = vibrant emerald, 0.0 = crispy brown
  status: 'attached' | 'dying' | 'falling' | 'fallen' | 'swept'
  hasBlossom: boolean
  blossomScale: number
  blossomColor: string
  // Falling / Floor physics
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  vRot: number
  swayPhase: number
  seed: number
}

export interface VineSegment {
  x0: number
  y0: number
  cp1x: number
  cp1y: number
  cp2x: number
  cp2y: number
  x1: number
  y1: number
  thickness: number
}

export interface RoomUpgrade {
  id: 'warm_lamp' | 'bookshelf' | 'sleeping_cat' | 'matcha_station' | 'string_lights'
  name: string
  description: string
  unlockMinutes: number
  unlocked: boolean
  icon: string
}

export interface ActivityLogItem {
  id: string
  timestamp: string
  type: 'focus' | 'distraction' | 'climax' | 'upgrade' | 'redemption'
  message: string
  quote?: string
}

export interface SessionStats {
  focusSeconds: number
  unbrokenFocusSeconds: number
  comebackProgressSeconds: number // 0 to 300s (or accelerated in demo) for O. Henry twist
  tabSwitches: number
  leavesGrown: number
  leavesLost: number
  goldenLeavesPainted: number
  roomTempCelsius: number
  currentTask: string
  speedMultiplier: number // 1x real time, or 15x fast-forward for testing/demo
}
