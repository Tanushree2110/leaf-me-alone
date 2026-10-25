// Procedural Web Audio API Sound Effects & Cozy Ambient Rain Engine

class SoundEngine {
  private ctx: AudioContext | null = null
  private enabled = true
  private ambientRainNode: AudioNode | null = null
  private ambientGain: GainNode | null = null
  private isRainPlaying = false

  private getContext(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    if (!val && this.isRainPlaying) {
      this.stopAmbientRain()
    }
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  // 1. Warm botanical marimba/harp arpeggio when a new leaf or flower sprouts
  public playLeafSprout() {
    const ctx = this.getContext()
    if (!ctx) return

    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    const now = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.065)

      gain.gain.setValueAtTime(0.001, now + idx * 0.065)
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.065 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.45)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.065)
      osc.stop(now + idx * 0.065 + 0.48)
    })
  }

  // 2. Sharp double pen-click + disappointed low note when roommate pulls out clipboard
  public playClipboardPenalty() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    // Pen click-click
    ;[0, 0.09].forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1400, now + offset)
      osc.frequency.exponentialRampToValueAtTime(420, now + offset + 0.03)

      gain.gain.setValueAtTime(0.15, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.035)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.04)
    })

    // Disappointed descending minor interval (Eb4 -> C4 -> Ab3)
    const sadNotes = [311.13, 261.63, 207.65]
    sadNotes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'

      // Lowpass filter for warm muted brass feel
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(650, now)

      const t0 = now + 0.18 + idx * 0.14
      osc.frequency.setValueAtTime(freq, t0)

      gain.gain.setValueAtTime(0.001, t0)
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.35)
    })
  }

  // 3. Thunderstorm rumble for "The Last Leaf" Climax
  public playThunderClimax() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    // Filtered noise burst for distant thunder + dramatic piano minor chord
    const bufferSize = ctx.sampleRate * 1.2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(190, now)
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.1)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.01, now)
    gain.gain.linearRampToValueAtTime(0.22, now + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 1.2)
  }

  // 4. Triumphant O. Henry Golden Leaf / Pomodoro Complete Fanfare
  public playGoldenFanfare() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const chord = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5] // Cmaj9 shimmer
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
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.9)
    })
  }

  // 5. Gentle Zen Bell for Pomodoro Start / Break transition
  public playPomodoroBell() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const overtone = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, now) // D5 zen chime
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(1174.66, now)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)

    osc.connect(gain)
    overtone.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    overtone.start(now)
    osc.stop(now + 1.45)
    overtone.stop(now + 1.45)
  }

  // 6. Soft UI tick for switching allowed tabs or unlocking upgrades
  public playSoftClick() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.04)

    gain.gain.setValueAtTime(0.06, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.05)
  }

  // 7. Toggleable Cozy Lo-Fi Rain Ambient Loop
  public toggleAmbientRain(forceState?: boolean): boolean {
    const next = forceState !== undefined ? forceState : !this.isRainPlaying
    if (next) {
      this.startAmbientRain()
    } else {
      this.stopAmbientRain()
    }
    return this.isRainPlaying
  }

  private startAmbientRain() {
    const ctx = this.getContext()
    if (!ctx || this.isRainPlaying) return

    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.02
      b6 = white * 0.115926
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = buffer
    whiteNoise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(950, ctx.currentTime)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.18, ctx.currentTime)

    whiteNoise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    whiteNoise.start()

    this.ambientRainNode = whiteNoise
    this.ambientGain = gain
    this.isRainPlaying = true
  }

  public stopAmbientRain() {
    if (this.ambientRainNode) {
      try {
        ;(this.ambientRainNode as AudioBufferSourceNode).stop()
      } catch {}
      this.ambientRainNode.disconnect()
      this.ambientRainNode = null
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect()
      this.ambientGain = null
    }
    this.isRainPlaying = false
  }
}

export const soundFX = new SoundEngine()
