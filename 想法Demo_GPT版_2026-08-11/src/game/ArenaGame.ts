import * as THREE from 'three'
import { AIController, type AIShotSource } from './AIController'
import { AudioEngine } from './AudioEngine'
import {
  DIFFICULTY_CONFIG,
  GAME_CONFIG,
  START_POSITIONS,
  type Difficulty,
} from './config'
import {
  distance2D,
  isPositionBlocked,
  pointsWithinLast,
  quantizeExposure,
  resolveMovement,
  uvToWorld,
} from './math'
import { buildArenaScene } from './SceneBuilder'
import { resolveAttackTick, winnerByHp } from './rules'
import {
  ScreenDisplay,
  type ScanVisualization,
  type ScreenExposure,
} from './ScreenDisplay'
import type {
  GameCallbacks,
  GamePhase,
  HudSnapshot,
  RoundResult,
  RoundStats,
  Settings,
  TimedPoint,
  Vec2,
} from './types'

type Attack = {
  attacker: 'player' | 'ai'
  target: Vec2
  shooterPosition: Vec2
  informed: boolean
  source?: AIShotSource
}

type ScheduledAction = {
  at: number
  run: () => void
  continueAfterRound: boolean
}

type StrikeEffect = {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  light: THREE.PointLight
  bornAt: number
}

const createStats = (): RoundStats => ({
  shots: 0,
  hits: 0,
  informedShots: 0,
  informedHits: 0,
  scans: 0,
  scanHits: 0,
  damageTaken: 0,
  aiShots: 0,
  aiBlindShots: 0,
  aiExposureShots: 0,
  aiScanShots: 0,
  aiHitFollowupShots: 0,
  elapsedSeconds: 0,
})

export class ArenaGame {
  readonly canvas: HTMLCanvasElement

  private readonly container: HTMLElement
  private readonly callbacks: GameCallbacks
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80)
  private readonly raycaster = new THREE.Raycaster()
  private readonly screen: ScreenDisplay
  private readonly audio = new AudioEngine()
  private readonly keys = new Set<string>()
  private readonly resizeObserver: ResizeObserver
  private readonly centerNdc = new THREE.Vector2(0, 0)
  private readonly scheduled: ScheduledAction[] = []
  private readonly uiTimers = new Set<number>()
  private readonly attackQueue: Attack[] = []
  private readonly strikeEffects: StrikeEffect[] = []
  private readonly playerHistory: TimedPoint[] = []
  private readonly aiHistory: TimedPoint[] = []
  private readonly random = () => {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0
    return this.randomState / 0x100000000
  }
  private readonly ai = new AIController('operator', this.random)

  private settings: Settings
  private phase: GamePhase = 'menu'
  private phaseBeforePause: 'countdown' | 'playing' = 'playing'
  private difficulty: Difficulty = 'operator'
  private player: Vec2 = { ...START_POSITIONS.player }
  private aiPosition: Vec2 = { ...START_POSITIONS.ai }
  private aiTarget: Vec2 = { x: 8, z: 8 }
  private playerHp: number = GAME_CONFIG.round.startingHp
  private aiHp: number = GAME_CONFIG.round.startingHp
  private displayedAiHp: number = GAME_CONFIG.round.startingHp
  private round = 1
  private playerScore = 0
  private aiScore = 0
  private roundElapsed = 0
  private countdownRemaining: number = GAME_CONFIG.round.countdown
  private lastCountdownInteger = GAME_CONFIG.round.countdown + 1
  private simulationTime = 0
  private fixedAccumulator = 0
  private lastFrameTime = performance.now()
  private lastHistorySample = -Infinity
  private lastHudAt = -Infinity
  private lastPlayerFireAt = -Infinity
  private playerBoostUntil = -Infinity
  private aiBoostUntil = -Infinity
  private exposureWarningUntil = -Infinity
  private aiScanWarningUntil = -Infinity
  private lastPlayerClueAt = -Infinity
  private scanAvailable = true
  private aimPosition: Vec2 | null = null
  private aimValid = false
  private pointerLocked = false
  private pointerLockUnavailable = false
  private suppressNextUnlock = false
  private yaw = 0
  private pitch = 0.225
  private recoil = 0
  private damageFlash = 0
  private wasMoving = false
  private animationFrame = 0
  private randomState = 0x5f3759df
  private roundStats = createStats()
  private roundFinalized = false
  private aiMoveStallSeconds = 0
  private scanVisualization: ScanVisualization = null
  private exposures: ScreenExposure[] = []
  private shotMarks: Array<{ point: Vec2; createdAt: number }> = []
  private readonly weapon: THREE.Group
  private readonly weaponMuzzle: THREE.PointLight
  private readonly ambientParticles: THREE.Points

  constructor(container: HTMLElement, callbacks: GameCallbacks, settings: Settings) {
    this.container = container
    this.callbacks = callbacks
    this.settings = settings
    this.difficulty = settings.difficulty
    this.randomState = (Date.now() ^ 0xa5a5a5a5) >>> 0

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.canvas = this.renderer.domElement
    this.canvas.className = 'game-canvas'
    this.canvas.setAttribute('aria-label', '坐标猎场 3D 对弈场景')
    this.canvas.tabIndex = 0
    this.container.appendChild(this.canvas)

    const sceneObjects = buildArenaScene(this.scene, this.camera)
    this.weapon = sceneObjects.weapon
    this.weaponMuzzle = sceneObjects.weaponMuzzle
    this.ambientParticles = sceneObjects.ambientParticles
    this.screen = new ScreenDisplay(this.scene)
    this.screen.renderMenu()
    this.weapon.visible = false

    this.audio.setEnabled(settings.audioEnabled)
    this.registerEvents()
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    this.resize()
    this.animationFrame = requestAnimationFrame(this.frame)
    this.emitHud(true)
  }

  setSettings(settings: Settings) {
    this.settings = settings
    this.difficulty = settings.difficulty
    this.audio.setEnabled(settings.audioEnabled)
  }

  startMatch(difficulty: Difficulty) {
    this.difficulty = difficulty
    this.settings = { ...this.settings, difficulty }
    this.playerScore = 0
    this.aiScore = 0
    this.round = 1
    void this.audio.unlock().then(() => this.audio.startHum())
    this.setupRound()
    this.requestPointerLock()
  }

  nextRound() {
    if (this.phase !== 'roundEnd') return
    this.round += 1
    this.setupRound()
    this.requestPointerLock()
  }

  restartRound() {
    if (this.phase === 'menu') return
    this.setupRound()
    this.requestPointerLock()
  }

  returnToMenu() {
    this.phase = 'menu'
    this.roundFinalized = false
    this.scheduled.length = 0
    this.clearUiTimers()
    this.attackQueue.length = 0
    this.exposures = []
    this.scanVisualization = null
    this.shotMarks = []
    this.weapon.visible = false
    this.damageFlash = 0
    this.recoil = 0
    this.container.parentElement?.style.setProperty('--damage-alpha', '0')
    this.exitPointerLock()
    this.screen.renderMenu()
    this.emitHud(true)
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.phaseBeforePause = this.phase
    this.phase = 'paused'
    this.keys.clear()
    this.exitPointerLock()
    this.emitHud(true)
  }

  resume() {
    if (this.phase !== 'paused') return
    this.phase = this.phaseBeforePause
    this.requestPointerLock()
    this.emitHud(true)
  }

  requestPointerLock() {
    if (this.phase === 'menu' || this.phase === 'roundEnd' || this.phase === 'matchEnd') return
    if (this.pointerLockUnavailable) {
      this.canvas.focus()
      return
    }
    if (document.pointerLockElement === this.canvas) return

    const request = (this.canvas as HTMLCanvasElement & {
      requestPointerLock?: () => Promise<void> | void
    }).requestPointerLock
    if (typeof request !== 'function') {
      this.activatePointerLockFallback()
      return
    }

    try {
      const result = request.call(this.canvas)
      if (result && typeof result.catch === 'function') {
        void result.catch(this.activatePointerLockFallback)
      }
    } catch {
      this.activatePointerLockFallback()
    }
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame)
    this.unregisterEvents()
    this.resizeObserver.disconnect()
    this.audio.dispose()
    this.clearUiTimers()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    })
    this.renderer.dispose()
    this.canvas.remove()
  }

  private setupRound() {
    this.phase = 'countdown'
    this.phaseBeforePause = 'countdown'
    this.roundFinalized = false
    this.player = this.round % 2 === 1 ? { ...START_POSITIONS.player } : { ...START_POSITIONS.ai }
    this.aiPosition = this.round % 2 === 1 ? { ...START_POSITIONS.ai } : { ...START_POSITIONS.player }
    this.aiTarget = this.chooseAiTarget()
    this.playerHp = GAME_CONFIG.round.startingHp
    this.aiHp = GAME_CONFIG.round.startingHp
    this.displayedAiHp = GAME_CONFIG.round.startingHp
    this.roundElapsed = 0
    this.countdownRemaining = GAME_CONFIG.round.countdown
    this.lastCountdownInteger = GAME_CONFIG.round.countdown + 1
    this.simulationTime = 0
    this.fixedAccumulator = 0
    this.lastHistorySample = 0
    this.lastHudAt = -Infinity
    this.lastPlayerFireAt = -Infinity
    this.playerBoostUntil = -Infinity
    this.aiBoostUntil = -Infinity
    this.exposureWarningUntil = -Infinity
    this.aiScanWarningUntil = -Infinity
    this.lastPlayerClueAt = -Infinity
    this.scanAvailable = true
    this.aimPosition = null
    this.aimValid = false
    const screenDeltaX = GAME_CONFIG.arena.width / 2 - this.player.x
    const screenDeltaZ = -this.player.z
    const screenDistance = Math.hypot(screenDeltaX, screenDeltaZ)
    this.yaw = -Math.atan2(screenDeltaX, -screenDeltaZ)
    this.pitch = Math.atan2(4.68 - 1.72, screenDistance)
    this.recoil = 0
    this.damageFlash = 0
    this.roundStats = createStats()
    this.aiMoveStallSeconds = 0
    this.scanVisualization = null
    this.exposures = []
    this.shotMarks = []
    this.scheduled.length = 0
    this.clearUiTimers()
    this.attackQueue.length = 0
    this.playerHistory.length = 0
    this.aiHistory.length = 0
    this.playerHistory.push({ ...this.player, time: 0 })
    this.aiHistory.push({ ...this.aiPosition, time: 0 })
    this.clearStrikeEffects()
    this.ai.reset(this.difficulty, 0)
    this.camera.position.set(this.player.x, 1.72, this.player.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.weapon.visible = true
    this.callbacks.onToast({ text: `第 ${this.round} 回合`, tone: 'neutral', duration: 1.4 })
    this.emitHud(true)
    this.renderScreen()
  }

  private readonly frame = (now: number) => {
    const delta = Math.max(0, (now - this.lastFrameTime) / 1000)
    const visualDelta = Math.min(0.1, delta)
    this.lastFrameTime = now

    if (this.phase === 'menu') {
      this.updateAttractCamera(now)
    } else if (this.phase === 'countdown') {
      this.updateAim()
      this.updateCountdown(delta)
    } else if (this.phase === 'playing') {
      this.updatePlaying(delta)
    } else {
      this.updateAim()
    }

    this.updateWeapon(now)
    this.updateVisualEffects(visualDelta)
    this.ambientParticles.rotation.y += visualDelta * 0.008
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.frame)
  }

  private updateAttractCamera(now: number) {
    const time = now * 0.00014
    this.camera.position.set(8 + Math.sin(time) * 2.1, 2.2 + Math.sin(time * 0.7) * 0.18, 13.2)
    this.camera.lookAt(8, 4.55, 0)
  }

  private updateCountdown(delta: number) {
    this.countdownRemaining = Math.max(0, this.countdownRemaining - delta)
    const integer = Math.ceil(this.countdownRemaining)
    let shouldEmit = false
    if (integer !== this.lastCountdownInteger) {
      this.lastCountdownInteger = integer
      this.audio.countdown(integer === 0)
      shouldEmit = true
    }
    if (this.countdownRemaining <= 0) {
      this.phase = 'playing'
      this.phaseBeforePause = 'playing'
      this.callbacks.onToast({ text: '交火开始', tone: 'warning', duration: 1.2 })
      shouldEmit = true
    }
    this.emitHud(shouldEmit)
  }

  private updatePlaying(delta: number) {
    this.updateAim()
    this.fixedAccumulator += delta
    while (
      this.fixedAccumulator >= GAME_CONFIG.weapon.fixedTick &&
      this.phase === 'playing'
    ) {
      this.runFixedStep(GAME_CONFIG.weapon.fixedTick)
      this.fixedAccumulator -= GAME_CONFIG.weapon.fixedTick
    }

    this.emitHud()
  }

  private runFixedStep(delta: number) {
    const remaining = Math.max(0, GAME_CONFIG.round.duration - this.roundElapsed)
    if (remaining === 0) {
      this.processAttackQueue()
      if (!this.roundFinalized) this.finishByTime()
      return
    }

    const step = Math.min(delta, remaining)
    this.simulationTime += step
    this.roundElapsed += step
    this.updatePlayerMovement(step)
    this.updateAiMovement(step)
    this.sampleHistory()
    this.runScheduledActions()

    const reachedDeadline = this.roundElapsed >= GAME_CONFIG.round.duration - 1e-9
    if (!reachedDeadline) this.updateAiDecisions()
    this.processAttackQueue()

    this.exposures = this.exposures.filter((exposure) => exposure.endsAt > this.simulationTime)
    this.shotMarks = this.shotMarks.filter((mark) => this.simulationTime - mark.createdAt <= 1.2)

    if (!this.roundFinalized && reachedDeadline) this.finishByTime()
  }

  private updatePlayerMovement(delta: number) {
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
    const strafe = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const length = Math.hypot(forward, strafe)
    this.wasMoving = length > 0

    if (length > 0) {
      const normalizedForward = forward / length
      const normalizedStrafe = strafe / length
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      const direction = {
        x: -sin * normalizedForward + cos * normalizedStrafe,
        z: -cos * normalizedForward - sin * normalizedStrafe,
      }
      const speed = this.simulationTime < this.playerBoostUntil
        ? GAME_CONFIG.movement.boostedSpeed
        : GAME_CONFIG.movement.baseSpeed
      const desired = {
        x: this.player.x + direction.x * speed * delta,
        z: this.player.z + direction.z * speed * delta,
      }
      this.player = resolveMovement(this.player, desired)
    }

    const bob = this.wasMoving ? Math.sin(this.simulationTime * 12) * 0.025 : 0
    this.camera.position.set(this.player.x, 1.72 + bob, this.player.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private updateAiMovement(delta: number) {
    const dx = this.aiTarget.x - this.aiPosition.x
    const dz = this.aiTarget.z - this.aiPosition.z
    const distance = Math.hypot(dx, dz)
    if (distance < 0.55) {
      this.aiTarget = this.chooseAiTarget()
      return
    }

    const speed = this.simulationTime < this.aiBoostUntil
      ? GAME_CONFIG.movement.boostedSpeed
      : DIFFICULTY_CONFIG[this.difficulty].movementSpeed
    const desired = {
      x: this.aiPosition.x + (dx / distance) * speed * delta,
      z: this.aiPosition.z + (dz / distance) * speed * delta,
    }
    const resolved = resolveMovement(this.aiPosition, desired)
    if (distance2D(resolved, this.aiPosition) < 0.001) {
      this.aiMoveStallSeconds += delta
      if (this.aiMoveStallSeconds > 0.2) {
        this.aiTarget = this.chooseAiTarget()
        this.aiMoveStallSeconds = 0
      }
    } else {
      this.aiMoveStallSeconds = 0
      this.aiPosition = resolved
    }
  }

  private chooseAiTarget() {
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const point = {
        x: 0.9 + this.random() * (GAME_CONFIG.arena.width - 1.8),
        z: GAME_CONFIG.arena.restrictedDepth + 0.9 + this.random() * (GAME_CONFIG.arena.depth - GAME_CONFIG.arena.restrictedDepth - 1.8),
      }
      if (!isPositionBlocked(point, GAME_CONFIG.arena.playerRadius + 0.24)) return point
    }
    return { x: 8, z: 13.4 }
  }

  private sampleHistory() {
    if (this.simulationTime - this.lastHistorySample < 0.1) return
    this.lastHistorySample = this.simulationTime
    this.playerHistory.push({ ...this.player, time: this.simulationTime })
    this.aiHistory.push({ ...this.aiPosition, time: this.simulationTime })
    const cutoff = this.simulationTime - GAME_CONFIG.historySeconds
    while (this.playerHistory[0]?.time < cutoff) this.playerHistory.shift()
    while (this.aiHistory[0]?.time < cutoff) this.aiHistory.shift()
  }

  private updateAiDecisions() {
    if (this.ai.shouldScan(this.simulationTime)) {
      const center = this.ai.chooseScanPoint()
      this.aiScanWarningUntil = this.simulationTime + 1.4
      this.audio.scan()
      const hit = distance2D(center, this.player) <= GAME_CONFIG.scan.radius
      if (hit) {
        const trail = pointsWithinLast(
          this.playerHistory,
          this.simulationTime,
          GAME_CONFIG.scan.trailSeconds,
        )
        this.ai.receiveScanTrail(trail, this.simulationTime)
      }
      this.callbacks.onToast({
        text: hit ? '敌方侦测捕获了你的轨迹' : '敌方侦测未命中',
        tone: hit ? 'danger' : 'neutral',
        duration: 1.8,
      })
    }

    const shot = this.ai.chooseShot(this.simulationTime)
    if (shot) this.queueAiFire(shot.target, shot.source)
  }

  private queuePlayerFire() {
    if (this.phase !== 'playing') return
    const cooldown = GAME_CONFIG.weapon.cooldown - (this.simulationTime - this.lastPlayerFireAt)
    if (cooldown > 0) {
      this.audio.click()
      return
    }
    if (!this.aimValid || !this.aimPosition) {
      this.audio.click()
      this.callbacks.onToast({ text: '瞄准中央坐标图', tone: 'neutral', duration: 0.9 })
      return
    }

    const target = { ...this.aimPosition }
    const shooterPosition = { ...this.player }
    const informed = this.simulationTime - this.lastPlayerClueAt <= 2
    this.lastPlayerFireAt = this.simulationTime
    this.roundStats.shots += 1
    if (informed) this.roundStats.informedShots += 1
    this.attackQueue.push({ attacker: 'player', target, shooterPosition, informed })
    this.shotMarks.push({ point: target, createdAt: this.simulationTime })
    this.recoil = 1
    this.weaponMuzzle.intensity = 22
    this.audio.fire()

    this.schedule(this.simulationTime + GAME_CONFIG.exposure.delay, () => {
      this.ai.receiveExposure(quantizeExposure(shooterPosition), this.simulationTime)
      this.exposureWarningUntil = this.simulationTime + 1.15
      this.callbacks.onToast({ text: '你的开火区域已暴露', tone: 'warning', duration: 1.2 })
    })
  }

  private queuePlayerScan() {
    if (this.phase !== 'playing') return
    if (!this.scanAvailable) {
      this.audio.click()
      return
    }
    if (!this.aimValid || !this.aimPosition) {
      this.audio.click()
      this.callbacks.onToast({ text: '侦测坐标无效', tone: 'neutral', duration: 0.9 })
      return
    }

    const center = { ...this.aimPosition }
    this.scanAvailable = false
    this.roundStats.scans += 1
    this.audio.scan()
    const hit = distance2D(center, this.aiPosition) <= GAME_CONFIG.scan.radius
    const trail = hit
      ? pointsWithinLast(this.aiHistory, this.simulationTime, GAME_CONFIG.scan.trailSeconds)
      : []
    if (hit) {
      this.roundStats.scanHits += 1
      this.lastPlayerClueAt = this.simulationTime
    }
    this.scanVisualization = {
      center,
      hit,
      trail,
      endsAt: this.simulationTime + GAME_CONFIG.scan.displaySeconds,
    }
    this.callbacks.onToast({
      text: hit ? '捕获历史轨迹' : '侦测区域为空',
      tone: hit ? 'success' : 'neutral',
      duration: 1.5,
    })
    this.emitHud(true)
    this.renderScreen()
  }

  private queueAiFire(target: Vec2, source: AIShotSource) {
    const shooterPosition = { ...this.aiPosition }
    this.roundStats.aiShots += 1
    if (source === 'blind') this.roundStats.aiBlindShots += 1
    if (source === 'exposure') this.roundStats.aiExposureShots += 1
    if (source === 'scan') this.roundStats.aiScanShots += 1
    if (source === 'hit') this.roundStats.aiHitFollowupShots += 1
    this.attackQueue.push({
      attacker: 'ai',
      target: { ...target },
      shooterPosition,
      informed: source !== 'blind',
      source,
    })
    this.audio.enemyFire()
    this.schedule(this.simulationTime + GAME_CONFIG.exposure.delay, () => {
      this.exposures.push({
        point: quantizeExposure(shooterPosition),
        startsAt: this.simulationTime,
        endsAt: this.simulationTime + GAME_CONFIG.exposure.duration,
      })
      this.lastPlayerClueAt = this.simulationTime
      this.callbacks.onToast({ text: '捕获敌方开火区域', tone: 'warning', duration: 1 })
    })
  }

  private processAttackQueue() {
    if (this.attackQueue.length === 0 || this.roundFinalized) return
    const attacks = this.attackQueue.splice(0)
    const resolution = resolveAttackTick(
      {
        playerHp: this.playerHp,
        aiHp: this.aiHp,
        playerPosition: this.player,
        aiPosition: this.aiPosition,
      },
      attacks,
    )

    for (const { attack, hit } of resolution.results) {
      if (attack.attacker === 'player') {
        if (hit) {
          this.roundStats.hits += 1
          if (attack.informed) this.roundStats.informedHits += 1
          this.aiBoostUntil = this.simulationTime + GAME_CONFIG.movement.boostDuration
          this.aiTarget = this.chooseAiTarget()
          const visibleHp = resolution.aiHp
          this.schedule(this.simulationTime + GAME_CONFIG.weapon.hitFeedbackDelay, () => {
            this.displayedAiHp = visibleHp
            this.audio.hitConfirm()
            this.callbacks.onToast({ text: '坐标命中', tone: 'success', duration: 1.1 })
            this.emitHud(true)
          }, true)
        }
      } else {
        this.createStrikeEffect(attack.target)
        if (hit) {
          this.roundStats.damageTaken += 1
          this.playerBoostUntil = this.simulationTime + GAME_CONFIG.movement.boostDuration
          this.damageFlash = 1
          this.audio.hurt()
          this.schedule(this.simulationTime + GAME_CONFIG.weapon.hitFeedbackDelay, () => {
            this.ai.receiveHitFeedback(this.simulationTime)
          })
        }
      }
    }

    this.playerHp = resolution.playerHp
    this.aiHp = resolution.aiHp

    if (resolution.winner) this.finishRound(resolution.winner, 'elimination')
  }

  private finishByTime() {
    this.finishRound(winnerByHp(this.playerHp, this.aiHp), 'time')
  }

  private finishRound(winner: 'player' | 'ai' | 'draw', reason: 'elimination' | 'time') {
    if (this.roundFinalized) return
    this.roundFinalized = true
    if (winner === 'player') this.playerScore += 1
    if (winner === 'ai') this.aiScore += 1
    const matchComplete =
      this.playerScore >= GAME_CONFIG.round.winsToMatch ||
      this.aiScore >= GAME_CONFIG.round.winsToMatch
    this.phase = matchComplete ? 'matchEnd' : 'roundEnd'
    this.roundStats.elapsedSeconds = Math.min(this.roundElapsed, GAME_CONFIG.round.duration)
    this.continueRoundEndFeedback()
    this.exitPointerLock()
    this.keys.clear()

    const result: RoundResult = {
      winner,
      reason,
      playerHp: this.playerHp,
      aiHp: this.aiHp,
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      round: this.round,
      matchComplete,
      stats: { ...this.roundStats },
    }
    this.emitHud(true)
    this.renderScreen()
    this.callbacks.onRoundEnd(result)
  }

  private updateAim() {
    this.raycaster.setFromCamera(this.centerNdc, this.camera)
    const hit = this.raycaster.intersectObject(this.screen.mapMesh, false)[0]
    if (!hit?.uv) {
      this.aimPosition = null
      this.aimValid = false
      return
    }
    const mapped = uvToWorld(hit.uv.x, hit.uv.y)
    this.aimPosition = mapped
    this.aimValid = mapped !== null
  }

  private schedule(at: number, run: () => void, continueAfterRound = false) {
    this.scheduled.push({ at, run, continueAfterRound })
  }

  private runScheduledActions() {
    for (let index = this.scheduled.length - 1; index >= 0; index -= 1) {
      const action = this.scheduled[index]
      if (action.at > this.simulationTime) continue
      this.scheduled.splice(index, 1)
      action.run()
    }
  }

  private continueRoundEndFeedback() {
    for (let index = this.scheduled.length - 1; index >= 0; index -= 1) {
      const action = this.scheduled[index]
      if (!action.continueAfterRound) continue
      this.scheduled.splice(index, 1)
      const delay = Math.max(0, action.at - this.simulationTime)
      const timer = window.setTimeout(() => {
        this.uiTimers.delete(timer)
        action.run()
      }, delay * 1000)
      this.uiTimers.add(timer)
    }
  }

  private clearUiTimers() {
    for (const timer of this.uiTimers) window.clearTimeout(timer)
    this.uiTimers.clear()
  }

  private createStrikeEffect(point: Vec2) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xe14e3d,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.74, 48), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(point.x, 0.035, point.z)
    this.scene.add(mesh)
    const light = new THREE.PointLight(0xff3e2d, 11, 3.8, 2)
    light.position.set(point.x, 0.7, point.z)
    this.scene.add(light)
    this.strikeEffects.push({ mesh, light, bornAt: this.simulationTime })
  }

  private updateVisualEffects(delta: number) {
    this.recoil = Math.max(0, this.recoil - delta * 7.5)
    this.damageFlash = Math.max(0, this.damageFlash - delta * 1.35)
    this.container.parentElement?.style.setProperty('--damage-alpha', this.damageFlash.toFixed(3))
    this.weaponMuzzle.intensity = Math.max(0, this.weaponMuzzle.intensity - delta * 170)

    for (let index = this.strikeEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.strikeEffects[index]
      const age = this.simulationTime - effect.bornAt
      effect.mesh.scale.setScalar(1 + age * 1.8)
      effect.mesh.material.opacity = Math.max(0, 0.85 - age * 1.7)
      effect.light.intensity = Math.max(0, 11 - age * 24)
      if (age < 0.58) continue
      effect.mesh.geometry.dispose()
      effect.mesh.material.dispose()
      effect.mesh.removeFromParent()
      effect.light.removeFromParent()
      this.strikeEffects.splice(index, 1)
    }
  }

  private updateWeapon(now: number) {
    if (!this.weapon.visible) return
    const moveBob = this.wasMoving && this.phase === 'playing' ? Math.sin(now * 0.012) * 0.012 : 0
    this.weapon.position.x = 0.34 + moveBob
    this.weapon.position.y = -0.31 + Math.abs(moveBob) * 0.5
    this.weapon.position.z = -0.58 + this.recoil * 0.12
    this.weapon.rotation.x = -this.recoil * 0.08
  }

  private clearStrikeEffects() {
    for (const effect of this.strikeEffects) {
      effect.mesh.geometry.dispose()
      effect.mesh.material.dispose()
      effect.mesh.removeFromParent()
      effect.light.removeFromParent()
    }
    this.strikeEffects.length = 0
  }

  private renderScreen() {
    this.screen.render({
      now: this.simulationTime,
      exposures: this.exposures,
      scan: this.scanVisualization,
      shotMarks: this.shotMarks,
      playerHp: this.playerHp,
      aiHp: this.displayedAiHp,
      timeRemaining: Math.max(0, GAME_CONFIG.round.duration - this.roundElapsed),
      fireCooldown: Math.max(0, GAME_CONFIG.weapon.cooldown - (this.simulationTime - this.lastPlayerFireAt)),
      scanAvailable: this.scanAvailable,
      round: this.round,
      playerScore: this.playerScore,
      aiScore: this.aiScore,
    })
  }

  private emitHud(force = false) {
    if (!force && this.simulationTime - this.lastHudAt < 0.08) return
    this.lastHudAt = this.simulationTime
    const snapshot: HudSnapshot = {
      phase: this.phase,
      difficulty: this.difficulty,
      round: this.round,
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      playerHp: this.playerHp,
      aiHp: this.displayedAiHp,
      timeRemaining: Math.max(0, GAME_CONFIG.round.duration - this.roundElapsed),
      countdownRemaining: this.countdownRemaining,
      fireCooldown: Math.max(0, GAME_CONFIG.weapon.cooldown - (this.simulationTime - this.lastPlayerFireAt)),
      scanAvailable: this.scanAvailable,
      speedBoostRemaining: Math.max(0, this.playerBoostUntil - this.simulationTime),
      playerPosition: { ...this.player },
      aimPosition: this.aimPosition ? { ...this.aimPosition } : null,
      aimValid: this.aimValid,
      pointerLocked: this.pointerLocked,
      exposureWarning: this.simulationTime < this.exposureWarningUntil,
      aiScanning: this.simulationTime < this.aiScanWarningUntil,
    }
    this.callbacks.onHud(snapshot)
    this.renderScreen()
    this.container.parentElement?.style.setProperty('--damage-alpha', this.damageFlash.toFixed(3))
  }

  private readonly resize = () => {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    const canLook =
      this.pointerLocked ||
      (this.pointerLockUnavailable && document.activeElement === this.canvas)
    if (!canLook || (this.phase !== 'playing' && this.phase !== 'countdown')) return
    const sensitivity = this.settings.mouseSensitivity * 0.00155
    this.yaw -= event.movementX * sensitivity
    this.pitch -= event.movementY * sensitivity
    this.pitch = Math.max(-1.28, Math.min(1.18, this.pitch))
  }

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 2) event.preventDefault()
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    if (!this.pointerLocked && !this.pointerLockUnavailable) {
      this.requestPointerLock()
      return
    }
    if (this.pointerLockUnavailable) this.canvas.focus()
    if (event.button === 0) this.queuePlayerFire()
    if (event.button === 2) this.queuePlayerScan()
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code)
    if (
      event.code === 'Escape' &&
      this.pointerLockUnavailable &&
      (this.phase === 'playing' || this.phase === 'countdown')
    ) {
      this.phaseBeforePause = this.phase
      this.phase = 'paused'
      this.keys.clear()
      this.callbacks.onPauseRequest()
      this.emitHud(true)
      return
    }
    if (event.repeat || this.phase !== 'playing') return
    if (event.code === 'KeyE') this.queuePlayerScan()
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  private readonly onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.canvas
    const wasLocked = this.pointerLocked
    this.pointerLocked = locked
    if (locked) {
      this.pointerLockUnavailable = false
      this.canvas.classList.remove('is-pointer-fallback')
    }
    if (!locked && wasLocked) {
      if (this.suppressNextUnlock) {
        this.suppressNextUnlock = false
      } else if (this.phase === 'playing' || this.phase === 'countdown') {
        this.phaseBeforePause = this.phase
        this.phase = 'paused'
        this.keys.clear()
        this.callbacks.onPauseRequest()
      }
    }
    this.emitHud(true)
  }

  private readonly onWindowBlur = () => {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.phaseBeforePause = this.phase
    this.phase = 'paused'
    this.keys.clear()
    this.exitPointerLock()
    this.callbacks.onPauseRequest()
    this.emitHud(true)
  }

  private readonly onVisibilityChange = () => {
    if (!document.hidden) return
    this.onWindowBlur()
  }

  private readonly activatePointerLockFallback = () => {
    if (this.pointerLockUnavailable) return
    this.pointerLockUnavailable = true
    this.pointerLocked = false
    this.canvas.classList.add('is-pointer-fallback')
    this.canvas.focus()
    this.callbacks.onToast({
      text: '已启用窗口内鼠标控制',
      tone: 'neutral',
      duration: 1.5,
    })
    this.emitHud(true)
  }

  private readonly onPointerLockError = () => {
    this.activatePointerLockFallback()
  }

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  private registerEvents() {
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('pointerlockerror', this.onPointerLockError)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    document.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('blur', this.onWindowBlur)
    this.canvas.addEventListener('mousedown', this.onMouseDown)
  }

  private unregisterEvents() {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('pointerlockerror', this.onPointerLockError)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    document.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('blur', this.onWindowBlur)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
  }

  private exitPointerLock() {
    if (document.pointerLockElement !== this.canvas) return
    this.suppressNextUnlock = true
    document.exitPointerLock()
  }
}
