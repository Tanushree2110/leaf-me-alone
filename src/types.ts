export type RoommateState =
  | 'typing'
  | 'glaring_with_clipboard'
  | 'sweeping_leaves'
  | 'shivering'
  | 'dramatic_sickbed'
  | 'painting_golden_leaf'

export type FocusMode = 'locked_in' | 'distracted' | 'last_leaf_climax' | 'golden_comeback'

export type RoomSkinId =
  | 'cozy_greenhouse'
  | 'tokyo_lofi'
  | 'parisian_atelier'
  | 'nordic_cabin'
  | 'dark_academia'

export interface RoomSkin {
  id: RoomSkinId
  name: string
  subtitle: string
  previewColor: string
  wallTop: string
  wallBottom: string
  wallColdTop: string
  wallColdBottom: string
  floorTop: string
  floorBottom: string
  trimColor: string
  deskColor: string
  rugColor: string
  windowFrameColor: string
  sweaterColor: string
}

export interface LeafNode {
  id: number
  segmentIndex: number
  side: -1 | 1
  size: number
  baseAngle: number
  health: number
  status: 'attached' | 'dying' | 'falling' | 'fallen' | 'swept'
  hasBlossom: boolean
  blossomScale: number
  blossomColor: string
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

export interface SessionStats {
  focusSeconds: number
  unbrokenFocusSeconds: number
  comebackProgressSeconds: number
  tabSwitches: number
  authorizedTabSwitches: number
  phoneAlerts: number
  leavesGrown: number
  leavesLost: number
  goldenLeavesPainted: number
  roomTempCelsius: number
  currentTask: string
  speedMultiplier: number
}
