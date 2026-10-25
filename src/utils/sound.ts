// Procedural Web Audio API Sound Engine with Hardware AudioContext Teardown on Mute & HMR Cleanup

export type AudioMood = 'studying' | 'storm' | 'silent'

interface GlobalAudioRegistry {
  contexts: Set<AudioContext>
  timers: Set<ReturnType<typeof setInterval>>
}

declare global {
  interface Window {
    __leafAudioRegistry?: GlobalAudioRegistry
  }
}

function getRegistry(): GlobalAudioRegistry {
  if (typeof window === 'undefined') {
    return { contexts: new Set(), timers: new Set() }
  }
  if (!window.__leafAudioRegistry) {
    window.__leafAudioRegistry = {
      contexts: new Set(),
      timers: new Set(),
    }
  }
  return window.__leafAudioRegistry
}

// Immediately clean up any orphaned contexts/timers from previous HMR reloads
export function nukeAllActiveAudio() {
  const reg = getRegistry()
  reg.timers.forEach((t) => clearInterval(t))
  reg.timers.clear()
  reg.contexts.forEach((ctx) => {
    try {
      ctx.suspend().catch(() => {})
      ctx.close().catch(() => {})
    } catch {}
  })
  reg.contexts.clear()
}

nukeAllActiveAudio()

const SERENE_CHORDS: number[][] = [
  [261.63, 329.63, 392.0, 493.88, 587.33], // Cmaj9
  [220.0, 261.63, 329.63, 392.0, 493.88],  // Am9
  [174.61, 220.0, 261.63, 329.63, 392.0],  // Fmaj9
  [196.0, 246.94, 293.66, 369.99, 440.0],  // G6/9
]

class SoundEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private enabled = true
  private currentMood: AudioMood = 'studying'
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private thunderTimer: ReturnType<typeof setInterval> | null = null
  private stormNoiseNode: AudioBufferSourceNode | null = null
  private stormGainNode: GainNode | null = null
  private activeNodes: Set<AudioNode> = new Set()
  private chordIndex = 0
  private unlocked = false

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        if (!this.unlocked) {
          this.unlocked = true
          if (this.enabled) {
            this.applyMoodAudio(this.currentMood)
          }
        }
      }
      window.addEventListener('pointerdown', unlock, { passive: true })
      window.addEventListener('keydown', unlock, { passive: true })
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
        this.masterGain.gain.setValueAtTime(1, this.ctx.currentTime)
        this.masterGain.connect(this.ctx.destination)
      }
    }
    if (!this.ctx || !this.masterGain) return null
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return { ctx: this.ctx, out: this.masterGain }
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    if (!val) {
      // Physically disconnect all nodes and close every AudioContext so sound stops 100% guaranteed
      this.stopAllMoodAudio()
      if (this.masterGain) {
        try {
          this.masterGain.disconnect()
        } catch {}
        this.masterGain = null
      }
      if (this.ctx) {
        try {
          this.ctx.close().catch(() => {})
        } catch {}
        this.ctx = null
      }
      nukeAllActiveAudio()
    } else {
      this.applyMoodAudio(this.currentMood)
    }
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public destroy() {
    this.setEnabled(false)
  }

  public setMood(mood: AudioMood) {
    if (
      this.currentMood === mood &&
      (this.musicTimer || this.stormNoiseNode || mood === 'silent')
    ) {
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
    if (this.stormNoiseNode) {
      try {
        this.stormNoiseNode.stop()
      } catch {}
      try {
        this.stormNoiseNode.disconnect()
      } catch {}
      this.stormNoiseNode = null
    }
    if (this.stormGainNode) {
      try {
        this.stormGainNode.disconnect()
      } catch {}
      this.stormGainNode = null
    }
    this.activeNodes.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          ;(node as AudioScheduledSourceNode).stop()
        }
      } catch {}
      try {
        node.disconnect()
      } catch {}
    })
    this.activeNodes.clear()
  }

  private applyMoodAudio(mood: AudioMood) {
    this.stopAllMoodAudio()
    if (!this.enabled || mood === 'silent') return

    const audio = this.getContext()
    if (!audio) return

    if (mood === 'studying') {
      this.playSereneChordSlice()
      this.musicTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'studying') {
          this.playSereneChordSlice()
        }
      }, 3600)
      getRegistry().timers.add(this.musicTimer)
    } else if (mood === 'storm') {
      this.startRoughStormLoop()
      this.playThunderCrack()
      this.thunderTimer = setInterval(() => {
        if (this.enabled && this.currentMood === 'storm') {
          this.playThunderCrack()
        }
      }, 4200)
      getRegistry().timers.add(this.thunderTimer)
    }
  }

  private playSereneChordSlice() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio || audio.ctx.state !== 'running') return
    const { ctx, out } = audio

    const chord = SERENE_CHORDS[this.chordIndex % SERENE_CHORDS.length]
    this.chordIndex++
    const now = ctx.currentTime

    const masterFilter = ctx.createBiquadFilter()
    masterFilter.type = 'lowpass'
    masterFilter.frequency.setValueAtTime(920, now)
    masterFilter.connect(out)
    this.activeNodes.add(masterFilter)

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = i === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(freq, now + i * 0.12)

      gain.gain.setValueAtTime(0.0001, now + i * 0.12)
      gain.gain.linearRampToValueAtTime(0.024, now + i * 0.12 + 0.45)
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 3.5)

      osc.connect(gain)
      gain.connect(masterFilter)
      this.activeNodes.add(osc)
      osc.onended = () => this.activeNodes.delete(osc)
      osc.start(now + i * 0.12)
      osc.stop(now + 3.55)
    })
  }

  private startRoughStormLoop() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio

    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99 * b0 + white * 0.12
      b1 = 0.96 * b1 + white * 0.22
      b2 = 0.85 * b2 + white * 0.35
      output[i] = (b0 + b1 + b2 + white * 0.4) * 0.08
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(750, ctx.currentTime)
    filter.Q.setValueAtTime(0.7, ctx.currentTime)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.28, ctx.currentTime)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    noise.start()

    this.stormNoiseNode = noise
    this.stormGainNode = gain
    this.activeNodes.add(noise)
  }

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
      const env = i < ctx.sampleRate * 0.08 ? 1.0 : Math.exp(-i / (ctx.sampleRate * 0.45))
      data[i] = (Math.random() * 2 - 1) * env
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(880, now)
    filter.frequency.exponentialRampToValueAtTime(95, now + 1.3)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.32, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    this.activeNodes.add(noise)
    noise.onended = () => this.activeNodes.delete(noise)
    noise.start(now)
    noise.stop(now + 1.4)
  }

  public playLeafSprout() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio

    const notes = [523.25, 659.25, 783.99, 1046.5]
    const now = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.065)

      gain.gain.setValueAtTime(0.001, now + idx * 0.065)
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.065 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.45)

      osc.connect(gain)
      gain.connect(out)
      this.activeNodes.add(osc)
      osc.onended = () => this.activeNodes.delete(osc)
      osc.start(now + idx * 0.065)
      osc.stop(now + idx * 0.065 + 0.48)
    })
  }

  public playClipboardPenalty() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    this.playThunderCrack()

    ;[0, 0.09].forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1400, now + offset)
      osc.frequency.exponentialRampToValueAtTime(420, now + offset + 0.03)

      gain.gain.setValueAtTime(0.15, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.035)

      osc.connect(gain)
      gain.connect(out)
      this.activeNodes.add(osc)
      osc.onended = () => this.activeNodes.delete(osc)
      osc.start(now + offset)
      osc.stop(now + offset + 0.04)
    })
  }

  public playThunderClimax() {
    this.playThunderCrack()
  }

  public playGoldenFanfare() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const chord = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5]
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      const t0 = now + idx * 0.075
      osc.frequency.setValueAtTime(freq, t0)

      gain.gain.setValueAtTime(0.001, t0)
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85)

      osc.connect(gain)
      gain.connect(out)
      this.activeNodes.add(osc)
      osc.onended = () => this.activeNodes.delete(osc)
      osc.start(t0)
      osc.stop(t0 + 0.9)
    })
  }

  public playPomodoroBell() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const overtone = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, now)
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(1174.66, now)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)

    osc.connect(gain)
    overtone.connect(gain)
    gain.connect(out)

    this.activeNodes.add(osc)
    this.activeNodes.add(overtone)
    osc.onended = () => this.activeNodes.delete(osc)
    overtone.onended = () => this.activeNodes.delete(overtone)

    osc.start(now)
    overtone.start(now)
    osc.stop(now + 1.45)
    overtone.stop(now + 1.45)
  }

  public playSoftClick() {
    if (!this.enabled) return
    const audio = this.getContext()
    if (!audio) return
    const { ctx, out } = audio
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.04)

    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)

    osc.connect(gain)
    gain.connect(out)
    osc.start(now)
    osc.stop(now + 0.05)
  }
}

export const soundFX = new SoundEngine()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    soundFX.destroy()
    nukeAllActiveAudio()
  })
}
