'use strict';
/* ================= 主程序:启动 / 输入 / 循环 ================= */

const Main = {
  state: 'menu',          // menu | playing | paused | ended | spectate
  diffKey: 'normal',
  sens: 1,
  paused: false,
  canvas: null, renderer: null, match: null, attract: null,
  keys: {}, locked: false,
  bob: 0, sway: 0, swayT: 0, swayX: 0,
  emaMs: 16.6, lastT: 0,
  hintI: -1, hintT: 0, hintsDone: false,
  hbT: 0, endDelayT: 0,
  attractCamYaw: 0,
  spectate: false, skipT: 0,

  boot() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    HUD.init(this);

    const params = new URLSearchParams(location.search);
    this.spectate = params.get('spectate') === '1';
    const skip = parseFloat(params.get('skip') || '0');

    window.addEventListener('resize', () => this.doResize());
    this.doResize();

    /* 输入 */
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.swayX += e.movementX;
      const k = 0.0022 * this.sens;
      const p = this.match && this.match.player ? this.match.player : null;
      if (p) {
        p.yaw -= e.movementX * k;
        p.pitch = clamp(p.pitch - e.movementY * k, -1.45, 1.45);
      }
    });
    this.canvas.addEventListener('mousedown', e => {
      if (!this.locked || this.state !== 'playing') return;
      const m = this.match;
      if (e.button === 0) {
        const r = m.playerFire();
        if (r === 'offscreen') HUD.toast('瞄准巨幕才能开火', 900);
      } else if (e.button === 2) {
        const r = m.playerScan();
        if (r === 'offscreen') HUD.toast('瞄准巨幕才能侦测', 900);
      }
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.state === 'playing') {
        if (!this.locked && !this.paused) this.pauseGame();
        else if (this.locked && this.paused) this.resume();
      }
    });

    /* 菜单演示(幕后 AI 对战) */
    this.attract = new Match(this.diffKey);
    this.attract.obs = new Brain(this.diffKey);

    if (params.get('selfcheck') === '1') {
      this.selfCheck(parseFloat(params.get('skip') || '0'));
      return;
    }
    if (params.get('probe') === '1') {
      this.probe();
      return;
    }

    if (this.spectate) {
      this.match = new Match(this.diffKey);
      this.match.obs = new Brain(this.diffKey);
      this.state = 'spectate';
      HUD.hideAll();
      if (skip > 0) {
        const n = Math.floor(skip * 60);
        for (let i = 0; i < n; i++) this.match.step(1 / 60);
      }
    } else {
      HUD.showMenu();
    }

    requestAnimationFrame(t => this.loop(t));
  },

  /* ---------- 无头自检:渲染若干帧后采样画布像素,报告区域统计 ---------- */
  selfCheck(skip) {
    this.match = new Match(this.diffKey);
    this.match.obs = new Brain(this.diffKey);
    this.state = 'spectate';
    HUD.hideAll();
    if (skip > 0) {
      const n = Math.floor(skip * 60);
      for (let i = 0; i < n; i++) this.match.step(1 / 60);
    }
    let frames = 0;
    let acc = 0;
    const t0 = performance.now();
    const probe = () => {
      frames++;
      this.match.step(1 / 60);
      if (this.match.state === 'end') {
        this.match = new Match(this.diffKey);
        this.match.obs = new Brain(this.diffKey);
      }
      const st = this.buildState(this.match);
      const r0 = performance.now();
      this.renderer.render(st);
      acc += performance.now() - r0;
      HUD.update(this.match);
      if (frames < 80) { requestAnimationFrame(probe); return; }
      /* 采样 */
      const ctx = this.renderer.ctx, W = this.renderer.W, H = this.renderer.H;
      const img = ctx.getImageData(0, 0, W, H).data;
      let total = [0, 0, 0], black = 0, blue = 0, n = img.length / 4;
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2];
        total[0] += r; total[1] += g; total[2] += b;
        if (r + g + b < 24) black++;
        if (b > r + 20 && b > 90) blue++;
      }
      const mean = [total[0] / n, total[1] / n, total[2] / n].map(v => v.toFixed(0));
      /* 6×4 区域均值 */
      let grid = [];
      for (let ry = 0; ry < 4; ry++) {
        let row = [];
        for (let rx = 0; rx < 6; rx++) {
          let s = [0, 0, 0], c = 0;
          for (let y = Math.floor(ry * H / 4); y < Math.floor((ry + 1) * H / 4); y += 4)
            for (let x = Math.floor(rx * W / 6); x < Math.floor((rx + 1) * W / 6); x += 4) {
              const i = (y * W + x) * 4;
              s[0] += img[i]; s[1] += img[i + 1]; s[2] += img[i + 2]; c++;
            }
          row.push(s.map(v => Math.round(v / c)).join(','));
        }
        grid.push(row.join(' | '));
      }
      const report = {
        state: this.match.state, timeLeft: Math.round(this.match.timeLeft),
        renderMs: (acc / frames).toFixed(1),
        fps: (frames / ((performance.now() - t0) / 1000)).toFixed(1),
        meanRGB: mean.join(','),
        blackPct: (black / n * 100).toFixed(1),
        bluePct: (blue / n * 100).toFixed(1),
        pShots: this.match.stats.pShots, eShots: this.match.stats.eShots,
        pHits: this.match.stats.pHits, eHits: this.match.stats.eHits,
        grid,
      };
      const pre = document.createElement('pre');
      pre.id = 'selfcheck';
      pre.textContent = JSON.stringify(report, null, 1);
      document.body.appendChild(pre);
      document.title = 'SELFCHECK ' + report.fps + 'fps ' + report.renderMs + 'ms ' + report.meanRGB;
      console.log('SELFCHECK_REPORT ' + JSON.stringify(report));
    };
    requestAnimationFrame(probe);
  },

  /* ---------- 无头探针:固定相机采样已知像素,验证投影与巨幕映射 ---------- */
  probe() {
    const R = this.renderer;
    const out = {};
    const px = (ctx, fx, fy) => {
      const d = ctx.getImageData(Math.floor(fx * ctx.canvas.width), Math.floor(fy * ctx.canvas.height), 1, 1).data;
      return d[0] + ',' + d[1] + ',' + d[2];
    };
    const sample = (m, camX, camY, camZ, yaw, pitch) => {
      m.player.x = camX; m.player.z = camZ; m.player.yaw = yaw; m.player.pitch = pitch;
      m.aim.valid = false;
      R.render(this.buildState(m));
      const ctx = R.ctx;
      return {
        c: px(ctx, 0.5, 0.5),
        t20: px(ctx, 0.5, 0.2),
        t35: px(ctx, 0.5, 0.35),
        b60: px(ctx, 0.5, 0.6),
        b75: px(ctx, 0.5, 0.75),
        l05: px(ctx, 0.05, 0.5),
        r95: px(ctx, 0.95, 0.5),
        l25: px(ctx, 0.25, 0.4),
        r75: px(ctx, 0.75, 0.4),
      };
    };
    const m = new Match(this.diffKey);
    m.obs = null;
    out.faceScreen = sample(m, 0, C.EYE, 13.5, 0, 0);
    out.faceBack = sample(m, 0, C.EYE, 1.5, Math.PI, 0);
    /* 近距:相机在 (0,1.7,4) 正对巨幕,中心应映射到 v=(1.7-0.4)/6 → mapCv(480, 83) */
    out.closeScreen = sample(m, 0, C.EYE, 4, 0, 0);
    out.mapV0217 = px(R.map, 0.5, 0.2167);
    out.mapV05 = px(R.map, 0.5, 0.5);
    out.mapWall = px(R.map, 0.02, 0.5);
    /* 巨幕覆盖检测:第 40% 行上"蓝色系"像素占比 */
    m.player.x = 0; m.player.z = 4; m.player.yaw = 0; m.player.pitch = 0;
    m.aim.valid = false;
    R.render(this.buildState(m));
    const img = R.ctx.getImageData(0, Math.floor(R.H * 0.4), R.W, 1).data;
    let bluish = 0;
    for (let i = 0; i < img.length; i += 4)
      if (img[i + 2] > img[i] + 4) bluish++;
    out.screenRow40BluePct = (bluish / R.W * 100).toFixed(1);
    /* 枪械可见性:右下角区域里"枪身灰"(r 15-70 且 b>r)像素计数 */
    const gi = R.ctx.getImageData(Math.floor(R.W * 0.5), Math.floor(R.H * 0.94), Math.floor(R.W * 0.32), Math.floor(R.H * 0.06)).data;
    let gunPx = 0;
    for (let i = 0; i < gi.length; i += 4)
      if (gi[i] > 15 && gi[i] < 70 && gi[i + 2] > gi[i] + 4) gunPx++;
    out.gunPixels = gunPx;
    const pre = document.createElement('pre');
    pre.id = 'probe';
    pre.textContent = JSON.stringify(out, null, 1);
    document.body.appendChild(pre);
    document.title = 'PROBE ' + out.screenRow40BluePct + '% gun=' + out.gunPixels;
    console.log('PROBE_REPORT ' + JSON.stringify(out));
  },

  doResize() {
    if (!this.renderer) return;
    this.renderer.scale = this.adaptScale();
    this.renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  },

  adaptScale() { return this.renderer ? this.renderer.scale : 1; },

  onKey(e, down) {
    if (e.code === 'KeyM' && down) {
      const muted = AudioSys.toggleMute();
      HUD.toast(muted ? '已静音' : '已开启声音', 800);
      return;
    }
    this.keys[e.code] = down;
    if (down && e.code === 'Enter' && this.state === 'ended') {
      this.startMatch(this.diffKey);
    }
  },

  /* ---------- 流程控制 ---------- */
  startMatch(diffKey) {
    this.diffKey = diffKey;
    this.match = new Match(diffKey);
    this.state = 'playing';
    this.paused = false;
    this.hintI = -1; this.hintT = 0;
    this.endDelayT = 0;
    HUD.hideAll();
    this.requestLock();
  },

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  },

  pauseGame() {
    this.paused = true;
    HUD.showPause();
  },

  resume() {
    this.paused = false;
    HUD.hidePause();
    this.requestLock();
  },

  toMenu() {
    this.state = 'menu';
    this.paused = false;
    if (document.pointerLockElement) document.exitPointerLock();
    HUD.showMenu();
    if (!this.attract || this.attract.state === 'end') {
      this.attract = new Match(this.diffKey);
      this.attract.obs = new Brain(this.diffKey);
    }
  },

  /* ---------- 玩家输入 → 世界坐标 ---------- */
  readInput(p) {
    const k = this.keys;
    const fwd = { x: Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    const right = { x: Math.cos(p.yaw), z: Math.sin(p.yaw) };
    const wx = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
    const wz = (k['KeyS'] ? 1 : 0) - (k['KeyW'] ? 1 : 0);
    let mx = right.x * wx + fwd.x * wz;
    let mz = right.z * wx + fwd.z * wz;
    const L = Math.hypot(mx, mz);
    if (L > 1) { mx /= L; mz /= L; }
    const inp = this.match.playerInput;
    inp.mx = mx; inp.mz = mz; inp.run = !!k['ShiftLeft'] || !!k['ShiftRight'];
  },

  /* ---------- 瞄准投影 ---------- */
  computeAim(p) {
    const cp = Math.cos(p.pitch);
    const dx = Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;
    const a = this.match.aim;
    if (dz >= -0.02) { a.valid = false; return; }
    const t = -p.z / dz;
    if (t <= 0.1) { a.valid = false; return; }
    const x = p.x + dx * t, y = C.EYE + dy * t;
    if (x < -8 || x > 8 || y < C.SCREEN_Y0 || y > C.SCREEN_H) { a.valid = false; return; }
    a.valid = true;
    a.u = (x + 8) / 16;
    a.v = (y - C.SCREEN_Y0) / (C.SCREEN_H - C.SCREEN_Y0);
    a.mx = x;
    a.mz = a.v * 15;
    /* 朝向音量 */
    AudioSys.setScreenFacing(Math.max(0, -dz));
  },

  /* ---------- 渲染状态打包 ---------- */
  buildState(m, camOverride) {
    const p = m.player;
    const shake = m.shake;
    const jx = shake > 0 ? (Math.random() - 0.5) * 0.03 * shake : 0;
    const jy = shake > 0 ? (Math.random() - 0.5) * 0.03 * shake : 0;
    const cam = camOverride || {
      x: p.x, y: C.EYE, z: p.z,
      yaw: p.yaw + jx, pitch: p.pitch + jy,
    };
    return {
      dt: 1 / 60,
      cam,
      aim: m.aim,
      mapEvents: m.eventsB,
      feed: m.feed,
      fx3d: m.fx3d,
      state: m.state,
      countT: m.countT,
      timeLeft: m.timeLeft,
      globalSweepT: m.globalSweepT,
      edgeFlash: m.edgeFlash,
      redFlash: m.redFlash,
      confirmFlash: m.confirmFlash,
      lastHitAt: m.lastHitAt,
      player: {
        gunCd: p.gunCd, scanCd: p.scanCd, recoil: p.recoil, hp: p.hp,
        scanReady: p.scanCd <= 0 && !p.scanActive,
      },
      bob: this.bob, sway: this.swayX * 0.01,
    };
  },

  /* ---------- 提示 ---------- */
  updateHints(dt) {
    if (this.hintsDone) return;
    if (this.hintI < 0) {
      this.hintI = 0;
      this.hintT = HINTS[0].t;
      HUD.setHint(HINTS[0].text);
      return;
    }
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.hintI++;
      if (this.hintI >= HINTS.length) { this.hintsDone = true; HUD.hideHint(); return; }
      this.hintT = HINTS[this.hintI].t;
      HUD.setHint(HINTS[this.hintI].text);
    }
  },

  /* ---------- 主循环 ---------- */
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const dt = clamp((now - this.lastT) / 1000, 0, 0.05);
    this.lastT = now;
    this.emaMs = this.emaMs * 0.95 + Math.min(dt * 1000, 100) * 0.05;
    /* 自适应分辨率 */
    const target = this.adaptScale();
    if (this.emaMs > 30 && target > 0.55) this.renderer.scale = target - 0.07;
    else if (this.emaMs < 14 && target < 1.2) this.renderer.scale = target + 0.03;
    if (Math.abs(this.renderer.scale - target) > 0.001) this.doResize();

    let m = null;
    if (this.state === 'menu') {
      m = this.attract;
      m.step(dt);
      if (m.state === 'end') {
        this.attract = new Match(this.diffKey);
        this.attract.obs = new Brain(this.diffKey);
        m = this.attract;
      }
    } else if (this.state === 'playing' || this.state === 'spectate') {
      m = this.match;
      if (this.state === 'playing') {
        this.readInput(m.player);
        this.computeAim(m.player);
        this.updateHints(dt);
        /* 心跳 */
        if (m.state === 'play') {
          const hp = m.player.hp;
          const rate = hp <= 32 ? 0.85 : (hp <= 66 ? 1.5 : 0);
          const urgent = m.timeLeft <= 30 ? 0.8 : 0;
          if (rate > 0 || urgent > 0) {
            this.hbT -= dt;
            if (this.hbT <= 0) {
              AudioSys.heartbeat(rate > 0 ? 1 : 0.5);
              this.hbT = Math.min(rate || 99, urgent || 99);
            }
          }
        }
      }
      if (!this.paused) m.step(dt);
      if (m.state === 'end') {
        if (this.state === 'spectate') {
          this.match = new Match(this.diffKey);
          this.match.obs = new Brain(this.diffKey);
        } else {
          this.state = 'ended';
          document.exitPointerLock && document.exitPointerLock();
          HUD.showEnd(m);
        }
      }
      if (m === this.match && this.state === 'playing') this.bob += dt * (m.player.moving ? (m.player.run ? 9 : 6) : 0);
      this.swayX *= Math.pow(0.001, dt);
    } else if (this.state === 'ended') {
      m = this.match;
    }

    if (!m) return;

    /* 相机(菜单演示:缓慢环绕) */
    let camOverride = null;
    if (this.state === 'menu') {
      this.attractCamYaw += dt * 0.1;
      const p = m.player;
      camOverride = {
        x: p.x, y: C.EYE, z: p.z,
        yaw: Math.sin(this.attractCamYaw) * 0.55,
        pitch: -0.06 + Math.sin(this.attractCamYaw * 0.7) * 0.07,
      };
      m.aim.valid = false;
    }
    const st = this.buildState(m, camOverride);
    st.dt = dt;
    this.renderer.render(st);

    if (this.state !== 'menu' && this.state !== 'ended') HUD.update(m);
  },
};

/* ---------- 测试/模拟钩子 ---------- */
if (typeof window !== 'undefined') {
  window.__G = {
    C, DIFF, Match, Brain, MapGrid, Heatmap,
    newSim(diffKey, seed) {
      const d = diffKey || 'normal';
      const m = new Match(d);
      m.fixedSeed = seed === undefined ? 1 : seed;
      m.reset();
      m.obs = new Brain(d);
      return m;
    },
    stepSim(m, dt) { m.step(dt); },
    simStats(m) {
      return {
        state: m.state, winner: m.winner, timeLeft: m.timeLeft,
        pShots: m.stats.pShots, pHits: m.stats.pHits,
        eShots: m.stats.eShots, eHits: m.stats.eHits,
        pScans: m.stats.pScans, pFound: m.stats.pFound,
        eScans: m.stats.eScans, eFound: m.stats.eFound,
        php: m.player.hp, ehp: m.enemy.hp,
      };
    },
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => Main.boot());
}
