import { DIFFICULTY_CONFIG, GAME_CONFIG, type Difficulty } from './config'
import { clampToArena, randomFreePoint } from './arena'
import type { ShotSource, TimedPoint, Vec2 } from './types'

type RandomSource = () => number

/** AI 决策结果：目标坐标 + 线索来源（用于统计"信息命中率"） */
export type AIShotDecision = {
  target: Vec2
  source: ShotSource
}

type Evidence = {
  point: Vec2
  velocity?: Vec2
  receivedAt: number
  confidence: number
  source: 'exposure' | 'scan' | 'feedback'
}

const GRID_W = 22
const GRID_D = 20
const CELL = 2
const COLS = Math.ceil(GRID_W / CELL)
const ROWS = Math.ceil(GRID_D / CELL)

/**
 * AI 用一张低分辨率信念概率图追踪玩家可能的位置。
 * 每次收到暴露区、侦测轨迹或命中反馈时更新。
 * 瞄准时选取概率最高格 + 散布偏移；难度越高散布越小。
 */
export class AIController {
  private difficulty: Difficulty
  private grid: Float64Array
  private evidence: Evidence | null = null
  private nextDecisionAt = 0
  private lastFiredAt = -Infinity
  private scanUsed = false
  private scanAt = Infinity
  private lastShotPoint: Vec2 | null = null
  private readonly random: RandomSource

  constructor(difficulty: Difficulty, random: RandomSource = Math.random) {
    this.difficulty = difficulty
    this.random = random
    this.grid = new Float64Array(COLS * ROWS)
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
    this.grid.fill(1 / (COLS * ROWS))
    const config = DIFFICULTY_CONFIG[difficulty]
    this.scanAt = now + this.range(config.scanDelayMin, config.scanDelayMax)
    this.nextDecisionAt = now + this.range(2.5, 4.2)
  }

  /** 每个固定 tick 调一次，让信念图自然扩散 */
  diffuse(dt: number) {
    const decay = 0.995 ** (dt * 60)
    let sum = 0
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = Math.max(1e-9, this.grid[i] * decay)
      sum += this.grid[i]
    }
    if (sum > 0) {
      const scale = 1 / sum
      for (let i = 0; i < this.grid.length; i++) this.grid[i] *= scale
    }
  }

  receiveExposure(point: Vec2, now: number) {
    this.addEvidence(point, undefined, now, 'exposure', 0.65)
    this.adjustDecisionTiming(now)
  }

  receiveScanTrail(points: readonly TimedPoint[], now: number) {
    if (points.length === 0) return
    const last = points.at(-1)!
    const previous = points[Math.max(0, points.length - 3)]
    const dt = Math.max(0.3, last.time - previous.time)
    this.addEvidence(
      last,
      { x: (last.x - previous.x) * 1.5 / dt, z: (last.z - previous.z) * 1.5 / dt },
      now,
      'scan',
      0.92,
    )
    this.adjustDecisionTiming(now)
  }

  receiveHitFeedback(now: number) {
    if (!this.lastShotPoint) return
    this.addEvidence(this.lastShotPoint, undefined, now, 'feedback', 0.72)
  }

  shouldScan(now: number) {
    return !this.scanUsed && now >= this.scanAt
  }

  chooseScanPoint(): Vec2 {
    this.scanUsed = true
    if (this.evidence) return { ...this.evidence.point }
    return randomFreePoint(this.random, 1.5)
  }

  chooseShot(now: number): AIShotDecision | null {
    const config = DIFFICULTY_CONFIG[this.difficulty]
    if (now < this.nextDecisionAt || now - this.lastFiredAt < GAME_CONFIG.weapon.cooldown) return null

    const evidenceAge = this.evidence ? now - this.evidence.receivedAt : Infinity
    const informed = this.evidence && evidenceAge < config.clueTrustSeconds
    const source: ShotSource = informed ? this.evidence!.source : 'blind'

    const base = informed
      ? {
          x: this.evidence!.point.x + (this.evidence!.velocity?.x ?? 0) * Math.min(0.7, evidenceAge),
          z: this.evidence!.point.z + (this.evidence!.velocity?.z ?? 0) * Math.min(0.7, evidenceAge),
        }
      : this.sampleGridPeak()

    const scatter = informed
      ? config.informedScatter + evidenceAge * 0.1
      : config.blindScatter
    const angle = this.range(0, Math.PI * 2)
    const radius = Math.sqrt(this.random()) * scatter
    const target = clampToArena({
      x: base.x + Math.cos(angle) * radius,
      z: base.z + Math.sin(angle) * radius,
    })

    this.lastFiredAt = now
    this.lastShotPoint = target
    this.nextDecisionAt = now + this.range(config.decisionMin, config.decisionMax) * (informed ? 0.6 : 1)

    if (this.evidence) this.evidence.confidence *= 0.8

    return { target, source }
  }

  hasFreshEvidence(now: number) {
    return Boolean(this.evidence && now - this.evidence.receivedAt < DIFFICULTY_CONFIG[this.difficulty].clueTrustSeconds)
  }

  private addEvidence(
    point: Vec2,
    velocity: Vec2 | undefined,
    now: number,
    source: 'exposure' | 'scan' | 'feedback',
    confidence: number,
  ) {
    this.evidence = { point: { ...point }, velocity, receivedAt: now, confidence, source }
    this.boostGrid(point, confidence)
  }

  private boostGrid(center: Vec2, strength: number) {
    const range = strength * 3 + 1
    const cI = Math.floor(center.x / CELL)
    const cJ = Math.floor(center.z / CELL)
    for (let i = Math.max(0, cI - range); i <= Math.min(COLS - 1, cI + range); i++) {
      for (let j = Math.max(0, cJ - range); j <= Math.min(ROWS - 1, cJ + range); j++) {
        const dx = i - cI
        const dz = j - cJ
        const dist = Math.hypot(dx, dz)
        if (dist > range) continue
        this.grid[i * ROWS + j] += strength * Math.exp(-dist * dist / (range * range * 0.5))
      }
    }
    let sum = 0
    for (let i = 0; i < this.grid.length; i++) sum += this.grid[i]
    if (sum > 0) {
      const scale = 1 / sum
      for (let i = 0; i < this.grid.length; i++) this.grid[i] *= scale
    }
  }

  private sampleGridPeak(): Vec2 {
    let maxVal = -Infinity
    let bestI = 0
    let bestJ = 0
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const v = this.grid[i * ROWS + j]
        if (v > maxVal) {
          maxVal = v
          bestI = i
          bestJ = j
        }
      }
    }
    return clampToArena({
      x: (bestI + 0.5 + (this.random() - 0.5) * 0.6) * CELL,
      z: (bestJ + 0.5 + (this.random() - 0.5) * 0.6) * CELL,
    })
  }

  private adjustDecisionTiming(now: number) {
    const config = DIFFICULTY_CONFIG[this.difficulty]
    this.nextDecisionAt = Math.min(
      this.nextDecisionAt,
      now + config.reactionSeconds,
    )
  }
}
