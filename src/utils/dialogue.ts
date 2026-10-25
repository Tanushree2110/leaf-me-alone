import { RoommateState, RoomUpgrade } from '../types'

export const DIALOGUE_BY_STATE: Record<RoommateState, string[]> = {
  typing: [
    "Headphones on. Eyes on screen, no stray tabs. Look at that vine reach for the sun!",
    "Brewed a fresh pour-over. Camera sees you locked in—not a phone in sight.",
    "Chlorophyll levels optimal. One window, zero wandering. I'm almost proud of you.",
    "Look at Leaf #4 blooming! Turns out your attention span CAN sustain biological life.",
    "Typing at 90 WPM right alongside you. Our studio apartment has never felt warmer.",
  ],
  glaring_with_clipboard: [
    "Oh, don't mind me. Documenting an UNAUTHORIZED tab switch on your performance review.",
    "Excuse me, that was NOT part of the plan. Leaf #3 just died of betrayal.",
    "I see you looking down at your phone on camera! Put it down before the vine freezes!",
    "*Clicks pen aggressively* 'Subject drifted away from desk / checked phone mid-sprint.'",
    "I just reset the 'DAYS SINCE LAST DOOMSCROLL' sign to 0. Stay in your window!",
  ],
  sweeping_leaves: [
    "Oh, don't mind me. I'll just sweep up the corpse of Leaf #3 while you check your phone.",
    "*Sweeps crispy brown leaf* Another botanical casualty of an unapproved tab switch.",
    "I'm a desktop companion, not a leaf-blower. Stay in your window!",
    "Crunch, crunch. That's the sound of our greenhouse dying every time you look at your phone.",
  ],
  shivering: [
    "B-b-brrr! You drifted away from the camera and the room dropped to 9°C!",
    "I had to put on my emergency puffer jacket because you opened an unapproved tab.",
    "Frost is creeping across the glass. Eyes back on screen before my matcha freezes!",
    "My fingers are too numb to type. Put the phone down and warm this room up!",
  ],
  dramatic_sickbed: [
    "The doctors say when that last leaf falls, this sprint ticket dies with me... *coughs*",
    "Johnsy had pneumonia in Greenwich Village; I have terminal Phone-Glance Syndrome.",
    "Tell my mother I died waiting for you to stay in one window for 5 minutes...",
    "Only one trembling leaf remains against the storm. Lock in on camera or let the curtain fall!",
  ],
  painting_golden_leaf: [
    "WAIT! You locked back in?! Hand me my beret and 24-karat gold paint—this vine WILL NOT DIE TODAY!",
    "Pulling a full O. Henry masterpiece on the brick wall! Behold: The Immortal Golden Leaf!",
    "Against all odds, we survived the storm! A permanent gold badge on the brick wall!",
  ],
}

export const PHONE_DETECTED_QUOTES = [
  "EYES UP! My webcam sensor literally sees you looking down at your phone! *Clicks clipboard pen*",
  "Put the phone down! Leaf #3 is shriveling up while you check notifications!",
  "Caught in 4K on webcam looking at your phone. Resetting DOOMSCROLL counter to 0!",
]

export const AWAY_DETECTED_QUOTES = [
  "Hello?! Webcam says you drifted out of frame! Who abandons a photosynthesis session?!",
  "You wandered away from the desk and the studio temperature plummeted!",
  "*Glares into empty webcam* Must be nice to walk away while I sweep dead leaves.",
]

export const INITIAL_UPGRADES: RoomUpgrade[] = [
  {
    id: 'warm_lamp',
    name: 'Amber Banker Lamp',
    description: 'Casts a cozy golden-hour glow across the desk.',
    unlockMinutes: 3,
    unlocked: false,
    icon: 'Lamp',
  },
  {
    id: 'matcha_station',
    name: 'Artisanal Pour-Over & Matcha',
    description: 'Steaming ceremonial mug that fuels high-cadence typing.',
    unlockMinutes: 7,
    unlocked: false,
    icon: 'Coffee',
  },
  {
    id: 'bookshelf',
    name: 'Oak Wall Bookshelf',
    description: 'Stacked with O. Henry short stories & botany treatises.',
    unlockMinutes: 12,
    unlocked: false,
    icon: 'BookOpen',
  },
  {
    id: 'sleeping_cat',
    name: 'Mochi the Calico Cat',
    description: 'Purrs on the woven rug whenever you stay locked in.',
    unlockMinutes: 18,
    unlocked: false,
    icon: 'Cat',
  },
  {
    id: 'string_lights',
    name: 'Botanical Fairy Lights',
    description: 'Twinkling warm bulbs draped across the studio ceiling.',
    unlockMinutes: 25,
    unlocked: false,
    icon: 'Sparkles',
  },
]

export function pickRandomDialogue(state: RoommateState, leafNumber?: number): string {
  const pool = DIALOGUE_BY_STATE[state]
  const raw = pool[Math.floor(Math.random() * pool.length)]
  if (leafNumber !== undefined) {
    return raw.replace('#3', `#${leafNumber}`).replace('#4', `#${leafNumber}`)
  }
  return raw
}
