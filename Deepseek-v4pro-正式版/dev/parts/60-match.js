'use strict';
/* ================= 对战核心:回合状态机 / 痕迹 / 判定 ================= */

function mkEntity(x, z) {
  return {
    x, z, hp: C.MAX_HP, alive: true,
    run: false, moving: false, adrenT: 0,
    gunCd: 0, scanCd: 0, scanActive: false, scanCharge: 0, scanPoint: null,
    trailT: rnd(0.4, 1.0), idleT: 0, rippleT: C.RIPPLE.idle, stepT: 0,
    recoil: 0, damageFlash: 0, lastDir: { x: 0, z: 1 },
  };
}

class Match {
  constructor(diffKey) {
    this.diffKey = diffKey;
    this.playerInput = { mx: 0, mz: 0, run: false };
    this.enemyCtrl = { mx: 0, mz: 0, run: false, fire: false, aim: null, scan: false, scanAt: null };
    this.aim = { valid: false, u: 0.5, v: 0.5, mx: 0, mz: 7.5 };
    this.reset();
  }

  reset() {
    seedRng(this.fixedSeed !== undefined ? this.fixedSeed : ((Math.random() * 1e9) | 0));
    const sp = MAPDEF.spawn;
    this.player = mkEntity(sp.x, sp.z);
    this.enemy = mkEntity(sp.x, sp.z);
    this.brain = new Brain(this.diffKey);
    this.state = 'countdown';
    this.countT = C.COUNTDOWN;
    this.timeLeft = C.ROUND_T;
    this.eventsA = [];   // 玩家房间内的事件(敌方地图可见)
    this.eventsB = [];   // 敌方房间内的事件(玩家地图可见)
    this.fx3d = [];      // 玩家房间的 3D 特效
    this.feed = [];      // 玩家地图漂浮文字
    this.hudMsg = null; this.hudMsgT = 0;
    this.redFlash = 0; this.confirmFlash = 0;
    this.edgeFlash = { t: 0, u: 0.5, color: '#bfe8ff' };
    this.shake = 0;
    this.hitstop = 0;
    this.endingT = 0;
    this.globalNext = C.ENDGAME.at;
    this.globalSweepT = 0;
    this.winner = null; this.endReason = '';
    this.stats = { pShots: 0, pHits: 0, pScans: 0, pFound: 0, eShots: 0, eHits: 0, eScans: 0, eFound: 0 };
    this.player.yaw = 0; this.player.pitch = 0;
    this.countBeep = -1;
  }

  loudness(e) {
    const base = clamp(1.15 - (e.z / 15) * 0.85, 0.18, 1);
    const moveK = e.run ? 1 : 0.45;
    const muffK = MapGrid.muffled(e.x, e.z) ? 0.42 : 1;
    return base * moveK * muffK;
  }

  /* ---------- 主循环 ---------- */
  step(dt) {
    if (this.state === 'countdown') {
      this.countT -= dt;
      const b = Math.ceil(this.countT);
      if (b !== this.countBeep && b > 0 && b <= 3) { this.countBeep = b; AudioSys.countBeep(3 - b); }
      if (this.countT <= 0) {
        this.state = 'play';
        this.hudMsg = { text: '对局开始', color: '#9fd8ff', t: 1.1 };
        AudioSys.goSting();
      }
      return;
    }
    if (this.state !== 'play' && this.state !== 'ending') return;

    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    let ts = 1;
    if (this.state === 'ending') { this.endingT -= dt; ts = 0.3; if (this.endingT <= 0) { this.finish(); return; } }
    dt *= ts;

    if (this.state === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= C.ENDGAME.at && this.globalNext > 0 && this.timeLeft <= this.globalNext) {
        this.globalNext -= C.ENDGAME.every;
        this.doGlobalScan();
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endByTime(); }
    }

    /* 实体更新 */
    if (this.obs && this.state === 'play' && this.player.alive) this.driveObserver(dt);
    this.updateEntity(this.player, dt, this.playerInput);
    this.updateEntity(this.enemy, dt, this.enemyCtrl);

    /* 痕迹与涟漪 */
    this.emitTrails(this.player, this.eventsA, dt);
    this.emitTrails(this.enemy, this.eventsB, dt);
    this.emitRipples(this.player, this.eventsA, dt);
    this.emitRipples(this.enemy, this.eventsB, dt);

    /* 脚步 */
    this.footsteps(this.player, dt);
    this.footstepsEnemy(this.enemy, dt);

    /* 敌方大脑 */
    if (this.state === 'play' && this.enemy.alive) {
      const ctrl = this.brain.think(dt, this.enemy);
      this.enemyCtrl = ctrl;
      if (ctrl.fire) this.enemyFire(ctrl.aim);
      if (ctrl.scan) this.enemyScan(ctrl.scanAt);
    }

    /* 扫描结算 */
    if (this.player.scanActive) this.updateScan(this.player, dt, true);
    if (this.enemy.scanActive) this.updateScan(this.enemy, dt, false);

    /* 衰减 */
    this.redFlash = Math.max(0, this.redFlash - dt * 2.4);
    this.confirmFlash = Math.max(0, this.confirmFlash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.edgeFlash.t = Math.max(0, this.edgeFlash.t - dt);
    this.hudMsgT = Math.max(0, this.hudMsgT - dt);
    if (this.hudMsgT <= 0) this.hudMsg = null;

    this.prune(this.eventsA, dt);
    this.prune(this.eventsB, dt);
    this.prune(this.fx3d, dt);
    this.prune(this.feed, dt);
  }

  prune(arr, dt) {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].t -= dt;
      if (arr[i].t <= 0) arr.splice(i, 1);
    }
  }

  updateEntity(e, dt, input) {
    const speed = (e.run ? C.RUN : C.WALK) * (e.adrenT > 0 ? C.ADRENALINE_MULT : 1);
    if (input && (input.mx || input.mz)) {
      const L = Math.hypot(input.mx, input.mz) || 1;
      e.lastDir.x = input.mx / L;
      e.lastDir.z = input.mz / L;
      const nx = e.x + (input.mx / L) * speed * dt;
      const nz = e.z + (input.mz / L) * speed * dt;
      const c1 = MapGrid.collide(nx, e.z, C.PLAYER_R);
      const c2 = MapGrid.collide(c1.x, nz, C.PLAYER_R);
      e.x = c2.x; e.z = c2.z;
      e.moving = true;
    } else e.moving = false;
    e.adrenT = Math.max(0, e.adrenT - dt);
    e.gunCd = Math.max(0, e.gunCd - dt);
    e.scanCd = Math.max(0, e.scanCd - dt);
    e.recoil = Math.max(0, e.recoil - dt * 6);
    e.damageFlash = Math.max(0, e.damageFlash - dt * 3);
  }

  /* ---------- 痕迹(移动残留,对敌方地图可见) ---------- */
  emitTrails(e, room, dt) {
    if (!e.moving) { e.trailT = rnd(0.4, 1.0); return; }
    const cfg = e.run ? C.TRAIL_RUN : C.TRAIL_WALK;
    e.trailT -= dt;
    if (e.trailT <= 0) {
      e.trailT = rnd(cfg.every[0], cfg.every[1]);
      const x = e.x + gauss() * cfg.noise;
      const z = e.z + gauss() * cfg.noise;
      room.push({ kind: 'trail', x, z, dx: e.lastDir.x * 0.4, dz: e.lastDir.z * 0.4, life: cfg.life, t: cfg.life, alpha: cfg.alpha });
      if (room === this.eventsA) this.brain.percept({ kind: 'trail', x, z });
      else if (this.obs) this.obs.percept({ kind: 'trail', x, z });
      if (room === this.eventsB && this.state === 'play') AudioSys.traceTick(e.x / 8);
    }
  }

  /* ---------- 涟漪(久站暴露) ---------- */
  emitRipples(e, room, dt) {
    if (e.moving) { e.idleT = 0; e.rippleT = C.RIPPLE.every; return; }
    e.idleT += dt;
    if (e.idleT < C.RIPPLE.idle) return;
    e.rippleT -= dt;
    if (e.rippleT <= 0) {
      e.rippleT = C.RIPPLE.every;
      const x = e.x + gauss() * C.RIPPLE.noise;
      const z = e.z + gauss() * C.RIPPLE.noise;
      room.push({ kind: 'ripple', x, z, life: C.RIPPLE.life, t: C.RIPPLE.life, alpha: C.RIPPLE.alpha });
      if (room === this.eventsA) this.brain.percept({ kind: 'ripple', x, z });
      else if (this.obs) this.obs.percept({ kind: 'ripple', x, z });
      if (room === this.eventsB && this.state === 'play') AudioSys.traceTick(e.x / 8);
    }
  }

  /* ---------- 脚步 ---------- */
  footsteps(e, dt) {
    if (!e.moving) { e.stepT = 0.2; return; }
    e.stepT -= dt;
    if (e.stepT <= 0) {
      e.stepT = e.run ? 0.42 : 0.62;
      AudioSys.ownStep(e.run);
      const w = this.loudness(e);
      this.brain.percept({
        kind: 'sound',
        x: e.x + gauss() * 1.0, z: e.z + gauss() * 0.8, w,
      });
    }
  }

  footstepsEnemy(e, dt) {
    if (!e.moving) { e.stepT = 0.2; return; }
    e.stepT -= dt;
    if (e.stepT <= 0) {
      e.stepT = e.run ? 0.42 : 0.62;
      const w = this.loudness(e);
      AudioSys.enemyStep(e.run, w, MapGrid.muffled(e.x, e.z), e.x / 8);
      if (this.obs) this.obs.percept({ kind: 'sound', x: e.x + gauss() * 1.0, z: e.z + gauss() * 0.8, w });
    }
  }

  /* ---------- 玩家射击 ---------- */
  playerFire() {
    if (this.state !== 'play' || !this.player.alive || this.player.gunCd > 0) return 'busy';
    if (!this.aim.valid) return 'offscreen';
    this.player.gunCd = C.GUN_CD;
    this.stats.pShots++;
    const px = clamp(this.aim.mx, -7.9, 7.9), pz = clamp(this.aim.mz, 0.1, 14.9);
    const d = dist2d(px, pz, this.enemy.x, this.enemy.z);
    const hit = d < C.GUN_RADIUS;
    this.eventsB.push({ kind: 'shot', x: px, z: pz, life: C.FLASH_LIFE, t: C.FLASH_LIFE, hit });
    this.feed.push({
      x: px, z: pz,
      text: hit ? '命中目标' : '未命中',
      color: hit ? '#ff6a5e' : '#9fd8ff',
      life: 1.15, t: 1.15,
    });
    AudioSys.gunshot();
    this.player.recoil = 1;
    this.shake = Math.max(this.shake, 0.4);
    if (hit) {
      this.stats.pHits++;
      AudioSys.hitConfirm();
      this.confirmFlash = 0.5;
      this.hudMsg = { text: '命中目标', color: '#ff6a5e', t: 0.9 };
      this.hitstop = C.HITSTOP;
      this.damageEnemy(px, pz);
      if (this.obs) this.obs.percept({ kind: 'hit', x: px, z: pz });
    } else {
      AudioSys.impactDistant(false);
      if (d < 2.8) this.brain.percept({ kind: 'hitMe' });   // 差点被找到 → 转移
    }
    return 'ok';
  }

  damageEnemy(px, pz) {
    const e = this.enemy;
    e.hp -= C.GUN_DMG;
    e.adrenT = C.ADRENALINE_T;
    this.brain.percept({ kind: 'hitMe' });
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      this.winner = 'player'; this.endReason = 'kill';
      this.state = 'ending'; this.endingT = C.KILL_SLOW_T;
      this.hudMsg = { text: '目标已消灭', color: '#ff6a5e', t: 2 };
      AudioSys.hitTaken();
    }
  }

  /* ---------- 敌方射击 ---------- */
  enemyFire(aim) {
    if (this.state !== 'play' || !this.enemy.alive) return;
    this.stats.eShots++;
    const px = clamp(aim.x, -7.9, 7.9), pz = clamp(aim.z, 0.1, 14.9);
    const d = dist2d(px, pz, this.player.x, this.player.z);
    const hit = d < C.GUN_RADIUS;
    this.eventsA.push({ kind: 'shot', x: px, z: pz, life: C.FLASH_LIFE, t: C.FLASH_LIFE, hit });
    this.fx3d.push({ kind: 'incoming', x: px, z: pz, life: C.INCOMING_LIFE, t: C.INCOMING_LIFE, hit });
    this.edgeFlash = { t: 0.55, u: (px + 8) / 16, color: hit ? '#ff5040' : '#bfe8ff' };
    AudioSys.incomingShot(dist2d(px, pz, this.player.x, this.player.z), px / 8, hit);
    if (hit) {
      this.stats.eHits++;
      this.brain.percept({ kind: 'hit', x: px, z: pz });
      this.damagePlayer(px, pz);
      if (this.obs) this.obs.percept({ kind: 'hitMe' });
    } else if (d < C.NEAR_MISS) {
      AudioSys.nearMiss(px / 8);
      if (this.obs) this.obs.percept({ kind: 'hitMe' });
    }
  }

  damagePlayer(px, pz) {
    const p = this.player;
    this.lastHitAt = { x: px, z: pz, t: 1.2 };
    p.hp -= C.GUN_DMG;
    p.adrenT = C.ADRENALINE_T;
    p.damageFlash = 1;
    this.redFlash = 1;
    this.shake = Math.max(this.shake, 0.9);
    this.hitstop = C.HITSTOP;
    this.hudMsg = { text: '你被击中了', color: '#ff5040', t: 1.0 };
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false;
      this.winner = 'enemy'; this.endReason = 'kill';
      this.state = 'ending'; this.endingT = C.KILL_SLOW_T;
      this.hudMsg = { text: '你被消灭了', color: '#ff5040', t: 2 };
    }
  }

  /* ---------- 侦测 ---------- */
  playerScan() {
    if (this.state !== 'play' || !this.player.alive) return 'busy';
    if (this.player.scanCd > 0 || this.player.scanActive) return 'busy';
    if (!this.aim.valid) return 'offscreen';
    const p = this.player;
    p.scanActive = true;
    p.scanCharge = C.SCAN_DELAY;
    p.scanPoint = { x: clamp(this.aim.mx, -7.5, 7.5), z: clamp(this.aim.mz, 0.5, 14.5) };
    AudioSys.scanCharge();
    return 'ok';
  }

  enemyScan(at) {
    if (this.enemy.scanActive || this.enemy.scanCd > 0) return;
    const e = this.enemy;
    e.scanActive = true;
    e.scanCharge = C.SCAN_DELAY;
    e.scanPoint = { x: clamp(at.x, -7.5, 7.5), z: clamp(at.z, 0.5, 14.5) };
  }

  updateScan(e, dt, isPlayer) {
    e.scanCharge -= dt;
    if (e.scanCharge > 0) return;
    e.scanActive = false;
    e.scanCd = C.SCAN_CD;
    const p = e.scanPoint;
    if (isPlayer) {
      this.stats.pScans++;
      this.eventsB.push({ kind: 'scan', x: p.x, z: p.z, life: C.PULSE_LIFE, t: C.PULSE_LIFE });
      const found = dist2d(p.x, p.z, this.enemy.x, this.enemy.z) < C.SCAN_R;
      if (found) {
        this.stats.pFound++;
        this.eventsB.push({ kind: 'reveal', x: this.enemy.x, z: this.enemy.z, life: C.SCAN_REVEAL, t: C.SCAN_REVEAL });
        this.feed.push({ x: p.x, z: p.z, text: '侦测到目标', color: '#ff9d5e', life: 1.2, t: 1.2 });
        AudioSys.scanFound();
        this.hudMsg = { text: '侦测到目标', color: '#ff9d5e', t: 1.0 };
        if (this.obs) this.obs.percept({ kind: 'reveal', x: this.enemy.x, z: this.enemy.z });
      } else {
        this.feed.push({ x: p.x, z: p.z, text: '无信号', color: '#7fa8c8', life: 1.1, t: 1.1 });
        AudioSys.scanEmpty();
      }
      this.brain.percept({ kind: 'scanPulse', hitMe: dist2d(p.x, p.z, this.enemy.x, this.enemy.z) < C.SCAN_R });
    } else {
      this.stats.eScans++;
      const distP = dist2d(p.x, p.z, this.player.x, this.player.z);
      const hitMe = distP < C.SCAN_R;
      this.fx3d.push({ kind: 'pulse', x: p.x, z: p.z, life: C.PULSE_LIFE, t: C.PULSE_LIFE });
      AudioSys.scanIncoming(distP, p.x / 8, hitMe);
      if (hitMe) {
        this.stats.eFound++;
        this.hudMsg = { text: '你已被敌方侦测', color: '#ffb25e', t: 1.5 };
        this.brain.percept({ kind: 'reveal', x: this.player.x, z: this.player.z });
        if (this.obs) this.obs.percept({ kind: 'scanPulse', hitMe: true });
      }
    }
  }

  /* ---------- 终局全域扫描 ---------- */
  doGlobalScan() {
    this.globalSweepT = C.ENDGAME.sweep;
    const P = this.player, E = this.enemy;
    this.eventsA.push({ kind: 'reveal', x: P.x, z: P.z, life: C.ENDGAME.reveal, t: C.ENDGAME.reveal, global: true });
    this.eventsB.push({ kind: 'reveal', x: E.x, z: E.z, life: C.ENDGAME.reveal, t: C.ENDGAME.reveal, global: true });
    this.fx3d.push({ kind: 'mark', x: P.x, z: P.z, life: C.ENDGAME.reveal, t: C.ENDGAME.reveal });
    this.brain.percept({ kind: 'globalscan', x: P.x, z: P.z });
    if (this.obs) this.obs.percept({ kind: 'globalscan', x: E.x, z: E.z });
    AudioSys.globalSweep();
    this.hudMsg = { text: '全面扫描 — 双方位置已暴露', color: '#ffd76a', t: 1.6 };
  }

  /* 观战/AI 驱动:由第二个大脑控制玩家实体 */
  driveObserver(dt) {
    const c = this.obs.think(dt, this.player);
    this.playerInput.mx = c.mx;
    this.playerInput.mz = c.mz;
    this.playerInput.run = c.run;
    if (c.fire && c.aim) {
      this.aim = { valid: true, u: 0.5, v: 0.5, mx: c.aim.x, mz: c.aim.z };
      this.playerFire();
    } else if (c.scan && c.scanAt) {
      this.aim = { valid: true, u: 0.5, v: 0.5, mx: c.scanAt.x, mz: c.scanAt.z };
      this.playerScan();
    }
  }

  endByTime() {
    if (this.player.hp > this.enemy.hp) { this.winner = 'player'; this.endReason = 'hp'; }
    else if (this.player.hp < this.enemy.hp) { this.winner = 'enemy'; this.endReason = 'hp'; }
    else { this.winner = 'draw'; this.endReason = 'draw'; }
    this.state = 'ending'; this.endingT = 0.8;
  }

  finish() {
    this.state = 'end';
    if (this.winner === 'player') AudioSys.win();
    else if (this.winner === 'enemy') AudioSys.lose();
    else AudioSys.draw();
  }

  accuracy(side) {
    const s = this.stats;
    const shots = side === 'p' ? s.pShots : s.eShots;
    const hits = side === 'p' ? s.pHits : s.eHits;
    return shots ? Math.round(hits / shots * 100) : 0;
  }
}
