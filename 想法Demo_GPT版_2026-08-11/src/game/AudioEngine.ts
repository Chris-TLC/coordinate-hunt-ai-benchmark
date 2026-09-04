type ToneOptions = {
  frequency: number
  duration: number
  gain: number
  type?: OscillatorType
  endFrequency?: number
}

export class AudioEngine {
  private context: AudioContext | null = null
  private enabled = true
  private master: GainNode | null = null
  private hum: { oscillator: OscillatorNode; gain: GainNode } | null = null

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.38 : 0, this.master.context.currentTime, 0.03)
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.gain.value = this.enabled ? 0.38 : 0
      this.master.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  startHum() {
    if (!this.context || !this.master || this.hum) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 43
    gain.gain.value = 0.025
    oscillator.connect(gain)
    gain.connect(this.master)
    oscillator.start()
    this.hum = { oscillator, gain }
  }

  private tone({ frequency, duration, gain, type = 'sine', endFrequency }: ToneOptions) {
    if (!this.enabled || !this.context || !this.master) return
    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
    envelope.gain.setValueAtTime(gain, now)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(envelope)
    envelope.connect(this.master)
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  click() {
    this.tone({ frequency: 420, endFrequency: 610, duration: 0.07, gain: 0.08, type: 'triangle' })
  }

  fire() {
    this.tone({ frequency: 128, endFrequency: 44, duration: 0.18, gain: 0.42, type: 'sawtooth' })
    this.tone({ frequency: 860, endFrequency: 170, duration: 0.08, gain: 0.14, type: 'square' })
  }

  enemyFire() {
    this.tone({ frequency: 92, endFrequency: 54, duration: 0.25, gain: 0.18, type: 'triangle' })
  }

  scan() {
    this.tone({ frequency: 230, endFrequency: 920, duration: 0.55, gain: 0.14, type: 'sine' })
  }

  hitConfirm() {
    this.tone({ frequency: 740, duration: 0.08, gain: 0.16, type: 'square' })
    window.setTimeout(() => this.tone({ frequency: 980, duration: 0.11, gain: 0.14, type: 'triangle' }), 70)
  }

  hurt() {
    this.tone({ frequency: 76, endFrequency: 34, duration: 0.42, gain: 0.38, type: 'sawtooth' })
  }

  countdown(final = false) {
    this.tone({ frequency: final ? 880 : 510, duration: final ? 0.2 : 0.11, gain: 0.12, type: 'square' })
  }

  dispose() {
    this.hum?.oscillator.stop()
    this.hum = null
    void this.context?.close()
    this.context = null
    this.master = null
  }
}
