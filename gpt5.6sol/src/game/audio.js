export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.ambient = null;
    this.lastStep = 0;
  }

  start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.context.destination);
      this.createAmbient();
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  createAmbient() {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let index = 0; index < length; index += 1) {
      value = (value * 0.985) + ((Math.random() * 2 - 1) * 0.015);
      data[index] = value;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer; source.loop = true;
    filter.type = 'lowpass'; filter.frequency.value = 280;
    gain.gain.value = 0.055;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.ambient = source;
  }

  tone({ frequency = 220, endFrequency = frequency, duration = 0.15, gain = 0.2, type = 'sine', pan = 0, delay = 0 }) {
    if (!this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    oscillator.connect(envelope).connect(panner).connect(this.master);
    oscillator.start(now); oscillator.stop(now + duration + 0.02);
  }

  noise(duration = 0.15, gainAmount = 0.15, cutoff = 1400, pan = 0, delay = 0) {
    if (!this.context) return;
    const samples = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, samples, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < samples; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - (index / samples));
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.value = gainAmount; panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(panner).connect(this.master);
    source.start(this.context.currentTime + delay);
  }

  fire() {
    this.tone({ frequency: 88, endFrequency: 34, duration: 0.28, gain: 0.52, type: 'sawtooth' });
    this.noise(0.18, 0.34, 2100);
    this.tone({ frequency: 880, endFrequency: 110, duration: 0.12, gain: 0.13, type: 'square', delay: 0.015 });
  }

  enemyFire(pan = 0) {
    this.tone({ frequency: 145, endFrequency: 52, duration: 0.34, gain: 0.24, type: 'sawtooth', pan });
    this.noise(0.21, 0.2, 920, pan);
  }

  hit() {
    this.tone({ frequency: 190, endFrequency: 62, duration: 0.42, gain: 0.46, type: 'square' });
    this.noise(0.24, 0.32, 620);
  }

  confirm() {
    this.tone({ frequency: 620, endFrequency: 980, duration: 0.16, gain: 0.18, type: 'sine' });
    this.tone({ frequency: 930, endFrequency: 1240, duration: 0.18, gain: 0.1, type: 'sine', delay: 0.07 });
  }

  miss() { this.tone({ frequency: 220, endFrequency: 125, duration: 0.11, gain: 0.08, type: 'triangle' }); }
  dry() { this.tone({ frequency: 95, endFrequency: 70, duration: 0.07, gain: 0.12, type: 'square' }); }
  reload() { [0, 0.16, 0.34].forEach((delay, index) => this.tone({ frequency: 210 + (index * 90), duration: 0.065, gain: 0.09, type: 'square', delay })); }
  step(sprint = false) { this.noise(0.07, sprint ? 0.11 : 0.065, sprint ? 460 : 340, 0); }
  remoteStep(pan = 0, urgent = false) { this.noise(0.12, urgent ? 0.13 : 0.07, 560, pan); }
  nearMiss(pan = 0) { this.noise(0.19, 0.31, 4500, pan); this.tone({ frequency: 1300, endFrequency: 180, duration: 0.2, gain: 0.11, type: 'sawtooth', pan }); }
  scan() { this.tone({ frequency: 230, endFrequency: 1250, duration: 0.7, gain: 0.16, type: 'sine' }); }
  detected() { this.tone({ frequency: 1100, endFrequency: 360, duration: 0.36, gain: 0.17, type: 'square' }); }
  win() { [0, 0.13, 0.27].forEach((delay, i) => this.tone({ frequency: [330, 495, 660][i], endFrequency: [360, 540, 760][i], duration: 0.4, gain: 0.13, type: 'sine', delay })); }
  lose() { this.tone({ frequency: 260, endFrequency: 58, duration: 1.1, gain: 0.21, type: 'sawtooth' }); }
}
