import { DIFFICULTY_CONFIG, GAME_CONFIG, type Difficulty } from './config'
import { clamp } from './math'
import type { Vec2 } from './types'

type RandomSource = () => number

export type AIShotSource = 'exposure' | 'scan' | 'hit' | 'blind'

export type AIShotDecision = {
  target: Vec2
  source: AIShotSource
}

type Evidence = {
  point: Vec2
  velocity?: Vec2
  receivedAt: number
  confidence: number
  source: Exclude<AIShotSource, 'blind'>
}

export class AIController {
  private difficulty: Difficulty
  private evidence: Evidence | null = null
  private nextDecisionAt = 0
  private lastFiredAt = -Infinity
  private scanAt = Infinity
  private scanUsed = false
  private lastShotPoint: Vec2 | null = null
  private readonly random: RandomSource

  constructor(difficulty: Difficulty, random: RandomSource = Math.random) {
    this.difficulty = difficulty
    this.random = random
  }

  private range(min: number, max: number) {
    return min + this.random() * (max - min)
  }

  reset(difficulty: Difficulty, now: number) {
    this.difficulty = difficulty
    this.evidence = null
    this.lastFiredAt = -Infinity
    this.lastShotPoint = null
    this.scanUsed = false
    const config = DIFFICULTY_CONFIG[difficulty]
    this.scanAt = now + this.range(config.scanDelayMin, config.scanDelayMax)
    this.nextDecisionAt = now + this.range(2.8, 4.5)
  }

  receiveExposure(point: Vec2, now: number) {
    this.evidence = {
      point: { ...point },
      receivedAt: now,
      confidence: 0.66,
      source: 'exposure',
    }
    this.nextDecisionAt = Math.min(
      this.nextDecisionAt,
      now + DIFFICULTY_CONFIG[this.difficulty].reactionSeconds,
    )
  }

  receiveScanTrail(points: readonly Vec2[], now: number) {
    if (points.length === 0) return
    const last = points.at(-1)!
    const previous = points[Math.max(0, points.length - 3)]
    this.evidence = {
      point: { ...last },
      velocity: {
        x: (last.x - previous.x) * 1.9,
        z: (last.z - previous.z) * 1.9,
      },
      receivedAt: now,
      confidence: 0.92,
      source: 'scan',
    }
    this.nextDecisionAt = Math.min(
      this.nextDecisionAt,
      now + DIFFICULTY_CONFIG[this.difficulty].reactionSeconds,
    )
  }

  receiveHitFeedback(now: number) {
    if (!this.lastShotPoint) return
    this.evidence = {
      point: { ...this.lastShotPoint },
      receivedAt: now,
      confidence: 0.78,
      source: 'hit',
    }
  }

  shouldScan(now: number) {
    return !this.scanUsed && now >= this.scanAt
  }

  chooseScanPoint(): Vec2 {
    this.scanUsed = true
    if (this.evidence) return { ...this.evidence.point }
    return {
      x: this.range(3.5, GAME_CONFIG.arena.width - 3.5),
      z: this.range(GAME_CONFIG.arena.restrictedDepth + 2, GAME_CONFIG.arena.depth - 2),
    }
  }

  chooseShot(now: number): AIShotDecision | null {
    const config = DIFFICULTY_CONFIG[this.difficulty]
    if (now < this.nextDecisionAt || now - this.lastFiredAt < GAME_CONFIG.weapon.cooldown) return null

    const evidenceAge = this.evidence ? now - this.evidence.receivedAt : Infinity
    const informed = this.evidence && evidenceAge < 8.5
    const source: AIShotSource = informed ? this.evidence!.source : 'blind'
    const base = informed
      ? {
          x: this.evidence!.point.x + (this.evidence!.velocity?.x ?? 0) * Math.min(0.65, evidenceAge),
          z: this.evidence!.point.z + (this.evidence!.velocity?.z ?? 0) * Math.min(0.65, evidenceAge),
        }
      : {
          x: this.range(1.25, GAME_CONFIG.arena.width - 1.25),
          z: this.range(GAME_CONFIG.arena.restrictedDepth + 0.8, GAME_CONFIG.arena.depth - 0.8),
        }

    const scatter = informed
      ? config.informedScatter + evidenceAge * 0.12
      : config.blindScatter
    const angle = this.range(0, Math.PI * 2)
    const radius = Math.sqrt(this.random()) * scatter
    const target = {
      x: clamp(base.x + Math.cos(angle) * radius, 0.25, GAME_CONFIG.arena.width - 0.25),
      z: clamp(
        base.z + Math.sin(angle) * radius,
        GAME_CONFIG.arena.restrictedDepth + 0.25,
        GAME_CONFIG.arena.depth - 0.25,
      ),
    }

    this.lastFiredAt = now
    this.lastShotPoint = target
    this.nextDecisionAt = now + this.range(config.blindFireMin, config.blindFireMax) * (informed ? 0.62 : 1)

    if (this.evidence) this.evidence.confidence *= 0.82
    return { target, source }
  }

  hasFreshEvidence(now: number) {
    return Boolean(this.evidence && now - this.evidence.receivedAt < 8.5)
  }
}
