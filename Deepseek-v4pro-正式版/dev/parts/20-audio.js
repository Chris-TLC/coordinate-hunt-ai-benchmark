'use strict';
/* ================= 音频:WebAudio 全合成(零素材) ================= */

const AudioSys = {
  ctx: null, master: null, comp: null, noiseBuf: null,
  volume: 0.9, muted: false, started: false,
  humGain: null, humFilter: null, facing: 0,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.ratio.value = 6;
      this.comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.comp);

      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.startAmbient();
      this.started = true;
    } catch (e) { /* 无音频环境则静默 */ }
  },

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; return this.muted; },

  /* ---------- 基础合成原语 ---------- */
  now() { return this.ctx ? this.ctx.currentTime : 0; },

  out(pan) {
    if (pan !== undefined && Math.abs(pan) > 0.01) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.master);
      return p;
    }
    return this.master;
  },

  tone(type, f0, f1, dur, vol, pan, when) {
    if (!this.ctx) return;
    const t = (when === undefined ? this.now() : when);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(pan));
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(f0, f1, dur, vol, q, pan, when, type) {
    if (!this.ctx) return;
    const t = (when === undefined ? this.now() : when);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(Math.max(40, f0), t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    f.Q.value = q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(pan));
    src.start(t); src.stop(t + dur + 0.05);
  },

  thump(dur, vol, pan, when) {
    this.tone('sine', 95, 42, dur, vol, pan, when);
    this.noise(140, 90, dur * 1.15, vol * 0.5, 0.8, pan, when, 'lowpass');
  },

  /* ---------- 氛围 ---------- */
  startAmbient() {
    if (!this.ctx || this.humGain) return;
    // 房间底噪
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    // 低频轰
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 52;
    const og = this.ctx.createGain(); og.gain.value = 0.028;
    o.connect(og); og.connect(this.master); o.start();
    // 巨幕电流嗡(音量随朝向变化)
    const h = this.ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 120;
    const h2 = this.ctx.createOscillator(); h2.type = 'sine'; h2.frequency.value = 240;
    this.humFilter = this.ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass'; this.humFilter.frequency.value = 300; this.humFilter.Q.value = 2;
    this.humGain = this.ctx.createGain(); this.humGain.gain.value = 0;
    const hg2 = this.ctx.createGain(); hg2.gain.value = 0.35;
    h.connect(this.humFilter); h2.connect(hg2); hg2.connect(this.humFilter);
    this.humFilter.connect(this.humGain); this.humGain.connect(this.master);
    h.start(); h2.start();
  },

  /* 每帧更新:面向巨幕时嗡声变大 */
  setScreenFacing(f) {
    this.facing = f;
    if (this.humGain && this.ctx) {
      const target = 0.008 + Math.max(0, f) * 0.028;
      this.humGain.gain.setTargetAtTime(target, this.now(), 0.15);
    }
  },

  /* ---------- 界面 ---------- */
  click() { this.noise(1600, 2400, 0.06, 0.25, 1.5); this.tone('sine', 900, 700, 0.05, 0.1); },
  hover() { this.noise(2000, 2600, 0.04, 0.08, 3); },
  countBeep(i) { this.tone('sine', 520, 520, 0.14, 0.3); if (i === 0) this.tone('sine', 760, 760, 0.3, 0.34); },
  goSting() { this.tone('sawtooth', 220, 440, 0.35, 0.16); this.noise(400, 3000, 0.3, 0.12, 1.2); },
  tick() { this.tone('sine', 880, 880, 0.05, 0.12); },

  /* ---------- 脚步 ---------- */
  ownStep(run) {
    if (run) this.thump(0.14, 0.5);
    else this.thump(0.16, 0.3);
  },
  /* 透过巨幕传来的敌方脚步:pan=左右, loud=0..1, muffle=是否被遮挡 */
  enemyStep(run, loud, muffle, pan) {
    const vol = 0.14 * (0.25 + loud * 0.75);
    this.thump(run ? 0.13 : 0.16, vol * (muffle ? 0.45 : 1), pan);
    this.noise(muffle ? 260 : 520, muffle ? 180 : 380, 0.1, vol * 0.5, 1.4, pan, undefined, 'bandpass');
  },

  /* ---------- 枪械 ---------- */
  gunshot() {
    this.noise(3000, 220, 0.16, 0.5, 0.9);
    this.tone('sine', 170, 55, 0.14, 0.55);
    this.tone('sawtooth', 640, 180, 0.09, 0.14);
    this.noise(6000, 4000, 0.35, 0.1, 1, undefined, this.now() + 0.05, 'bandpass'); // 余响
  },
  impactDistant(hit) {
    if (hit) { this.noise(900, 300, 0.14, 0.4, 1.2); this.tone('sine', 220, 90, 0.16, 0.4); this.tone('triangle', 1200, 700, 0.09, 0.16); }
    else { this.noise(1400, 500, 0.12, 0.3, 1.4); this.tone('sine', 160, 70, 0.14, 0.3); }
  },
  /* 命中敌人(命中确认) */
  hitConfirm() {
    this.tone('sine', 660, 660, 0.09, 0.4);
    this.tone('sine', 990, 990, 0.14, 0.32, undefined, this.now() + 0.08);
    this.noise(2000, 900, 0.12, 0.3, 1.6);
    this.thump(0.2, 0.5);
  },
  /* 自己被击中 */
  hitTaken() {
    this.thump(0.3, 0.85);
    this.noise(500, 120, 0.3, 0.6, 0.7);
    this.tone('sawtooth', 200, 60, 0.25, 0.3);
  },
  nearMiss(pan) {
    this.noise(2600, 420, 0.22, 0.34, 2.5, pan, undefined, 'bandpass');
  },
  /* 敌方射击落入我的房间(空间化) */
  incomingShot(dist, pan, hit) {
    const k = clamp(1.1 - dist / 16, 0.25, 1);
    if (hit) this.hitTaken();
    else {
      this.noise(1800, 300, 0.18, 0.4 * k, 1.2, pan);
      this.tone('sine', 150, 60, 0.18, 0.3 * k, pan);
    }
  },

  /* ---------- 侦测 ---------- */
  scanCharge() { this.tone('sine', 300, 950, C.SCAN_DELAY, 0.14); },
  scanPing() {
    this.tone('sine', 1150, 1150, 0.5, 0.3);
    this.noise(1500, 800, 0.4, 0.14, 2, undefined, undefined, 'bandpass');
  },
  scanFound() {
    this.tone('sine', 880, 880, 0.1, 0.34);
    this.tone('sine', 1175, 1175, 0.16, 0.34, undefined, this.now() + 0.11);
    this.tone('sine', 1568, 1568, 0.2, 0.26, undefined, this.now() + 0.24);
  },
  scanEmpty() { this.tone('sine', 300, 210, 0.18, 0.26); },
  /* 敌方侦测脉冲落在我房间(空间化) */
  scanIncoming(dist, pan, hitMe) {
    const k = clamp(1.1 - dist / 16, 0.2, 1);
    this.tone('sine', 900, 1400, 0.5, 0.24 * k, pan);
    if (hitMe) { this.tone('sine', 1400, 900, 0.5, 0.3 * k, pan); this.noise(1200, 600, 0.5, 0.2 * k, 2, pan); }
  },
  /* 地图上出现新痕迹的轻提示 */
  traceTick(pan) { this.tone('sine', 1900, 1500, 0.06, 0.05, pan); },

  /* ---------- 情绪 ---------- */
  heartbeat(strength) {
    this.thump(0.12, 0.28 * strength, undefined, this.now());
    this.thump(0.1, 0.18 * strength, undefined, this.now() + 0.18);
  },
  globalSweep() {
    this.noise(300, 2400, 0.9, 0.22, 1.2, undefined, undefined, 'bandpass');
    this.tone('sawtooth', 180, 720, 0.9, 0.1);
    this.tone('sine', 520, 1040, 0.8, 0.18);
  },
  win() {
    [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.22, undefined, this.now() + i * 0.13));
    this.noise(800, 3000, 1.4, 0.06, 0.8, undefined, this.now(), 'bandpass');
  },
  lose() {
    [233, 196, 147].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.8, 0.16, undefined, this.now() + i * 0.28));
  },
  draw() { this.tone('sine', 330, 330, 0.5, 0.2); this.tone('sine', 262, 262, 0.7, 0.2, undefined, this.now() + 0.25); },
};
