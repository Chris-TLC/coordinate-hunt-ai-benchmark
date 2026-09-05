'use strict';
/* ================= AI:信念热力图 + 行为大脑 ================= */

/* 64×60 格(每格 0.25m)覆盖 16m×15m,存"玩家在此"的相对置信度 */
class Heatmap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.v = new Float32Array(w * h);
    this.blurT = 0;
    this.reset();
  }
  reset() { this.v.fill(1 / (this.w * this.h)); }

  /* 世界坐标(米)→ 高斯注入 */
  add(x, z, sigma, wgt) {
    const cx = (x + 8) / 16 * this.w;
    const cz = z / 15 * this.h;
    const r = Math.max(1, Math.ceil(sigma / 0.25 * 2.6));
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(this.h - 1, Math.ceil(cz + r));
    const s2 = 2 * sigma * sigma;
    for (let gz = z0; gz <= z1; gz++) {
      const dz = (gz + 0.5) / this.h * 15 - z;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = (gx + 0.5) / this.w * 16 - 8 - x;
        const d2 = dx * dx + dz * dz;
        if (d2 < (sigma * 2.6) * (sigma * 2.6))
          this.v[gz * this.w + gx] += wgt * Math.exp(-d2 / s2);
      }
    }
  }

  /* 每帧衰减(向均匀回归) + 周期模糊 */
  step(dt) {
    const k = 1 - Math.pow(0.5, dt / 13);
    const u = 1 / (this.w * this.h);
    for (let i = 0; i < this.v.length; i++) this.v[i] = u + (this.v[i] - u) * (1 - k);
    this.blurT += dt;
    if (this.blurT > 0.24) { this.blurT = 0; this.blur(); }
  }
  blur() {
    const w = this.w, h = this.h, v = this.v, t = new Float32Array(w * h);
    for (let z = 0; z < h; z++) {
      const z0 = Math.max(0, z - 1), z1 = Math.min(h - 1, z + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
        let s = 0, n = 0;
        for (let zz = z0; zz <= z1; zz++)
          for (let xx = x0; xx <= x1; xx++) { s += v[zz * w + xx]; n++; }
        t[z * w + x] = s / n;
      }
    }
    this.v.set(t);
  }

  max() {
    let mi = 0, mv = -1;
    for (let i = 0; i < this.v.length; i++) if (this.v[i] > mv) { mv = this.v[i]; mi = i; }
    const u = 1 / (this.w * this.h);
    return {
      x: ((mi % this.w) + 0.5) / this.w * 16 - 8,
      z: ((mi / this.w | 0) + 0.5) / this.h * 15,
      conf: mv / u,   // 相对均匀分布的倍数
    };
  }
}

/* 敌方大脑:接收感知事件,输出控制指令 */
class Brain {
  constructor(diffKey) {
    this.d = DIFF[diffKey] || DIFF.normal;
    this.hm = new Heatmap(64, 60);
    this.now = 0;
    this.mood = 'hunt'; this.moodT = 0;
    this.target = null; this.targetT = 0;
    this.fireT = 3 + Math.random() * 2;   // 开局宽限
    this.scanT = 14;
    this.follow = null;                   // 追猎:最近命中点
    this.dodgeUntil = 0;
    this.lastPos = { x: 0, z: 13.5 };
    this.stuckT = 0;
    this.lastSoundT = -99;
    this.believed = { x: 0, z: 7, conf: 0 };
    this.moving = false;
    this.fired = false;
  }

  /* 外部事件(由 Match 转发) */
  percept(ev) {
    const n = this.now;
    switch (ev.kind) {
      case 'trail':   this.hm.add(ev.x, ev.z, 1.0, 0.5); break;
      case 'ripple':  this.hm.add(ev.x, ev.z, 1.3, 0.5); break;
      case 'sound':   this.hm.add(ev.x, ev.z, 1.7, clamp(ev.w, 0, 1) * 1.15); this.lastSoundT = n; break;
      case 'hit':     this.hm.add(ev.x, ev.z, 0.55, 2.6); this.follow = { x: ev.x, z: ev.z, until: n + this.d.follow + 0.6 }; this.fireT = Math.max(this.fireT, n + this.d.react * 0.4); break;
      case 'hitMe':   this.dodgeUntil = n + 1.8; break;
      case 'scanPulse': this.dodgeUntil = Math.max(this.dodgeUntil, n + (ev.hitMe ? 2.0 : 0.8)); break;
      case 'reveal':  this.hm.add(ev.x, ev.z, 0.3, 4.5); this.dodgeUntil = Math.max(this.dodgeUntil, n + 0.5); this.fireT = Math.max(this.fireT, n + this.d.react); break;
      case 'globalscan': this.hm.add(ev.x, ev.z, 0.25, 5); this.follow = { x: ev.x, z: ev.z, until: n + 1.0 }; this.fireT = Math.max(this.fireT, n + this.d.react); break;
    }
  }

  /* 每帧思考。me = {x, z};返回 {mx, mz, run, fire, aim, scan, scanAt} */
  think(dt, me) {
    this.now += dt;
    const d = this.d, n = this.now;
    this.fired = false;
    const ctrl = { mx: 0, mz: 0, run: false, fire: false, aim: null, scan: false, scanAt: null };

    /* —— 情绪切换 —— */
    if (n < this.dodgeUntil) this.mood = 'dodge';
    else if (n > this.moodT) {
      this.moodT = n + 3 + Math.random() * 4;
      this.mood = Math.random() < d.camp ? 'ambush' : 'hunt';
    }

    const m = this.hm.max();
    this.believed = { x: m.x, z: m.z, conf: m.conf };
    const distToBelief = dist2d(me.x, me.z, m.x, m.z);

    /* —— 开火决策 —— */
    if (this.follow && n < this.follow.until) {
      if (n >= this.fireT) {
        ctrl.aim = { x: this.follow.x + gauss() * d.noise * 0.5, z: this.follow.z + gauss() * d.noise * 0.5 };
        ctrl.fire = true; this.fired = true;
        this.fireT = n + 0.8;
      }
    } else if (m.conf > d.confThresh && n >= this.fireT) {
      const mv = this.moving ? 1.35 : 1;
      ctrl.aim = { x: m.x + gauss() * d.noise * mv, z: m.z + gauss() * d.noise * mv };
      ctrl.fire = true; this.fired = true;
      this.fireT = n + rnd(d.cadence[0], d.cadence[1]);
      if (this.mood === 'ambush') this.mood = 'hunt';
    }

    /* —— 侦测 —— */
    if (n >= this.scanT) {
      if (m.conf < d.confThresh * 1.7 || this.mood === 'ambush' || n - this.lastSoundT > 6) {
        ctrl.scan = true;
        ctrl.scanAt = { x: m.x + gauss() * 1.6, z: m.z + gauss() * 1.6 };
        this.scanT = n + d.scanEvery * rnd(0.7, 1.3);
      }
    }

    /* —— 移动 —— */
    const reached = this.target && dist2d(me.x, me.z, this.target.x, this.target.z) < 0.8;
    const speedNow = Math.hypot(me.x - this.lastPos.x, me.z - this.lastPos.z) / Math.max(dt, 0.001);
    if (this.target && speedNow < 0.5 && this.moving) this.stuckT += dt; else this.stuckT = 0;
    if (!this.target || reached || n > this.targetT || this.stuckT > 0.6) {
      this.pickTarget(m, distToBelief);
      this.targetT = n + rnd(1.6, 3.4);
      this.stuckT = 0;
    }

    const idle = this.mood === 'ambush' && reached && this.target && this.target.stand;
    if (!idle) {
      const dx = this.target.x - me.x, dz = this.target.z - me.z;
      const L = Math.hypot(dx, dz) || 1;
      ctrl.mx = dx / L; ctrl.mz = dz / L;
      ctrl.run = this.mood === 'dodge' ||
        (distToBelief > 7) ||
        (m.conf < d.confThresh * 2 && this.mood === 'hunt' && this.targetRun);
      this.moving = true;
    } else {
      this.moving = false;
      ctrl.run = false;
    }
    this.lastPos = { x: me.x, z: me.z };
    return ctrl;
  }

  pickTarget(m, distToBelief) {
    const d = this.d;
    this.targetRun = Math.random() > d.walkBias;
    /* 迂回接近最可能的位置(但保持一点距离,避免贴脸) */
    if (m.conf > d.confThresh * 0.9 && this.mood === 'hunt') {
      const ang = Math.random() * TAU;
      const off = rnd(2.2, 4.5);
      this.target = { x: m.x + Math.cos(ang) * off, z: m.z + Math.sin(ang) * off, stand: false };
      this.target = MapGrid.collide(this.target.x, this.target.z, 0.7);
      return;
    }
    if (this.mood === 'ambush') {
      /* 找一个"声影"位置蹲守 */
      const spots = [];
      for (const o of MapGrid.obs) {
        spots.push({ x: (o.x0 + o.x1) / 2, z: o.z1 + 0.8, stand: true });
        spots.push({ x: (o.x0 + o.x1) / 2, z: o.z0 - 0.8, stand: true });
      }
      const s = pick(spots);
      this.target = MapGrid.collide(s.x, s.z, 0.5);
      if (!MapGrid.insideObs(this.target.x, this.target.z)) { this.target.stand = true; return; }
    }
    this.target = MapGrid.randomFree(1.0, Math.random);
    this.target.stand = false;
  }
}
