import { ARENA_DEPTH, ARENA_WIDTH, moveWithCollisions } from './geometry.js';
import { estimateTarget, noisyClue } from './inference.js';

function randomRange(min, max) { return min + (Math.random() * (max - min)); }

function insideObstacle(point, obstacle, margin = 0.55) {
  return point.x > obstacle.x - obstacle.halfX - margin
    && point.x < obstacle.x + obstacle.halfX + margin
    && point.z > obstacle.z - obstacle.halfZ - margin
    && point.z < obstacle.z + obstacle.halfZ + margin;
}

export class OpponentAI {
  constructor(obstacles) {
    this.obstacles = obstacles;
    this.observations = [];
    this.position = { x: 0, z: 0 };
    this.previousTrace = null;
    this.target = { x: 0, z: 0 };
    this.scan = null;
    this.reset(0);
  }

  reset(now) {
    this.position = this.findOpenPoint(2.2);
    this.target = this.findOpenPoint(0.7);
    this.observations.length = 0;
    this.previousTrace = null;
    this.nextWaypointAt = now + randomRange(2.2, 4.2);
    this.nextShotAt = now + randomRange(4.2, 5.7);
    this.nextFootstepAt = now + 0.6;
    this.nextScanAt = now + randomRange(15, 21);
    this.nextScanTraceAt = now;
    this.scan = null;
    this.evasiveUntil = 0;
    this.sprintUntil = 0;
    this.lastShotAt = -10;
  }

  findOpenPoint(centerBias = 1) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const point = {
        x: randomRange(-7.15, 7.15) / centerBias,
        z: randomRange(-6.65, 6.65),
      };
      if (!this.obstacles.some((obstacle) => insideObstacle(point, obstacle))) return point;
    }
    return { x: 0, z: 0 };
  }

  observe(clue) {
    this.observations.push(clue);
    if (this.observations.length > 36) this.observations.splice(0, this.observations.length - 36);
  }

  onHit(now) {
    this.evasiveUntil = now + 3.2;
    this.sprintUntil = now + 3.5;
    const angle = Math.random() * Math.PI * 2;
    this.target = {
      x: Math.max(-7.1, Math.min(7.1, this.position.x + (Math.cos(angle) * 5.2))),
      z: Math.max(-6.6, Math.min(6.6, this.position.z + (Math.sin(angle) * 5.2))),
    };
    if (this.obstacles.some((obstacle) => insideObstacle(this.target, obstacle))) this.target = this.findOpenPoint();
    this.nextWaypointAt = now + 2.4;
  }

  chooseWaypoint(now) {
    this.target = this.findOpenPoint(Math.random() < 0.4 ? 1.7 : 1);
    this.nextWaypointAt = now + randomRange(2.5, 5.4);
    if (Math.random() < 0.3) this.sprintUntil = now + randomRange(1.1, 2.4);
  }

  updateMovement(dt, now, context) {
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.55 || now >= this.nextWaypointAt) this.chooseWaypoint(now);
    const sprinting = now < this.sprintUntil || now < this.evasiveUntil;
    const speed = sprinting ? 3.65 : 2.05;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const delta = { x: (dx / length) * speed * dt, z: (dz / length) * speed * dt };
    const moved = moveWithCollisions(this.position, delta, 0.32, this.obstacles);
    if (moved.x === this.position.x && moved.z === this.position.z) this.chooseWaypoint(now);
    this.position = moved;

    if (now >= this.nextFootstepAt) {
      const cluePoint = noisyClue(this.position, sprinting ? 0.52 : 1.2);
      const clue = {
        ...cluePoint,
        type: sprinting ? 'trail' : 'footstep',
        createdAt: now,
        ttl: sprinting ? 2.6 : 2.15,
        confidence: sprinting ? 0.82 : 0.5,
        previous: sprinting ? this.previousTrace : null,
      };
      context.reveal(clue);
      this.previousTrace = { x: cluePoint.x, z: cluePoint.z };
      context.remoteStep(this.position.x / (ARENA_WIDTH / 2), sprinting);
      this.nextFootstepAt = now + (sprinting ? randomRange(0.3, 0.42) : randomRange(0.82, 1.08));
    }

    context.playerScans.forEach((scan) => {
      if (now > scan.endsAt || Math.hypot(scan.x - this.position.x, scan.z - this.position.z) > scan.radius) return;
      if (now >= scan.nextTraceAt) {
        context.reveal({ ...this.position, type: 'scan', createdAt: now, ttl: 2.5, confidence: 1, previous: scan.previousTrace });
        scan.previousTrace = { ...this.position };
        scan.nextTraceAt = now + 0.12;
        if (!scan.confirmed) { scan.confirmed = true; context.onScanConfirmed(); }
      }
    });
  }

  updateScanner(now, context) {
    if (!this.scan && now >= this.nextScanAt) {
      const estimate = estimateTarget(this.observations, now);
      const point = estimate.confidence > 0.12 ? { x: estimate.x, z: estimate.z } : this.findOpenPoint(1.45);
      this.scan = { ...point, radius: 2.65, endsAt: now + 5, warned: false };
      this.nextScanAt = now + randomRange(22, 30);
      this.nextScanTraceAt = now;
      context.onEnemyScan(point);
    }
    if (!this.scan) return;
    if (now >= this.scan.endsAt) { this.scan = null; return; }
    const playerDistance = Math.hypot(context.playerPosition.x - this.scan.x, context.playerPosition.z - this.scan.z);
    if (playerDistance <= this.scan.radius && now >= this.nextScanTraceAt) {
      this.observe({ ...context.playerPosition, type: 'scan', createdAt: now, ttl: 3.4, confidence: 1 });
      this.nextScanTraceAt = now + 0.18;
      if (!this.scan.warned) { this.scan.warned = true; context.onPlayerDetected(); }
    }
  }

  updateCombat(now, context) {
    this.observations = this.observations.filter((clue) => now - clue.createdAt < clue.ttl);
    if (now < this.nextShotAt) return;
    const estimate = estimateTarget(this.observations, now);
    let target;
    if (estimate.confidence > 0.08) {
      const anticipation = Math.min(1.2, estimate.age * 0.25);
      const uncertainty = 0.34 + ((1 - estimate.confidence) * 2.65) + anticipation;
      target = noisyClue(estimate, uncertainty);
    } else {
      const probes = [
        { x: 0, z: 3.15 }, { x: -4.8, z: 0.8 }, { x: 4.5, z: -0.2 }, { x: 0.2, z: -3.4 },
      ];
      target = noisyClue(probes[Math.floor(Math.random() * probes.length)], 2.25);
    }
    target.x = Math.max(-(ARENA_WIDTH / 2), Math.min(ARENA_WIDTH / 2, target.x));
    target.z = Math.max(-(ARENA_DEPTH / 2), Math.min(ARENA_DEPTH / 2, target.z));
    context.shoot(target, { ...this.position });
    this.lastShotAt = now;
    this.nextShotAt = now + randomRange(2.75, 4.15) + (estimate.confidence < 0.2 ? 0.65 : 0);
    this.chooseWaypoint(now);
  }

  update(dt, now, context) {
    this.updateMovement(dt, now, context);
    this.updateScanner(now, context);
    this.updateCombat(now, context);
  }
}
