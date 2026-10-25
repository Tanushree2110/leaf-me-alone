// Soothing Web Audio Engine with Auto-Unlock on Any Interaction & Audible Singing-Bowl Pad

export type AudioMood = 'studying' | 'storm' | 'silent'

interface GlobalAudioRegistry {
  contexts: Set<AudioContext>
  timers: Set<ReturnType<typeof setInterval>>
  nodes: Set<AudioScheduledSourceNode>
}

declare global {
  interface Window {
    __leafAudioRegistry?: GlobalAudioRegistry
  }
}

function isHiddenCursorWebview(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Electron|Cursor/i.test(navigator.userAgent)
}

function getRegistry(): GlobalAudioRegistry {
  if (typeof window === 'undefined') {
    return { contexts: new Set(), timers: new Set(), nodes: new Set() }
  }
  if (!window.__leafAudioRegistry) {
    window.__leafAudioRegistry = {
      contexts: new Set(),
      timers: new Set(),
      nodes: new Set(),
    }
  }
  return window.__leafAudioRegistry
}

export function nukeAllActiveAudio() {
  const reg = getRegistry()
  reg.timers.forEach((t) => clearInterval(t))
  reg.timers.clear()
  reg.nodes.forEach((n) => {
    try {
      n.stop(0)
    } catch {}
    try {
      n.disconnect()
    } catch {}
  })
  reg.nodes.clear()
  reg.contexts.forEach((ctx) => {
    try {
      ctx.suspend().catch(() => {})
      ctx.close().catch(() => {})
    } catch {}
  })
  reg.contexts.clear()
}

nukeAllActiveAudio()

// Clear, warm, audible singing-bowl & harp frequencies (260Hz - 784Hz so it plays clearly on laptop speakers!)
const SOOTHING_CHORDS: number[][] = [
  [261.63, 329.63, 392.0, 523.25], // C4, E4, G4, C5
  [220.0, 261.63, 329.63, 493.88], // A3, C4, E4, B4
  [174.61, 261.63, 329.63, 440.0], // F3, C4, E4, A4
  [196.0, 293.66, 392.0, 493.88],  // G3, D4, G4, B4
]

const STORAGE_MUTE_KEY = 'leaf_me_alone_sound_enabled'

class SoundEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private enabled: boolean = true
  private currentMood: AudioMood = 'studying'
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private thunderTimer: ReturnType<typeof setInterval> | null = null
  private chordIndex = 0
  private channel: BroadcastChannel | null = null
  private listeners: Set<(enabled: boolean) => void> = new Set()

  constructor() {
    if (isHiddenCursorWebview()) {
      this.enabled = false
      nukeAllActiveAudio()
      return
    }

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_MUTE_KEY)
      if (saved === 'false') {
        this.enabled = false
      }

      fetch('/api/audio-state')
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.muted === 'boolean') {
            this.applyEnabledInternal(!d.muted)
          }
        })
        .catch(() => {})

      try {
        this.channel = new BroadcastChannel('leaf_me_alone_audio_sync')
        this.channel.onmessage = (ev) => {
          if (ev.data?.type === 'SET_ENABLED') {
            this.applyEnabledInternal(Boolean(ev.data.enabled))
          }
        }
      } catch {}

      if (import.meta.hot) {
        import.meta.hot.on('leaf-audio-mute', (data: { muted?: boolean }) => {
          if (typeof data?.muted === 'boolean') {
            this.applyEnabledInternal(!data.muted)
          }
        })
      }

      // Auto-unlock AudioContext on any click or keypress in Chrome so soothing music starts immediately!
      const unlockAndPlay = () => {
        if (!this.enabled || isHiddenCursorWebview()) return
        const audio = this.getContext()
        if (audio && audio.ctx.state === 'suspended') {
          audio.ctx.resume().then(() => {
            if (this.enabled && this.currentMood === 'studying') {
              this.playSoothingPadChord()
            }
          }).catch(() => {})
        } else if (audio && !this.musicTimer && !this.thunderTimer && this.currentMood !== 'silent') {
          this.applyMoodAudio(this.currentMood)
        }
      }

      window.addEventListener('pointerdown', unlockAndPlay, { passive: true })
      window.addEventListener('keydown', unlockAndPlay, { passive: true })
    }
  }

  public onEnabledChange(cb: (enabled: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private getContext(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled || isHiddenCursorWebview()) return null
    if ((!this.ctx || this.ctx.state === 'closed') && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
        getRegistry().contexts.add(this.ctx)
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime)
        this.masterGain.connect(this.ctx.destination)
      }
    }
    if (!this.ctx || !this.masterGain) return null
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return { ctx: this.ctx, out: this.masterGain }
  }

  private applyEnabledInternal(val: boolean) {
    if (isHiddenCursorWebview()) {
      this.enabled = false
      nukeAllActiveAudio()
      return
    }

    this.enabled = val
    try {
      localStorage.setItem(STORAGE_MUTE_KEY, String(val))
    } catch {}

    this.listeners.forEach((cb) => cb(val))

    if (!val) {
      this.stopAllMoodAudio()
      if (this.masterGain && this.ctx) {
        try {
          this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime)
          this.masterGain.disconnect()
        } catch {}
        this.masterGain = null
      }
      if (this.ctx) {
        try {
          this.ctx.suspend().catch(() => {})
          this.ctx.close().catch(() => {})
        } catch {}
        this.ctx = null
      }
      nukeAllActiveAudio()
    } else {
      this.applyMoodAudio(this.currentMood)
    }
  }

  public setEnabled(val: boolean) {
    this.applyEnabledInternal(val)
    try {
      this.channel?.postMessage({ type: 'SET_ENABLED', enabled: val })
    } catch {}
    fetch('/api/audio-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: !val }),
    }).catch(() => {})
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public destroy() {
    this.applyEnabledInternal(false)
  }

  public setMood(mood: AudioMood) {
    if (this.currentMood === mood && (this.musicTimer || this.thunderTimer || mood === 'silent')) {
      return
    }
    this.currentMood = mood
    if (!this.enabled) {
      this.stopAllMoodAudio()
      return
    }
    this.applyMoodAudio(mood)
  }

  private stopAllMoodAudio() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer)
      getRegistry().timers.delete(this.musicTimer)
      this.musicTimer = null
    }
    if (this.thunderTimer) {
      clearInterval(this.thunderTimer)
      getRegistry().timers.delete(this.thunderTimer)
      this.thunderTimer = null
    }
    const reg = getRegistry()
    reg.nodes.forEach((n) => {
      try {
        n.stop(0)
      } catch {}
      try {
        n.disconnect()
      } catch {}
    })
    reg.nodes.clear()
  }

  private registerSource(node: AudioScheduledSourceNode) {
    const reg = getRegistry()
    reg.nodes.add(node)
    node.onended = () => {
      reg.nodes.delete(node)
    }
  }

  private applyMoodAudio(mood: AudioMood) {
    this.stopAllMoodAudio()
    if (!this.enabled || mood === 'silent' || isHiddenCursorWebview()) return

    const audio = this.getContext()
    if (!audio) return

    if (mood === 'studying') {
      this.playSoothingPadChord()
      this.musicTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'studying') {
          this.playSoothingPadChord()
        }
      }, 4200)
      getRegistry().timers.add(this.musicTimer)
    } else if (mood === 'storm') {
      this.playThunderCrack()
      this.thunderTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'storm') {
          this.playThunderCrack()
        }
      }, 3800)
      getRegistry().timers.add(this.thunderTimer)
    }
  }

  // Soothing warm singing-bowl + gentle harp arpeggio in clear middle register
  private playSoothingPadChord() {
    if (!this.enabled || this.currentMood !== 'studying' || isHiddenCursorWebview()) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
      return
    }

    const chord = SOOTHING_CHORDS[this.chordIndex % SOOTHING_CHORDS.length]
    this.chordIndex++
    const now = ctx.currentTime

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      const startOffset = i * 0.18
      osc.frequency.setValueAtTime(freq, now + startOffset)

      gain.gain.setValueAtTime(0.0001, now + startOffset)
      gain.gain.linearRampToValueAtTime(0.055 / (1 + i * 0.2), now + startOffset + 0.9)
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 4.0)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)

      osc.start(now + startOffset)
      osc.stop(now + 4.1)
    })
  }

  // Deep thunder rumble when RED / not studying
  public playThunderCrack() {
    if (!this.enabled || isHiddenCursorWebview()) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const bufferSize = Math.floor(ctx.sampleRate * 1.4)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      const env = i < ctx.sampleRate * 0.06 ? 1.0 : Math.exp(-i / (ctx.sampleRate * 0.45))
      data[i] = (Math.random() * 2 - 1) * env
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(360, now)
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.3)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.35, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    this.registerSource(noise)

    noise.start(now)
    noise.stop(now + 1.4)
  }

  public playLeafSprout() {
    if (!this.enabled || isHiddenCursorWebview()) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio

    const notes = [523.25, 659.25, 783.99]
    const now = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.08)

      gain.gain.setValueAtTime(0.0001, now + idx * 0.08)
      gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.08 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)
      osc.start(now + idx * 0.08)
      osc.stop(now + idx * 0.08 + 0.48)
    })
  }

  public playClipboardPenalty() {
    if (!this.enabled || isHiddenCursorWebview()) return
    this.playThunderCrack()
  }

  public playThunderClimax() {
    if (!this.enabled || isHiddenCursorWebview()) return
    this.playThunderCrack()
  }

  public playGoldenFanfare() {
    if (!this.enabled || isHiddenCursorWebview()) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const chord = [261.63, 329.63, 392.0, 523.25]
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const t0 = now + idx * 0.09
      osc.frequency.setValueAtTime(freq, t0)

      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.linearRampToValueAtTime(0.07, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)
      osc.start(t0)
      osc.stop(t0 + 0.95)
    })
  }

  public playPomodoroBell() {
    if (!this.enabled || isHiddenCursorWebview()) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(528.0, now)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)

    osc.connect(gain)
    gain.connect(out)
    this.registerSource(osc)

    osc.start(now)
    osc.stop(now + 1.55)
  }

  public playSoftClick() {}
}

export const soundFX = new SoundEngine()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    soundFX.destroy()
    nukeAllActiveAudio()
  })
}
