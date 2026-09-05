(function (root) {
  'use strict';
  class Soundscape {
    constructor() {
      this.context = null;
      this.volume = 0.55;
      this.muted = false;
      this.running = false;
    }
    async start() {
      if (!this.context) {
        const AudioContext = root.AudioContext || root.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        const context = this.context;
        this.master = context.createGain(); this.master.gain.value = 0;
        const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.ratio.value = 5;
        this.master.connect(compressor); compressor.connect(context.destination);
        this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
        this.ambience = context.createGain(); this.ambience.gain.value = 0.035; this.ambience.connect(this.master);
        for (const frequency of [48, 72, 120.4]) {
          const oscillator = context.createOscillator(); oscillator.frequency.value = frequency;
          const gain = context.createGain(); gain.gain.value = frequency === 48 ? 0.48 : 0.16;
          oscillator.connect(gain); gain.connect(this.ambience); oscillator.start();
        }
        const air = context.createBufferSource(); air.buffer = this.noiseBuffer; air.loop = true;
        const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 180;
        const airGain = context.createGain(); airGain.gain.value = 0.24;
        air.connect(filter); filter.connect(airGain); airGain.connect(this.ambience); air.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.running = true; this.applyVolume();
    }
    applyVolume() {
      if (!this.context) return;
      this.master.gain.setTargetAtTime(this.muted || !this.running ? 0 : this.volume * 0.64, this.context.currentTime, 0.07);
    }
    pause() { this.running = false; this.applyVolume(); }
    setVolume(volume) { this.volume = volume; this.applyVolume(); }
    setMuted(muted) { this.muted = muted; this.applyVolume(); }
    tone(frequency, duration, gain = 0.1, type = 'sine', endFrequency = frequency, pan = 0, delay = 0) {
      if (!this.context || !this.running || this.muted) return;
      const context = this.context; const now = context.currentTime + delay;
      const oscillator = context.createOscillator(); const envelope = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
      envelope.gain.setValueAtTime(0.001, now); envelope.gain.exponentialRampToValueAtTime(Math.max(0.002, gain), now + 0.006); envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(envelope); this.route(envelope, pan); oscillator.start(now); oscillator.stop(now + duration + 0.02);
    }
    route(source, pan) {
      if (this.context.createStereoPanner) {
        const panner = this.context.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, pan)); source.connect(panner); panner.connect(this.master);
      } else source.connect(this.master);
    }
    noise(duration, gain, frequency = 1000, pan = 0, type = 'lowpass', delay = 0) {
      if (!this.context || !this.running || this.muted) return;
      const context = this.context; const now = context.currentTime + delay;
      const noise = context.createBufferSource(); noise.buffer = this.noiseBuffer;
      const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency;
      const envelope = context.createGain(); envelope.gain.setValueAtTime(0.001, now); envelope.gain.exponentialRampToValueAtTime(Math.max(0.002, gain), now + 0.004); envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      noise.connect(filter); filter.connect(envelope); this.route(envelope, pan); noise.start(now, Math.random() * 0.7); noise.stop(now + duration + 0.02);
    }
    fire() { this.noise(0.16, 0.45, 3100); this.tone(140, 0.24, 0.55, 'sine', 43); this.tone(980, 0.1, 0.09, 'triangle', 150); this.noise(0.34, 0.05, 640, -0.5, 'lowpass', 0.1); }
    step(quiet, sprint) { this.noise(0.11, quiet ? 0.035 : sprint ? 0.12 : 0.085, 560); this.tone(95, 0.09, quiet ? 0.016 : 0.06, 'sine', 48); }
    remoteStep(pan, strength) { this.noise(0.14, 0.07 * strength, 330, pan); this.tone(80, 0.1, 0.025 * strength, 'sine', 42, pan); }
    warning(pan) { this.tone(430, 0.24, 0.1, 'triangle', 790, pan); this.noise(0.28, 0.06, 1600, pan); }
    impact(damage, pan) { this.noise(0.26, damage ? 0.33 : 0.12, damage ? 760 : 350, pan); this.tone(75, 0.34, damage ? 0.46 : 0.18, 'sine', 30, pan); }
    hit() { this.tone(860, 0.07, 0.12, 'sine', 760); this.tone(1290, 0.15, 0.1, 'sine', 1190, 0, 0.06); }
    scan() { this.tone(240, 0.55, 0.1, 'sine', 1040); this.tone(1200, 0.4, 0.07, 'sine', 920, 0, 0.23); }
    contact() { this.tone(620, 0.09, 0.055, 'sine', 790); }
    decoy() { this.tone(340, 0.14, 0.08, 'triangle', 220); this.tone(420, 0.16, 0.07, 'sine', 240, 0, 0.14); }
    reload() { this.noise(0.07, 0.14, 2400); this.noise(0.08, 0.12, 1800, 0, 'highpass', 0.53); this.noise(0.11, 0.19, 2200, 0, 'highpass', 1.27); this.tone(260, 0.12, 0.08, 'triangle', 120, 0, 1.3); }
    empty() { this.noise(0.045, 0.1, 2100, 0, 'highpass'); }
    click() { this.tone(650, 0.06, 0.065, 'sine', 570); }
    finish(won) { const notes = won ? [330, 440, 554, 660] : [330, 294, 220]; notes.forEach((note, index) => this.tone(note, 0.8, 0.11, 'sine', note * 0.996, 0, index * 0.16)); }
  }
  root.Blindspot.Soundscape = Soundscape;
})(window);
