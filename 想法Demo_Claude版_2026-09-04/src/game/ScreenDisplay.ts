import * as THREE from 'three'
import { GAME_CONFIG, OBSTACLES } from './config'
import { worldToUv } from './mapping'
import type { Vec2 } from './types'

/**
 * 巨幕坐标图：贴在房间前墙上的 2D 战术地图。
 * 全部内容画在一张 960×900 的 CanvasTexture 上，包含：
 * 22×20 俯视网格、禁入区、障碍、敌方开火暴露格、己方侦测圆、己方落点与 HUD 读数。
 */

export type ScreenExposure = {
  point: Vec2
  startsAt: number
  endsAt: number
}

export type ScanVisualization = {
  center: Vec2
  hit: boolean
  trail: readonly Vec2[]
  endsAt: number
} | null

export type ScreenDisplayState = {
  now: number
  exposures: readonly ScreenExposure[]
  scan: ScanVisualization
  shotMarks: readonly { point: Vec2; createdAt: number }[]
  playerHp: number
  aiHp: number
  maxHp: number
  timeRemaining: number
  fireCooldown: number
  scansLeft: number
  round: number
  playerScore: number
  aiScore: number
}

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 900

/** 顶部 HUD 条与 "FAR WALL" 标签的高度 */
const MARGIN_TOP = 48
/** 地图净区：920×800 严格保持 22:20，不拉伸 */
const WORLD_LEFT = (CANVAS_WIDTH - 920) / 2
const WORLD_TOP = MARGIN_TOP
const WORLD_WIDTH = 920
const WORLD_HEIGHT = 800

const BACKGROUND = '#061413'
const GRID_COLOR = 'rgba(77, 122, 110, '
const LABEL_COLOR = '#7fa39a'
const HUD_LABEL_COLOR = '#6f8b83'
const HUD_TEXT_COLOR = '#c4ded6'
const TEAL = '#59d9c5'
const AMBER = 'rgba(233, 158, 54, '

/** 统一等宽字体：全图与 HUD 共用 */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const SHOT_MARK_SECONDS = 1.15
const EXPOSURE_FADE_SECONDS = 0.35

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')
  return { canvas, context }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export class ScreenDisplay {
  readonly mapMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly mapCanvas: HTMLCanvasElement
  private readonly mapContext: CanvasRenderingContext2D
  private readonly mapTexture: THREE.CanvasTexture
  /** 菜单首次渲染时刻，用于开场淡入 */
  private menuStartAt: number | undefined

  constructor(scene: THREE.Scene) {
    const map = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
    this.mapCanvas = map.canvas
    this.mapContext = map.context
    this.mapTexture = new THREE.CanvasTexture(this.mapCanvas)
    this.mapTexture.colorSpace = THREE.SRGBColorSpace
    this.mapTexture.anisotropy = 8

    this.mapMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME_CONFIG.screen.mapWidth, GAME_CONFIG.screen.mapHeight),
      new THREE.MeshBasicMaterial({ map: this.mapTexture, toneMapped: false }),
    )
    this.mapMesh.position.set(
      GAME_CONFIG.arena.width / 2,
      GAME_CONFIG.screen.bottomHeight + GAME_CONFIG.screen.mapHeight / 2,
      GAME_CONFIG.screen.planeZ,
    )
    this.mapMesh.name = 'coordinate-map'
    scene.add(this.mapMesh)
  }

  render(state: ScreenDisplayState) {
    const context = this.mapContext
    context.fillStyle = BACKGROUND
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    this.drawGrid(context)
    this.drawRestrictionZone(context)
    for (const obstacle of OBSTACLES) this.drawObstacle(context, obstacle)
    for (const exposure of state.exposures) this.drawExposure(context, exposure, state.now)
    if (state.scan) this.drawScan(context, state.scan, state.now)
    for (const mark of state.shotMarks) this.drawShotMark(context, mark, state.now)
    this.drawNoise(context, state.now)
    this.drawHud(context, state)
    this.mapTexture.needsUpdate = true
  }

  renderMenu() {
    const context = this.mapContext
    const startedAt = (this.menuStartAt ??= performance.now())
    const reveal = clamp01((performance.now() - startedAt) / 1200)
    context.fillStyle = BACKGROUND
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    this.drawGrid(context)
    for (const obstacle of OBSTACLES) this.drawObstacle(context, obstacle)
    const centerX = CANVAS_WIDTH / 2
    const alpha = Math.min(1, reveal * 1.6)
    context.save()
    context.globalAlpha = alpha
    context.fillStyle = 'rgba(6, 20, 19, 0.58)'
    context.fillRect(WORLD_LEFT - 24, 108, WORLD_WIDTH + 48, WORLD_HEIGHT - 186)
    context.textAlign = 'center'
    context.fillStyle = '#cae8df'
    context.font = `600 34px ${MONO}`
    context.fillText('COORDINATE HUNT', centerX, 260)
    context.fillStyle = TEAL
    context.font = `700 64px ${MONO}`
    context.fillText('坐标猎场', centerX, 352)
    context.fillStyle = '#a88a51'
    context.fillRect(centerX - 185, 394, 370, 3)
    context.fillStyle = '#7e9c94'
    context.font = `500 20px ${MONO}`
    context.fillText('3D CHAMBER / BLIND COORDINATE DUEL', centerX, 442)
    context.fillStyle = '#5e7a73'
    context.font = `500 15px ${MONO}`
    context.fillText(`ARENA ${GAME_CONFIG.arena.width} × ${GAME_CONFIG.arena.depth} · ROUND ${GAME_CONFIG.round.duration}s`, centerX, 478)
    context.restore()
    this.mapTexture.needsUpdate = true
  }

  /** 网格：2m 细分线 + 4m 加粗线，边缘坐标刻度与地形标签 */
  private drawGrid(context: CanvasRenderingContext2D) {
    context.lineWidth = 1
    for (let x = 0; x <= GAME_CONFIG.arena.width; x += 2) {
      const px = WORLD_LEFT + (x / GAME_CONFIG.arena.width) * WORLD_WIDTH
      context.strokeStyle = x % 4 === 0 ? `${GRID_COLOR}0.62)` : `${GRID_COLOR}0.22)`
      context.beginPath()
      context.moveTo(px, WORLD_TOP)
      context.lineTo(px, WORLD_TOP + WORLD_HEIGHT)
      context.stroke()
    }
    for (let z = 0; z <= GAME_CONFIG.arena.depth; z += 2) {
      const py = this.toCanvas({ x: 0, z }).y
      context.strokeStyle = z % 4 === 0 ? `${GRID_COLOR}0.62)` : `${GRID_COLOR}0.22)`
      context.beginPath()
      context.moveTo(WORLD_LEFT, py)
      context.lineTo(WORLD_LEFT + WORLD_WIDTH, py)
      context.stroke()
    }

    // 坐标刻度
    context.fillStyle = LABEL_COLOR
    context.font = `600 15px ${MONO}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let x = 0; x <= GAME_CONFIG.arena.width; x += 4) {
      const px = this.toCanvas({ x, z: 0 }).x
      context.fillText(`X ${x}`, px, CANVAS_HEIGHT - 24)
    }
    context.textAlign = 'right'
    for (let z = 0; z <= GAME_CONFIG.arena.depth; z += 4) {
      const py = this.toCanvas({ x: 0, z }).y
      context.fillText(`Z ${z}`, WORLD_LEFT - 8, py)
    }
    context.textBaseline = 'alphabetic'

    // 地图净区边框与四角刻度
    context.strokeStyle = 'rgba(77, 122, 110, 0.85)'
    context.lineWidth = 2
    context.strokeRect(WORLD_LEFT, WORLD_TOP, WORLD_WIDTH, WORLD_HEIGHT)
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(WORLD_LEFT - 12, WORLD_TOP)
    context.lineTo(WORLD_LEFT + 6, WORLD_TOP)
    context.moveTo(WORLD_LEFT, WORLD_TOP - 12)
    context.lineTo(WORLD_LEFT, WORLD_TOP + 6)
    context.moveTo(WORLD_LEFT + WORLD_WIDTH - 6, WORLD_TOP)
    context.lineTo(WORLD_LEFT + WORLD_WIDTH + 12, WORLD_TOP)
    context.moveTo(WORLD_LEFT + WORLD_WIDTH, WORLD_TOP - 12)
    context.lineTo(WORLD_LEFT + WORLD_WIDTH, WORLD_TOP + 6)
    context.moveTo(WORLD_LEFT - 12, WORLD_TOP + WORLD_HEIGHT)
    context.lineTo(WORLD_LEFT + 6, WORLD_TOP + WORLD_HEIGHT)
    context.moveTo(WORLD_LEFT, WORLD_TOP + WORLD_HEIGHT - 6)
    context.lineTo(WORLD_LEFT, WORLD_TOP + WORLD_HEIGHT + 12)
    context.moveTo(WORLD_LEFT + WORLD_WIDTH - 6, WORLD_TOP + WORLD_HEIGHT)
    context.lineTo(WORLD_LEFT + WORLD_WIDTH + 12, WORLD_TOP + WORLD_HEIGHT)
    context.moveTo(WORLD_LEFT + WORLD_WIDTH, WORLD_TOP + WORLD_HEIGHT - 6)
    context.lineTo(WORLD_LEFT + WORLD_WIDTH, WORLD_TOP + WORLD_HEIGHT + 12)
    context.stroke()

    // 地形标签
    context.font = `600 17px ${MONO}`
    context.fillStyle = '#89afa5'
    context.textAlign = 'left'
    context.fillText('NEAR / SCREEN · Z 0', WORLD_LEFT + 10, WORLD_TOP + WORLD_HEIGHT - 18)
    context.textAlign = 'right'
    context.fillText(`FAR WALL · Z ${GAME_CONFIG.arena.depth}`, WORLD_LEFT + WORLD_WIDTH - 10, WORLD_TOP + 18)
  }

  /** 贴屏禁入区：橙色虚线 + 弱填充 */
  private drawRestrictionZone(context: CanvasRenderingContext2D) {
    const { restrictedDepth } = GAME_CONFIG.arena
    if (restrictedDepth <= 0) return
    const lineY = this.toCanvas({ x: 0, z: restrictedDepth }).y
    context.fillStyle = 'rgba(181, 120, 36, 0.09)'
    context.fillRect(WORLD_LEFT, lineY, WORLD_WIDTH, WORLD_TOP + WORLD_HEIGHT - lineY)
    context.strokeStyle = 'rgba(207, 143, 54, 0.9)'
    context.lineWidth = 3
    context.setLineDash([16, 12])
    context.beginPath()
    context.moveTo(WORLD_LEFT, lineY)
    context.lineTo(WORLD_LEFT + WORLD_WIDTH, lineY)
    context.stroke()
    context.setLineDash([])
  }

  /** 障碍：按世界朝向旋转的深青矩形 */
  private drawObstacle(context: CanvasRenderingContext2D, obstacle: (typeof OBSTACLES)[number]) {
    const center = this.toCanvas(obstacle)
    const width = (obstacle.width / GAME_CONFIG.arena.width) * WORLD_WIDTH
    const height = (obstacle.depth / GAME_CONFIG.arena.depth) * WORLD_HEIGHT
    context.save()
    context.translate(center.x, center.y)
    context.rotate(obstacle.rotation)
    context.fillStyle = 'rgba(64, 94, 90, 0.72)'
    context.strokeStyle = 'rgba(123, 165, 157, 0.6)'
    context.lineWidth = 2
    context.fillRect(-width / 2, -height / 2, width, height)
    context.strokeRect(-width / 2, -height / 2, width, height)
    context.restore()
  }

  /** 敌方开火暴露格：4×4m 琥珀脉冲 + "FIRE TRACE"，随时间淡出 */
  private drawExposure(context: CanvasRenderingContext2D, exposure: ScreenExposure, now: number) {
    if (now < exposure.startsAt || now > exposure.endsAt) return
    const alpha = Math.min(1, (exposure.endsAt - now) / EXPOSURE_FADE_SECONDS)
    const pulse = 0.5 + 0.5 * Math.sin(now * 5.2)
    const { x, y } = this.toCanvas(exposure.point)
    const cellWidth = (GAME_CONFIG.exposure.cellSize / GAME_CONFIG.arena.width) * WORLD_WIDTH
    const cellHeight = (GAME_CONFIG.exposure.cellSize / GAME_CONFIG.arena.depth) * WORLD_HEIGHT
    context.fillStyle = `${AMBER}${(0.13 + 0.09 * pulse) * alpha})`
    context.strokeStyle = `${AMBER}${(0.55 + 0.35 * pulse) * alpha})`
    context.lineWidth = 2 + 2 * pulse
    context.fillRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight)
    context.strokeRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight)
    context.fillStyle = `rgba(255, 198, 105, ${alpha})`
    context.font = `600 20px ${MONO}`
    context.textAlign = 'center'
    const labelY = Math.max(y - cellHeight / 2 - 12, WORLD_TOP + 16)
    context.fillText('FIRE TRACE', x, labelY)
  }

  /** 侦测可视化：椭圆半径圆 + 命中轨迹/未命中文字，随 endsAt 淡出 */
  private drawScan(context: CanvasRenderingContext2D, scan: NonNullable<ScanVisualization>, now: number) {
    const remaining = scan.endsAt - now
    if (remaining <= 0) return
    const alpha = Math.min(1, remaining / 0.4)
    const pulse = 0.5 + 0.5 * Math.sin(now * 4.4)
    const center = this.toCanvas(scan.center)
    const radiusX = (GAME_CONFIG.scan.radius / GAME_CONFIG.arena.width) * WORLD_WIDTH
    const radiusY = (GAME_CONFIG.scan.radius / GAME_CONFIG.arena.depth) * WORLD_HEIGHT
    const hit = scan.hit
    context.globalAlpha = alpha
    context.strokeStyle = hit ? 'rgba(94, 229, 209, 0.95)' : 'rgba(158, 181, 174, 0.72)'
    context.fillStyle = hit ? 'rgba(57, 195, 177, 0.09)' : 'rgba(126, 148, 142, 0.06)'
    context.lineWidth = 4 + 1.6 * pulse
    context.beginPath()
    context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.globalAlpha = 1

    if (hit) {
      // 冻结轨迹折线与最新端点
      context.strokeStyle = '#7af0df'
      context.lineWidth = 6
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      for (let index = 0; index < scan.trail.length; index += 1) {
        const point = this.toCanvas(scan.trail[index])
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      }
      context.stroke()
      context.lineCap = 'butt'
      if (scan.trail.length > 0) {
        const latest = this.toCanvas(scan.trail[scan.trail.length - 1])
        context.fillStyle = '#d6fff8'
        context.beginPath()
        context.arc(latest.x, latest.y, 9, 0, Math.PI * 2)
        context.fill()
      }
    } else {
      context.fillStyle = '#a5b7b2'
      context.font = `600 22px ${MONO}`
      context.textAlign = 'center'
      context.fillText('NO TRACE', center.x, center.y + 8)
    }
  }

  /** 己方落点：扩散圆环 + 准星，快速淡出 */
  private drawShotMark(context: CanvasRenderingContext2D, mark: { point: Vec2; createdAt: number }, now: number) {
    const age = now - mark.createdAt
    if (age < 0 || age > SHOT_MARK_SECONDS) return
    const alpha = 1 - age / SHOT_MARK_SECONDS
    const { x, y } = this.toCanvas(mark.point)
    context.strokeStyle = `rgba(216, 235, 228, ${alpha})`
    context.lineWidth = 3
    context.beginPath()
    context.arc(x, y, 9 + age * 28, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.moveTo(x - 16, y)
    context.lineTo(x + 16, y)
    context.moveTo(x, y - 16)
    context.lineTo(x, y + 16)
    context.stroke()
  }

  /** 顶部 HUD：双方 HP、武器冷却、侦测余量、回合比分与剩余时间 */
  private drawHud(context: CanvasRenderingContext2D, state: ScreenDisplayState) {
    // HUD 分隔线
    context.fillStyle = 'rgba(51, 70, 65, 0.55)'
    context.fillRect(0, MARGIN_TOP - 1, CANVAS_WIDTH, 1)
    context.textBaseline = 'middle'

    // 左：玩家
    context.textAlign = 'left'
    context.fillStyle = HUD_LABEL_COLOR
    context.font = `600 15px ${MONO}`
    context.fillText('YOU', 16, 15)
    this.drawHpPips(context, 56, 8, 14, 18, 4, state.playerHp, state.maxHp)
    context.fillStyle = state.fireCooldown > 0 ? AMBER.slice(0, -2) + '1)' : TEAL
    context.font = `600 15px ${MONO}`
    context.fillText(state.fireCooldown > 0 ? `COOL ${state.fireCooldown.toFixed(1)}s` : 'ARMED', 56, 34)
    context.fillStyle = '#40544e'
    context.fillRect(120, 36, 46, 4)
    context.fillStyle = state.fireCooldown > 0 ? 'rgba(233, 158, 54, 0.9)' : TEAL
    const cooldownRatio = state.fireCooldown > 0 ? 1 - clamp01(state.fireCooldown / GAME_CONFIG.weapon.cooldown) : 1
    context.fillRect(120, 36, 46 * cooldownRatio, 4)
    context.fillStyle = state.scansLeft > 0 ? TEAL : '#4c615b'
    context.beginPath()
    context.arc(184, 8, 6, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = state.scansLeft > 0 ? HUD_TEXT_COLOR : '#5d6f69'
    context.textAlign = 'left'
    context.fillText(`SCAN ${Math.max(0, state.scansLeft)}`, 196, 8)

    // 中：回合、比分与剩余时间
    context.textAlign = 'center'
    context.fillStyle = HUD_LABEL_COLOR
    context.font = `600 15px ${MONO}`
    context.fillText(`ROUND ${Math.max(1, state.round)} · SCORE ${Math.max(0, state.playerScore)}:${Math.max(0, state.aiScore)}`, CANVAS_WIDTH / 2, 14)
    context.fillStyle = '#d1e2dc'
    context.font = `700 26px ${MONO}`
    context.fillText(this.formatTime(state.timeRemaining), CANVAS_WIDTH / 2, 37)

    // 右：AI
    context.textAlign = 'right'
    context.fillStyle = HUD_LABEL_COLOR
    context.font = `600 15px ${MONO}`
    context.fillText('TARGET', CANVAS_WIDTH - 16, 15)
    this.drawHpPips(context, CANVAS_WIDTH - 56, 8, 14, 18, 4, state.aiHp, state.maxHp)
    context.fillStyle = '#5d6f69'
    context.textAlign = 'right'
    context.font = `600 15px ${MONO}`
    context.fillText('HOSTILE', CANVAS_WIDTH - 56, 34)
    context.textBaseline = 'alphabetic'
  }

  /** 血条：maxHp 段小方块，从左向右点亮 */
  private drawHpPips(
    context: CanvasRenderingContext2D,
    startX: number,
    y: number,
    width: number,
    height: number,
    gap: number,
    hp: number,
    maxHp: number,
  ) {
    const safeMax = Math.max(1, Math.round(maxHp))
    const safeHp = Math.max(0, Math.min(safeMax, Math.round(hp)))
    for (let index = 0; index < safeMax; index += 1) {
      const filled = index < safeHp
      const x = startX + index * (width + gap)
      context.fillStyle = filled ? TEAL : '#283632'
      context.strokeStyle = filled ? '#b8fff4' : '#4c615b'
      context.lineWidth = 2
      context.fillRect(x, y, width, height)
      context.strokeRect(x, y, width, height)
    }
  }

  /** 轻微视频噪点，强化监视画面质感 */
  private drawNoise(context: CanvasRenderingContext2D, seed: number) {
    const count = 24
    for (let index = 0; index < count; index += 1) {
      const x = WORLD_LEFT + (((seed * 7919 + index * 104729) % 997) / 997) * WORLD_WIDTH
      const y = WORLD_TOP + (((seed * 6271 + index * 1543) % 991) / 991) * WORLD_HEIGHT
      context.fillStyle = index % 3 === 0 ? 'rgba(160, 220, 205, 0.10)' : 'rgba(0, 0, 0, 0.12)'
      context.fillRect(x, y, 2, 2)
    }
  }

  private formatTime(seconds: number) {
    const safeSeconds = Math.max(0, Math.ceil(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`
  }

  /** 世界坐标 → 画布像素；Y 轴翻转使 Z 0 贴底 */
  private toCanvas(point: Vec2) {
    const uv = worldToUv(point)
    return {
      x: WORLD_LEFT + uv.u * WORLD_WIDTH,
      y: WORLD_TOP + WORLD_HEIGHT - uv.v * WORLD_HEIGHT,
    }
  }
}
