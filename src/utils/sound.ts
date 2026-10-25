// Soothing Web Audio Engine with Cross-Tab Mute Sync (BroadcastChannel) & Zero Overlap

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
  if (!window.__leafAudioRegistry.nodes) {
    window.__leafAudioRegistry.nodes = new Set()
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

// Immediately silence any leftover audio on module load
nukeAllActiveAudio()

// Warm, soothing pentatonic singing-bowl / ambient pad frequencies (C major pentatonic in warm middle register)
const SOOTHING_CHORDS: number[][] = [
  [130.81, 196.0, 246.94, 293.66], // C3, G3, B3, D4
  [110.0, 164.81, 196.0, 261.63],  // A2, E3, G3, C4
  [87.31, 130.81, 164.81, 220.0],  // F2, C3, E3, A3
  [98.0, 146.83, 196.0, 246.94],   // G2, D3, G3, B3
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

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_MUTE_KEY)
      if (saved === 'false') {
        this.enabled = false
      }

      try {
        this.channel = new BroadcastChannel('leaf_me_alone_audio_sync')
        this.channel.onmessage = (ev) => {
          if (ev.data?.type === 'SET_ENABLED') {
            this.applyEnabledInternal(Boolean(ev.data.enabled))
          }
        }
      } catch {}
    }
  }

  private getContext(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled) return null
    if ((!this.ctx || this.ctx.state === 'closed') && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
        getRegistry().contexts.add(this.ctx)
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime)
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
    this.enabled = val
    try {
      localStorage.setItem(STORAGE_MUTE_KEY, String(val))
    } catch {}

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
    // Also broadcast to any other open localhost:5173 tabs so they mute immediately too!
    try {
      this.channel?.postMessage({ type: 'SET_ENABLED', enabled: val })
    } catch {}
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
    // Stop every currently playing oscillator/buffer so studying music and storm NEVER overlap!
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
    if (!this.enabled || mood === 'silent') return

    const audio = this.getContext()
    if (!audio) return

    if (mood === 'studying') {
      // Only play soothing warm sine pad (NO rain noise!)
      this.playSoothingPadChord()
      this.musicTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'studying') {
          this.playSoothingPadChord()
        }
      }, 4500)
      getRegistry().timers.add(this.musicTimer)
    } else if (mood === 'storm') {
      // Stop soothing music completely and play thunder rumble
      this.playThunderCrack()
      this.thunderTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'storm') {
          this.playThunderCrack()
        }
      }, 4000)
      getRegistry().timers.add(this.thunderTimer)
    }
  }

  // Pure, warm, soothing sine-wave ambient pad (slow 1.2s fade-in, gentle volume, zero harsh harmonics)
  private playSoothingPadChord() {
    if (!this.enabled || this.currentMood !== 'studying') return
    const audio = this.getContext()
    if (!audio || audio.ctx.state !== 'running') return
    const { ctx, out } = audio

    const chord = SOOTHING_CHORDS[this.chordIndex % SOOTHING_CHORDS.length]
    this.chordIndex++
    const now = ctx.currentTime

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      // Pure sine wave for soothing singing-bowl / warm ambient pad tone
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)

      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.018 / (1 + i * 0.25), now + 1.4)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.3)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)

      osc.start(now)
      osc.stop(now + 4.4)
    })
  }

  // Deep low-pitched thunder rumble when not studying
  public playThunderCrack() {
    if (!this.enabled) return
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
    filter.frequency.setValueAtTime(320, now)
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.3)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.28, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    this.registerSource(noise)

    noise.start(now)
    noise.stop(now + 1.4)
  }

  public playLeafSprout() {
    if (!this.enabled) return
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
      gain.gain.linearRampToValueAtTime(0.05, now + idx * 0.08 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)
      osc.start(now + idx * 0.08)
      osc.stop(now + idx * 0.08 + 0.48)
    })
  }

  public playClipboardPenalty() {
    if (!this.enabled) return
    this.playThunderCrack()
  }

  public playThunderClimax() {
    if (!this.enabled) return
    this.playThunderCrack()
  }

  public playGoldenFanfare() {
    if (!this.enabled) return
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
      gain.gain.linearRampToValueAtTime(0.06, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9)

      osc.connect(gain)
      gain.connect(out)
      this.registerSource(osc)
      osc.start(t0)
      osc.stop(t0 + 0.95)
    })
  }

  public playPomodoroBell() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(528.0, now) // 528Hz soothing chime

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)

    osc.connect(gain)
    gain.connect(out)
    this.registerSource(osc)

    osc.start(now)
    osc.stop(now + 1.55)
  }

  public playSoftClick() {
    // Silent UI click so clicking buttons never makes unwanted noise
  }
}

export const soundFX = new SoundEngine()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    soundFX.destroy()
    nukeAllActiveAudio()
  })
}
