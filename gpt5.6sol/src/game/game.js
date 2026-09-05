import { moveWithCollisions, shotHits } from './geometry.js';
import { noisyClue } from './inference.js';
import { OpponentAI } from './ai.js';

const ROUND_SECONDS = 120;
const MAX_HEALTH = 100;
const DAMAGE = 34;
const MAGAZINE = 5;

export class Game {
  constructor({ input, scene, screen, ui, audio, obstacles }) {
    this.input = input;
    this.scene = scene;
    this.screen = screen;
    this.ui = ui;
    this.audio = audio;
    this.obstacles = obstacles;
    this.ai = new OpponentAI(obstacles);
    this.phase = 'intro';
    this.player = { x: 0, z: 5.35 };
    this.elapsed = 0;
    this.remaining = ROUND_SECONDS;
    this.playerHealth = MAX_HEALTH;
    this.enemyHealth = MAX_HEALTH;
    this.ammo = MAGAZINE;
    this.scanners = 2;
    this.stats = { shots: 0, hits: 0, enemyShots: 0, enemyHits: 0 };
    this.nextFireAt = 0;
    this.reloadEndsAt = 0;
    this.reloading = false;
    this.playerScans = [];
    this.nextStepAt = 0;
    this.nextClueAt = 0;
    this.hitBoostUntil = 0;
    this.lastMovementState = 'still';
    this.tutorialStage = 0;
  }

  start() {
    this.elapsed = 0;
    this.remaining = ROUND_SECONDS;
    this.player = { x: 0, z: 5.35 };
    this.playerHealth = MAX_HEALTH;
    this.enemyHealth = MAX_HEALTH;
    this.ammo = MAGAZINE;
    this.scanners = 2;
    this.stats = { shots: 0, hits: 0, enemyShots: 0, enemyHits: 0 };
    this.nextFireAt = 0;
    this.reloadEndsAt = 0;
    this.reloading = false;
    this.playerScans = [];
    this.nextStepAt = 0;
    this.nextClueAt = 0;
    this.hitBoostUntil = 0;
    this.tutorialStage = 0;
    this.phase = 'running';
    this.input.yaw = 0;
    this.input.pitch = -0.06;
    this.input.flush();
    this.ai.reset(0);
    this.scene.reset();
    this.screen.reset();
    this.screen.setStatus('正在监听对向空间');
    this.ui.showGame();
    this.ui.setVitals(this.playerHealth, this.enemyHealth);
    this.ui.setTime(this.remaining);
    this.ui.setWeapon(this.ammo, '就绪');
    this.ui.setScanners(this.scanners);
    this.ui.setMovement('still');
    this.ui.hint.textContent = '面对巨幕，寻找对手留下的光迹';
    this.ui.hint.style.opacity = '1';
    this.audio.start();
  }

  pause() {
    if (this.phase !== 'running') return;
    this.phase = 'paused';
    this.input.flush();
    this.ui.showPause();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'running';
    this.ui.hidePause();
  }

  updatePlayerMovement(dt) {
    const movement = this.input.movement();
    const rawLength = Math.hypot(movement.forward, movement.strafe);
    const moving = rawLength > 0;
    const sprinting = moving && movement.sprint;
    const boost = this.elapsed < this.hitBoostUntil ? 1.15 : 0;
    const speed = sprinting ? 4.65 + boost : 2.7 + boost;
    if (moving) {
      const forward = movement.forward / rawLength;
      const strafe = movement.strafe / rawLength;
      const sin = Math.sin(this.input.yaw);
      const cos = Math.cos(this.input.yaw);
      const delta = {
        x: ((-sin * forward) + (cos * strafe)) * speed * dt,
        z: ((-cos * forward) + (-sin * strafe)) * speed * dt,
      };
      this.player = moveWithCollisions(this.player, delta, 0.32, this.obstacles);
    }

    const state = sprinting ? 'sprint' : moving ? 'walk' : 'still';
    if (state !== this.lastMovementState) {
      this.lastMovementState = state;
      this.ui.setMovement(state);
      if (moving && this.tutorialStage === 0) {
        this.tutorialStage = 1;
        this.ui.hint.textContent = '移动会在对方巨幕上留下痕迹';
        setTimeout(() => this.ui.fadeHint(), 4400);
      }
    }

    if (moving && this.elapsed >= this.nextStepAt) {
      const metal = this.player.x > 2.9 && this.player.x < 6.5 && this.player.z > -5.05 && this.player.z < -2.15;
      this.audio.step(sprinting || metal);
      this.nextStepAt = this.elapsed + (sprinting ? 0.29 : 0.47);
    }
    if (moving && this.elapsed >= this.nextClueAt) {
      const metal = this.player.x > 2.9 && this.player.x < 6.5 && this.player.z > -5.05 && this.player.z < -2.15;
      const precision = metal ? 0.48 : sprinting ? 0.68 : 1.65;
      const confidence = metal ? 0.94 : sprinting ? 0.78 : 0.42;
      const point = noisyClue(this.player, precision);
      this.ai.observe({ ...point, type: 'footstep', createdAt: this.elapsed, ttl: metal ? 4.3 : sprinting ? 3.3 : 2.5, confidence });
      this.nextClueAt = this.elapsed + (metal ? 0.38 : sprinting ? 0.54 : 1.3);
    }
    return { movingAmount: moving ? 1 : 0, sprinting };
  }

  beginReload() {
    if (this.reloading) return;
    this.reloading = true;
    this.reloadEndsAt = this.elapsed + 2.1;
    this.scene.setReloading(true);
    this.ui.setWeapon(this.ammo, '重组 2.1');
    this.audio.reload();
  }

  updateWeapon() {
    if (!this.reloading) return;
    const remaining = this.reloadEndsAt - this.elapsed;
    if (remaining > 0) {
      this.ui.weaponState.textContent = `重组 ${remaining.toFixed(1)}`;
      return;
    }
    this.reloading = false;
    this.ammo = MAGAZINE;
    this.scene.setReloading(false);
    this.ui.setWeapon(this.ammo, '就绪');
  }

  fire() {
    const mapped = this.scene.getMappedAim();
    if (!mapped) {
      this.audio.dry();
      this.ui.message('只有巨幕地图能接收射击');
      return;
    }
    if (this.reloading || this.elapsed < this.nextFireAt) {
      this.audio.dry();
      return;
    }
    if (this.ammo <= 0) { this.beginReload(); return; }

    this.ammo -= 1;
    this.stats.shots += 1;
    this.nextFireAt = this.elapsed + 0.72;
    this.scene.fireEffect();
    this.scene.shake(0.22);
    this.audio.fire();
    this.ui.flashPulse();
    this.ui.pulseCrosshair();
    this.ui.setWeapon(this.ammo, this.ammo ? '就绪' : '能量耗尽');
    this.ui.showExposure();
    this.ai.observe({ ...noisyClue(this.player, 0.22), type: 'shot', createdAt: this.elapsed, ttl: 7, confidence: 1 });

    const hit = shotHits(mapped.arena, this.ai.position, 0.86);
    this.screen.addImpact(mapped.arena, hit, this.elapsed);
    if (hit) {
      this.enemyHealth = Math.max(0, this.enemyHealth - DAMAGE);
      this.stats.hits += 1;
      this.ui.setVitals(this.playerHealth, this.enemyHealth);
      this.ui.message('命中 · 对手正在逃离', 'hit', 1.8);
      this.screen.setStatus('确认命中 / 追踪逃逸');
      this.audio.confirm();
      this.ai.onHit(this.elapsed);
      if (this.enemyHealth <= 0) this.end('win');
    } else {
      this.audio.miss();
      this.ui.message('坐标为空');
      this.screen.setStatus('映射完成 / 未捕获生命体');
    }
    if (this.ammo === 0 && this.phase === 'running') this.beginReload();
  }

  scan() {
    const mapped = this.scene.getMappedAim();
    if (!mapped) { this.audio.dry(); this.ui.message('先把准星放到地图上'); return; }
    if (this.scanners <= 0) { this.audio.dry(); this.ui.message('本回合侦测器已耗尽'); return; }
    this.scanners -= 1;
    const scan = { ...mapped.arena, radius: 2.5, endsAt: this.elapsed + 5, nextTraceAt: this.elapsed, previousTrace: null, confirmed: false };
    this.playerScans.push(scan);
    this.screen.addScan(mapped.arena, scan.radius, this.elapsed, 5);
    this.screen.setStatus('局部扫描进行中');
    this.ui.setScanners(this.scanners);
    this.ui.message('侦测器已投放 · 持续 5 秒');
    this.ui.showExposure(1.1);
    this.audio.scan();
    this.ai.observe({ ...noisyClue(this.player, 1.1), type: 'launch', createdAt: this.elapsed, ttl: 3.2, confidence: 0.46 });
  }

  handleAIShot(target, origin) {
    if (this.phase !== 'running') return;
    this.stats.enemyShots += 1;
    const hit = shotHits(target, this.player, 0.86);
    const distance = Math.hypot(target.x - this.player.x, target.z - this.player.z);
    this.screen.addClue({ ...noisyClue(origin, 0.2), type: 'shot', createdAt: this.elapsed, ttl: 6.5, confidence: 1 });
    this.screen.setStatus('侦测到对向开火');
    this.scene.spawnStrike(target, hit);
    this.audio.enemyFire(origin.x / 8);
    if (hit) {
      this.stats.enemyHits += 1;
      this.playerHealth = Math.max(0, this.playerHealth - DAMAGE);
      this.hitBoostUntil = this.elapsed + 2.8;
      this.ui.setVitals(this.playerHealth, this.enemyHealth);
      this.ui.damagePulse();
      this.ui.message('被命中 · 立刻换位', 'hit', 2.1);
      this.scene.shake(1.2);
      this.audio.hit();
      if (this.playerHealth <= 0) this.end('lose');
    } else if (distance < 2.4) {
      this.ui.nearMissPulse();
      this.ui.message('弹着很近 · 他正在盯着这里', 'hit', 1.8);
      this.scene.shake(0.45);
      this.audio.nearMiss((target.x - this.player.x) / 2.4);
    }
  }

  updateAI(dt) {
    this.ai.update(dt, this.elapsed, {
      playerPosition: this.player,
      playerScans: this.playerScans,
      reveal: (clue) => this.screen.addClue(clue),
      remoteStep: (pan, urgent) => this.audio.remoteStep(pan, urgent),
      onScanConfirmed: () => { this.ui.message('捕获轨迹 · 快开火', 'hit', 1.7); this.audio.detected(); this.screen.setStatus('生命体进入侦测区'); },
      onEnemyScan: () => { this.ui.showScanWarning(1.5); this.audio.scan(); },
      onPlayerDetected: () => { this.ui.showScanWarning(2.6); this.ui.message('你已被侦测 · 离开这片区域', 'hit', 2.1); this.audio.detected(); },
      shoot: (target, origin) => this.handleAIShot(target, origin),
    });
  }

  update(dt) {
    if (this.phase !== 'running') {
      this.scene.update(dt, this.player, this.input.yaw, this.input.pitch, 0, false);
      this.screen.update(this.elapsed);
      return;
    }
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;
    this.remaining -= safeDt;
    const movement = this.updatePlayerMovement(safeDt);
    this.updateWeapon();
    if (this.input.consumeFire()) this.fire();
    if (this.input.consumeScan()) this.scan();
    this.playerScans = this.playerScans.filter((scan) => this.elapsed < scan.endsAt);
    this.updateAI(safeDt);
    const mapped = this.scene.getMappedAim();
    this.ui.setAim(mapped, !this.reloading && this.elapsed >= this.nextFireAt);
    this.ui.setTime(this.remaining);
    this.scene.update(safeDt, this.player, this.input.yaw, this.input.pitch, movement.movingAmount, movement.sprinting);
    this.screen.update(this.elapsed);
    if (this.remaining <= 0) {
      const outcome = this.playerHealth > this.enemyHealth || (this.playerHealth === this.enemyHealth && this.stats.hits > this.stats.enemyHits)
        ? 'win'
        : this.playerHealth < this.enemyHealth || this.stats.hits < this.stats.enemyHits ? 'lose' : 'draw';
      this.end(outcome);
    }
  }

  end(outcome) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.input.flush();
    this.ui.showResult(outcome, { ...this.stats, health: this.playerHealth });
    if (document.pointerLockElement) document.exitPointerLock();
    if (outcome === 'win') this.audio.win(); else if (outcome === 'lose') this.audio.lose();
  }
}
