import { RoommateState, RoomUpgrade } from '../types'

export const DIALOGUE_BY_STATE: Record<RoommateState, string[]> = {
  typing: [
    " Headphones on. Deep work mode engaged. Look at that vine reach for the sun!",
    "Brewed a fresh pour-over. If you keep this cadence up, we might actually afford a bookshelf.",
    "Chlorophyll levels optimal. Not a single Reddit tab in sight. I'm almost proud of you.",
    "Look at Leaf #4 blooming! Turns out your attention span CAN sustain biological life.",
    "Typing at 90 WPM right alongside you. Our studio apartment has never felt warmer.",
  ],
  glaring_with_clipboard: [
    "Oh, don't mind me. I'll just document Tab Switch #14 on your quarterly focus review.",
    "Interesting. You left the window for 6 seconds and a leaf immediately died of cringe.",
    "*Clicks pen aggressively* 'Subject exhibits goldfish-tier dopamine regulation.'",
    "Was that X, Reddit, or YouTube? Don't lie to me, I can feel the frost on the windowpane.",
    "I just reset the 'DAYS SINCE LAST DOOMSCROLL' sign back to 0. Hope that meme was worth it.",
  ],
  sweeping_leaves: [
    "Oh, don't mind me. I'll just sweep up the corpse of Leaf #3 while you check notifications.",
    "*Sweeps crispy brown leaf* Another innocent botanical casualty of your tab-switching.",
    "I'm a desktop companion, not a municipal leaf-blower. Lock back in before the floor disappears!",
    "Crunch, crunch, crunch. That's the sound of our cozy greenhouse turning into a mulch pile.",
  ],
  shivering: [
    "B-b-brrr! Your procrastination dropped the apartment temperature to 9°C! Put the phone down!",
    "I had to put on my emergency puffer jacket because your focus flatlined.",
    "Frost is literally creeping across the glass. Type something productive before my coffee freezes!",
    "My fingers are too numb to type. Is this how we live now? In a frozen wasteland of open tabs?",
  ],
  dramatic_sickbed: [
    "The doctors say when that last leaf falls, this sprint ticket dies with me... *coughs melodramatically*",
    "Johnsy had pneumonia in Greenwich Village; I have terminal Second-Screen Syndrome.",
    "Tell my mother I died waiting for you to finish one 25-minute focus block...",
    "Only one trembling leaf remains against the storm. Lock in for 5 minutes or let the curtain fall!",
  ],
  painting_golden_leaf: [
    "WAIT! You locked back in?! Hand me my beret and 24-karat gold paint—this vine WILL NOT DIE TODAY!",
    "Pulling a full O. Henry masterpiece on the brick wall! Behold: The Immortal Golden Leaf!",
    "Against all odds and 19 tab switches, we survived the storm! A permanent gold badge for the wall!",
  ],
}

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
