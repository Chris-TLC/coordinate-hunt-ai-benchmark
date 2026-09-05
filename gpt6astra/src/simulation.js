(function (root) {
  'use strict';

  const ARENA = Object.freeze({ width: 16, depth: 15, radius: 0.32, duration: 120 });
  const OBSTACLES = Object.freeze([
    { x: -3.8, z: 4.4, width: 2.4, depth: 1.1, height: 1.12, label: '01' },
    { x: 3.8, z: 4.4, width: 2.4, depth: 1.1, height: 1.12, label: '02' },
    { x: -3.0, z: 9.0, width: 1.2, depth: 2.5, height: 1.25, label: '03' },
    { x: 3.0, z: 9.0, width: 1.2, depth: 2.5, height: 1.25, label: '04' }
  ]);
  const DIFFICULTY = {
    lucid: { label: '初次入梦', accuracy: 1.55, interval: 3.5, reaction: 0.7, dodge: 0.32 },
    standard: { label: '浅层梦境', accuracy: 1.05, interval: 2.65, reaction: 0.48, dodge: 0.52 },
    nightmare: { label: '深层梦境', accuracy: 0.66, interval: 1.9, reaction: 0.32, dodge: 0.72 }
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mapToWorld = (u, v) => ({ x: u * ARENA.width - 8, z: v * ARENA.depth });
  const worldToMap = (x, z) => ({ u: (x + 8) / ARENA.width, v: z / ARENA.depth });

  class SeededRandom {
    constructor(seed = 1979) { this.state = seed >>> 0; }
    next() {
      this.state += 0x6D2B79F5;
      let mixed = this.state;
      mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    }
    range(min, max) { return min + this.next() * (max - min); }
    offset(radius) { return (this.next() + this.next() - 1) * radius; }
  }

  function actor(x, z) {
    return { x, z, previousX: x, previousZ: z, vx: 0, vz: 0, hp: 100, ammo: 6, reloadTime: 0, fireCooldown: 0, scanCooldown: 0, decoyCooldown: 0, boost: 0, stepDistance: 0, audibleTime: 0, moving: false, quiet: false, sprint: false };
  }

  function pointInObstacle(x, z, margin = 0) {
    return OBSTACLES.some(block => Math.abs(x - block.x) < block.width / 2 + margin && Math.abs(z - block.z) < block.depth / 2 + margin);
  }

  function damageAt(target, victim) {
    const distance = Math.hypot(target.x - victim.x, target.z - victim.z);
    if (distance > 1.36 || pointInObstacle(target.x, target.z)) return 0;
    for (let sample = 1; sample < 8; sample++) {
      const progress = sample / 8;
      if (pointInObstacle(target.x + (victim.x - target.x) * progress, target.z + (victim.z - target.z) * progress)) return 0;
    }
    return distance < 0.8 ? 34 : 18;
  }

  class Duel {
    constructor(options = {}) {
      this.random = new SeededRandom(options.seed || 1979);
      this.level = DIFFICULTY[options.difficulty] || DIFFICULTY.standard;
      this.aiEnabled = options.ai !== false;
      this.player = actor(0, 11.8);
      this.enemy = actor(this.random.range(-1.5, 1.5), 7.0);
      this.time = 0;
      this.remaining = ARENA.duration;
      this.result = null;
      this.traces = { player: [], enemy: [] };
      this.scans = [];
      this.shots = [];
      this.impacts = [];
      this.decoys = [];
      this.events = [];
      this.sequence = 0;
      this.stats = { shots: 0, hits: 0, damage: 0, received: 0, scans: 0, dodges: 0, distance: 0, decoys: 0 };
      this.enemyBrain = { memory: null, goal: { x: 5.7, z: 6.4 }, nextMove: 2, nextShot: 5.5, nextScan: 12, lastTrace: -1, mode: 'search', dodgeUntil: 0 };
    }

    other(side) { return side === 'player' ? 'enemy' : 'player'; }
    emit(type, detail = {}) { this.events.push({ type, time: this.time, ...detail }); }
    drainEvents() { const events = this.events; this.events = []; return events; }

    visibleTo(side) {
      return {
        traces: this.traces[side],
        scans: this.scans.filter(scan => scan.owner === side),
        impacts: this.impacts.filter(impact => impact.owner === side),
        incoming: this.shots.filter(shot => shot.owner !== side),
        outgoing: this.shots.filter(shot => shot.owner === side)
      };
    }

    addTrace(source, type, point, options = {}) {
      const observer = this.other(source);
      const uncertainty = type === 'shot' ? 0.48 : type === 'scan' ? 0.22 : 0.82;
      const trace = {
        id: ++this.sequence,
        type,
        x: clamp(point.x + this.random.offset(uncertainty), -7.8, 7.8),
        z: clamp(point.z + this.random.offset(uncertainty), 0.2, 14.8),
        dx: options.dx || 0,
        dz: options.dz || 0,
        born: this.time,
        life: type === 'shot' ? 4.4 : type === 'scan' ? 2.4 : 3.2,
        strength: options.strength || (type === 'shot' ? 1 : 0.65)
      };
      this.traces[observer].push(trace);
      if (observer === 'player' && type === 'step') this.emit('remote-step', { x: trace.x, z: trace.z, strength: trace.strength });
      return trace;
    }

    fire(side, target) {
      const shooter = this[side];
      if (this.result || !target || !Number.isFinite(target.x) || !Number.isFinite(target.z) || target.x < -8 || target.x > 8 || target.z < 0 || target.z > 15) return false;
      if (shooter.fireCooldown > 0 || shooter.reloadTime > 0 || shooter.ammo <= 0) return false;
      shooter.ammo--;
      shooter.fireCooldown = 0.52;
      const shot = { id: ++this.sequence, owner: side, x: target.x, z: target.z, born: this.time, lands: this.time + 0.52, dodged: false };
      this.shots.push(shot);
      this.addTrace(side, 'shot', shooter, { dx: shooter.vx * 0.16, dz: shooter.vz * 0.16 });
      shooter.audibleTime = 2.1;
      if (side === 'player') this.stats.shots++;
      this.emit('fire', { side, target, shotId: shot.id });
      return true;
    }

    reload(side) {
      const shooter = this[side];
      if (this.result || shooter.reloadTime > 0 || shooter.ammo === 6) return false;
      shooter.reloadTime = 1.55;
      this.emit('reload', { side });
      return true;
    }

    scan(side, target) {
      if (this.result || this[side].scanCooldown > 0 || !target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return false;
      this[side].scanCooldown = 14;
      this.scans.push({ id: ++this.sequence, owner: side, x: clamp(target.x, -8, 8), z: clamp(target.z, 0, 15), radius: 2.8, born: this.time, life: 3.6, nextPulse: this.time + 0.22, occupied: null });
      if (side === 'player') this.stats.scans++;
      this.emit('scan', { side });
      return true;
    }

    decoy(side) {
      if (this.result || this[side].decoyCooldown > 0) return false;
      const source = this[side];
      source.decoyCooldown = 20;
      this.decoys.push({ owner: side, x: source.x, z: source.z, born: this.time, nextPulse: this.time + 1.3, pulses: 0 });
      if (side === 'player') this.stats.decoys++;
      this.emit('decoy', { side, x: source.x, z: source.z });
      return true;
    }

    move(side, direction, delta) {
      const moving = this[side];
      const length = Math.hypot(direction.x || 0, direction.z || 0);
      moving.quiet = !!direction.quiet;
      moving.sprint = !!direction.sprint && !moving.quiet;
      const speed = (moving.quiet ? 1.75 : moving.sprint ? 5.1 : 3.25) * (moving.boost > 0 ? 1.38 : 1);
      const velocityX = length ? direction.x / Math.max(1, length) * speed : 0;
      const velocityZ = length ? direction.z / Math.max(1, length) * speed : 0;
      const oldX = moving.x;
      const oldZ = moving.z;
      const nextX = clamp(moving.x + velocityX * delta, -8 + ARENA.radius, 8 - ARENA.radius);
      if (!pointInObstacle(nextX, moving.z, ARENA.radius)) moving.x = nextX;
      const nextZ = clamp(moving.z + velocityZ * delta, ARENA.radius + 0.28, 15 - ARENA.radius);
      if (!pointInObstacle(moving.x, nextZ, ARENA.radius)) moving.z = nextZ;
      moving.vx = (moving.x - oldX) / delta;
      moving.vz = (moving.z - oldZ) / delta;
      const distance = Math.hypot(moving.x - oldX, moving.z - oldZ);
      moving.moving = distance > 0.0001;
      if (side === 'player') this.stats.distance += distance;
      moving.stepDistance += distance;
      if (moving.stepDistance > (moving.sprint ? 1.5 : 2.45)) {
        moving.stepDistance = 0;
        if (!moving.quiet) {
          this.addTrace(side, 'step', moving, { dx: moving.vx * 0.36, dz: moving.vz * 0.36, strength: moving.sprint ? 0.95 : 0.6 });
          moving.audibleTime = moving.sprint ? 1.3 : 0.7;
        }
        if (side === 'player') this.emit('step', { quiet: moving.quiet, sprint: moving.sprint });
      }
    }

    randomFreePoint() {
      for (let attempt = 0; attempt < 24; attempt++) {
        const point = { x: this.random.range(-6.9, 6.9), z: this.random.range(2, 13.6) };
        if (!pointInObstacle(point.x, point.z, 0.7)) return point;
      }
      return { x: 0, z: 7 };
    }

    chooseEnemyTarget() {
      const memory = this.enemyBrain.memory;
      if (!memory || this.time - memory.born > 7) return this.randomFreePoint();
      const age = this.time - memory.born;
      const uncertainty = this.level.accuracy + age * 0.28;
      const prediction = clamp(age * 0.48, 0.2, 0.95);
      return {
        x: clamp(memory.x + memory.dx * prediction + this.random.offset(uncertainty), -7.6, 7.6),
        z: clamp(memory.z + memory.dz * prediction + this.random.offset(uncertainty), 0.6, 14.6)
      };
    }

    updateEnemy(delta) {
      const brain = this.enemyBrain;
      const perception = this.visibleTo('enemy');
      const available = perception.traces.filter(trace => trace.id > brain.lastTrace && this.time - trace.born >= this.level.reaction);
      if (available.length) {
        const newest = available[available.length - 1];
        brain.memory = { ...newest };
        brain.lastTrace = newest.id;
        brain.mode = 'hunt';
      }
      for (const incoming of perception.incoming) {
        if (!incoming.dodged && this.time - incoming.born > 0.23 && Math.hypot(this.enemy.x - incoming.x, this.enemy.z - incoming.z) < 2.6) {
          incoming.dodged = true;
          if (this.random.next() < this.level.dodge) {
            const angle = Math.atan2(this.enemy.z - incoming.z, this.enemy.x - incoming.x) + this.random.offset(0.7);
            brain.goal = { x: clamp(this.enemy.x + Math.cos(angle) * 3, -7, 7), z: clamp(this.enemy.z + Math.sin(angle) * 3, 1, 14) };
            brain.dodgeUntil = this.time + 0.95;
            brain.nextMove = this.time + 1.05;
          }
        }
      }
      if (this.time >= brain.nextMove || Math.hypot(this.enemy.x - brain.goal.x, this.enemy.z - brain.goal.z) < 0.4) {
        brain.goal = this.randomFreePoint();
        brain.nextMove = this.time + this.random.range(1.5, 3.5);
        brain.mode = this.random.next() < 0.2 && this.time > 12 ? 'listen' : 'move';
      }
      let direction = { x: brain.goal.x - this.enemy.x, z: brain.goal.z - this.enemy.z, sprint: brain.dodgeUntil > this.time || this.enemy.boost > 0, quiet: brain.mode === 'hunt' && this.random.next() < 0.025 };
      if (brain.mode === 'listen') direction = { x: 0, z: 0 };
      const beforeX = this.enemy.x;
      const beforeZ = this.enemy.z;
      this.move('enemy', direction, delta);
      if (brain.mode !== 'listen' && Math.hypot(this.enemy.x - beforeX, this.enemy.z - beforeZ) < 0.002) brain.nextMove = this.time;
      if (this.time > brain.nextShot) {
        if (this.enemy.ammo === 0) this.reload('enemy');
        else if (this.enemy.reloadTime <= 0) {
          this.fire('enemy', this.chooseEnemyTarget());
          brain.nextMove = Math.min(brain.nextMove, this.time + 0.2);
        }
        brain.nextShot = this.time + this.level.interval + this.random.range(-0.35, 0.5);
      }
      if (this.time > brain.nextScan) {
        this.scan('enemy', this.chooseEnemyTarget());
        brain.nextScan = this.time + this.random.range(16, 22);
      }
      if (this.enemy.hp < 55 && this.enemy.decoyCooldown <= 0 && this.random.next() < delta * 0.08) this.decoy('enemy');
    }

    tick(delta, input) {
      this.time = Math.min(ARENA.duration, this.time + delta);
      this.remaining = Math.max(0, ARENA.duration - this.time);
      for (const side of ['player', 'enemy']) {
        const entity = this[side];
        for (const field of ['fireCooldown', 'scanCooldown', 'decoyCooldown', 'boost', 'audibleTime']) entity[field] = Math.max(0, entity[field] - delta);
        if (entity.reloadTime > 0) {
          entity.reloadTime = Math.max(0, entity.reloadTime - delta);
          if (entity.reloadTime === 0) { entity.ammo = 6; this.emit('reloaded', { side }); }
        }
        this.traces[side] = this.traces[side].filter(trace => this.time - trace.born < trace.life);
      }
      this.move('player', input, delta);
      if (this.aiEnabled) this.updateEnemy(delta);
      for (const scan of this.scans) {
        if (this.time >= scan.nextPulse) {
          scan.nextPulse = this.time + 0.38;
          const subject = this[this.other(scan.owner)];
          scan.occupied = Math.hypot(subject.x - scan.x, subject.z - scan.z) < scan.radius;
          if (scan.occupied) this.addTrace(this.other(scan.owner), 'scan', subject, { dx: subject.vx * 0.24, dz: subject.vz * 0.24 });
          this.emit('scan-pulse', { side: scan.owner, occupied: scan.occupied });
        }
      }
      this.scans = this.scans.filter(scan => this.time - scan.born < scan.life);
      for (const decoy of this.decoys) {
        if (this.time >= decoy.nextPulse && decoy.pulses < 3) {
          this.addTrace(decoy.owner, 'step', { x: decoy.x + decoy.pulses * 0.55, z: decoy.z }, { dx: 0.7, dz: 0, strength: 0.9 });
          decoy.nextPulse += 0.8;
          decoy.pulses++;
        }
      }
      this.decoys = this.decoys.filter(decoy => this.time - decoy.born < 5);
      const landed = this.shots.filter(shot => this.time + 0.000001 >= shot.lands);
      this.shots = this.shots.filter(shot => this.time + 0.000001 < shot.lands);
      for (const shot of landed) {
        const victimSide = this.other(shot.owner);
        const victim = this[victimSide];
        const damage = damageAt(shot, victim);
        if (damage) {
          victim.hp = Math.max(0, victim.hp - damage);
          victim.boost = 1.65;
          if (shot.owner === 'player') { this.stats.hits++; this.stats.damage += damage; }
          else this.stats.received += damage;
        } else if (victimSide === 'player' && Math.hypot(victim.x - shot.x, victim.z - shot.z) < 2.7) this.stats.dodges++;
        const impact = { ...shot, born: this.time, damage, blocked: pointInObstacle(shot.x, shot.z) };
        this.impacts.push(impact);
        this.emit('impact', { side: shot.owner, victim: victimSide, x: shot.x, z: shot.z, damage, blocked: impact.blocked });
      }
      this.impacts = this.impacts.filter(impact => this.time - impact.born < 1.8);
      if (this.player.hp <= 0 || this.enemy.hp <= 0 || this.remaining <= 0.000001) this.finish();
    }

    step(delta, input = {}) {
      if (this.result || !Number.isFinite(delta) || delta <= 0) return;
      let left = delta;
      while (left > 0.000001 && !this.result) {
        const slice = Math.min(left, 1 / 60);
        this.tick(slice, input);
        left -= slice;
      }
    }

    finish() {
      if (this.result) return;
      if (this.remaining < 0.001) { this.remaining = 0; this.time = ARENA.duration; }
      const winner = this.player.hp === this.enemy.hp ? 'draw' : this.player.hp > this.enemy.hp ? 'player' : 'enemy';
      this.result = { winner, reason: this.player.hp <= 0 || this.enemy.hp <= 0 ? 'elimination' : 'timeout', duration: this.time, stats: { ...this.stats } };
      this.emit('finish', this.result);
    }
  }

  const api = { Duel, ARENA, OBSTACLES, DIFFICULTY, mapToWorld, worldToMap, pointInObstacle, damageAt, SeededRandom, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Blindspot = api;
})(typeof window !== 'undefined' ? window : globalThis);
