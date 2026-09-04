import * as THREE from 'three'
import { GAME_CONFIG, OBSTACLES } from './config'
import { worldToUv } from './math'
import type { Vec2 } from './types'

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

type ShotMark = {
  point: Vec2
  createdAt: number
}

export type ScreenDisplayState = {
  now: number
  exposures: readonly ScreenExposure[]
  scan: ScanVisualization
  shotMarks: readonly ShotMark[]
  playerHp: number
  aiHp: number
  timeRemaining: number
  fireCooldown: number
  scanAvailable: boolean
  round: number
  playerScore: number
  aiScore: number
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')
  return { canvas, context }
}

export class ScreenDisplay {
  readonly mapMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly mapCanvas: HTMLCanvasElement
  private readonly mapContext: CanvasRenderingContext2D
  private readonly mapTexture: THREE.CanvasTexture
  private readonly leftContext: CanvasRenderingContext2D
  private readonly leftTexture: THREE.CanvasTexture
  private readonly rightContext: CanvasRenderingContext2D
  private readonly rightTexture: THREE.CanvasTexture

  constructor(scene: THREE.Scene) {
    const map = createCanvas(960, 900)
    this.mapCanvas = map.canvas
    this.mapContext = map.context
    this.mapTexture = new THREE.CanvasTexture(this.mapCanvas)
    this.mapTexture.colorSpace = THREE.SRGBColorSpace
    this.mapTexture.anisotropy = 8

    const mapHeight = 6.55
    const mapWidth = mapHeight * (16 / 15)
    this.mapMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth, mapHeight),
      new THREE.MeshBasicMaterial({ map: this.mapTexture, toneMapped: false }),
    )
    this.mapMesh.position.set(8, 4.68, 0.255)
    this.mapMesh.name = 'coordinate-map'
    scene.add(this.mapMesh)

    const left = createCanvas(256, 900)
    this.leftContext = left.context
    this.leftTexture = new THREE.CanvasTexture(left.canvas)
    this.leftTexture.colorSpace = THREE.SRGBColorSpace

    const right = createCanvas(256, 900)
    this.rightContext = right.context
    this.rightTexture = new THREE.CanvasTexture(right.canvas)
    this.rightTexture.colorSpace = THREE.SRGBColorSpace

    const sidebarGeometry = new THREE.PlaneGeometry(1.72, mapHeight)
    const leftMesh = new THREE.Mesh(
      sidebarGeometry,
      new THREE.MeshBasicMaterial({ map: this.leftTexture, toneMapped: false }),
    )
    leftMesh.position.set(3.49, 4.68, 0.25)
    scene.add(leftMesh)

    const rightMesh = new THREE.Mesh(
      sidebarGeometry,
      new THREE.MeshBasicMaterial({ map: this.rightTexture, toneMapped: false }),
    )
    rightMesh.position.set(12.51, 4.68, 0.25)
    scene.add(rightMesh)
  }

  render(state: ScreenDisplayState) {
    this.drawMap(state)
    this.drawSidebar(this.leftContext, {
      label: `YOU / R${String(state.round).padStart(2, '0')}`,
      hp: state.playerHp,
      detailLabel: 'TIME',
      detail: this.formatTime(state.timeRemaining),
      score: state.playerScore,
    })
    this.drawSidebar(this.rightContext, {
      label: 'TARGET',
      hp: state.aiHp,
      detailLabel: state.scanAvailable ? 'SCAN READY' : 'SCAN SPENT',
      detail: state.fireCooldown > 0 ? `${state.fireCooldown.toFixed(1)}s` : 'ARMED',
      score: state.aiScore,
    })
    this.mapTexture.needsUpdate = true
    this.leftTexture.needsUpdate = true
    this.rightTexture.needsUpdate = true
  }

  renderMenu() {
    const context = this.mapContext
    context.fillStyle = '#061413'
    context.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height)
    this.drawGrid(context, 0.22)
    context.textAlign = 'center'
    context.fillStyle = '#cae8df'
    context.font = '600 30px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText('COORDINATE HUNT', 480, 380)
    context.fillStyle = '#55d6c4'
    context.font = '700 72px system-ui, sans-serif'
    context.fillText('坐标猎场', 480, 472)
    context.fillStyle = '#a88a51'
    context.fillRect(295, 516, 370, 3)
    context.fillStyle = '#7e9c94'
    context.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText('3D CHAMBER / BLIND COORDINATE DUEL', 480, 565)
    this.drawSidebar(this.leftContext, {
      label: 'SYSTEM',
      hp: 3,
      detailLabel: 'MODE',
      detail: '1 VS AI',
      score: 0,
    })
    this.drawSidebar(this.rightContext, {
      label: 'LOCAL',
      hp: 3,
      detailLabel: 'ARENA',
      detail: '16 × 15',
      score: 0,
    })
    this.mapTexture.needsUpdate = true
    this.leftTexture.needsUpdate = true
    this.rightTexture.needsUpdate = true
  }

  private drawMap(state: ScreenDisplayState) {
    const context = this.mapContext
    context.fillStyle = '#061413'
    context.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height)
    this.drawGrid(context, 0.34)

    const restrictedY = this.mapCanvas.height * (1 - GAME_CONFIG.arena.restrictedDepth / GAME_CONFIG.arena.depth)
    context.fillStyle = 'rgba(181, 120, 36, 0.09)'
    context.fillRect(0, restrictedY, this.mapCanvas.width, this.mapCanvas.height - restrictedY)
    context.strokeStyle = 'rgba(207, 143, 54, 0.9)'
    context.lineWidth = 3
    context.setLineDash([16, 12])
    context.beginPath()
    context.moveTo(0, restrictedY)
    context.lineTo(this.mapCanvas.width, restrictedY)
    context.stroke()
    context.setLineDash([])

    for (const obstacle of OBSTACLES) this.drawObstacle(context, obstacle)

    for (const exposure of state.exposures) {
      if (state.now < exposure.startsAt || state.now > exposure.endsAt) continue
      const alpha = Math.min(1, (exposure.endsAt - state.now) / 0.35)
      const { x, y } = this.toCanvas(exposure.point)
      const cellWidth = (GAME_CONFIG.exposure.cellSize / GAME_CONFIG.arena.width) * this.mapCanvas.width
      const cellHeight = (GAME_CONFIG.exposure.cellSize / GAME_CONFIG.arena.depth) * this.mapCanvas.height
      context.fillStyle = `rgba(216, 142, 45, ${0.19 * alpha})`
      context.strokeStyle = `rgba(244, 174, 73, ${0.88 * alpha})`
      context.lineWidth = 5
      context.fillRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight)
      context.strokeRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight)
      context.fillStyle = `rgba(255, 198, 105, ${alpha})`
      context.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.textAlign = 'center'
      context.fillText('FIRE TRACE', x, y - cellHeight / 2 - 16)
    }

    if (state.scan && state.now <= state.scan.endsAt) this.drawScan(context, state.scan)

    for (const mark of state.shotMarks) {
      const age = state.now - mark.createdAt
      if (age > 1.15) continue
      const alpha = 1 - age / 1.15
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

    context.fillStyle = '#89afa5'
    context.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textAlign = 'left'
    context.fillText('NEAR / SCREEN · Z 0', 18, this.mapCanvas.height - 20)
    context.textAlign = 'right'
    context.fillText('FAR WALL · Z 15', this.mapCanvas.width - 18, 28)
  }

  private drawGrid(context: CanvasRenderingContext2D, opacity: number) {
    context.lineWidth = 1
    for (let x = 0; x <= GAME_CONFIG.arena.width; x += 1) {
      const px = (x / GAME_CONFIG.arena.width) * this.mapCanvas.width
      context.strokeStyle = `rgba(97, 175, 162, ${x % 4 === 0 ? opacity * 1.9 : opacity})`
      context.beginPath()
      context.moveTo(px, 0)
      context.lineTo(px, this.mapCanvas.height)
      context.stroke()
    }
    for (let z = 0; z <= GAME_CONFIG.arena.depth; z += 1) {
      const py = this.mapCanvas.height - (z / GAME_CONFIG.arena.depth) * this.mapCanvas.height
      context.strokeStyle = `rgba(97, 175, 162, ${z % 5 === 0 ? opacity * 1.9 : opacity})`
      context.beginPath()
      context.moveTo(0, py)
      context.lineTo(this.mapCanvas.width, py)
      context.stroke()
    }
    context.strokeStyle = 'rgba(108, 221, 203, 0.82)'
    context.lineWidth = 4
    context.strokeRect(2, 2, this.mapCanvas.width - 4, this.mapCanvas.height - 4)

    context.fillStyle = 'rgba(154, 196, 185, 0.88)'
    context.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textBaseline = 'middle'
    for (const x of [0, 4, 8, 12, 16]) {
      const px = Math.min(
        this.mapCanvas.width - 18,
        Math.max(18, (x / GAME_CONFIG.arena.width) * this.mapCanvas.width),
      )
      context.textAlign = 'center'
      context.fillText(`X ${x}`, px, this.mapCanvas.height - 52)
    }
    for (const z of [0, 5, 10, 15]) {
      const py = Math.min(
        this.mapCanvas.height - 78,
        Math.max(52, this.mapCanvas.height - (z / GAME_CONFIG.arena.depth) * this.mapCanvas.height),
      )
      context.textAlign = 'left'
      context.fillText(`Z ${z}`, 12, py)
    }
    context.textBaseline = 'alphabetic'
  }

  private drawObstacle(context: CanvasRenderingContext2D, obstacle: (typeof OBSTACLES)[number]) {
    const center = this.toCanvas(obstacle)
    const width = (obstacle.width / GAME_CONFIG.arena.width) * this.mapCanvas.width
    const height = (obstacle.depth / GAME_CONFIG.arena.depth) * this.mapCanvas.height
    context.save()
    context.translate(center.x, center.y)
    context.rotate(obstacle.rotation)
    context.fillStyle = 'rgba(104, 122, 115, 0.58)'
    context.strokeStyle = 'rgba(161, 184, 176, 0.74)'
    context.lineWidth = 2
    context.fillRect(-width / 2, -height / 2, width, height)
    context.strokeRect(-width / 2, -height / 2, width, height)
    context.restore()
  }

  private drawScan(context: CanvasRenderingContext2D, scan: NonNullable<ScanVisualization>) {
    const center = this.toCanvas(scan.center)
    const radiusX = (GAME_CONFIG.scan.radius / GAME_CONFIG.arena.width) * this.mapCanvas.width
    const radiusY = (GAME_CONFIG.scan.radius / GAME_CONFIG.arena.depth) * this.mapCanvas.height
    context.strokeStyle = scan.hit ? 'rgba(94, 229, 209, 0.95)' : 'rgba(158, 181, 174, 0.7)'
    context.fillStyle = scan.hit ? 'rgba(57, 195, 177, 0.09)' : 'rgba(126, 148, 142, 0.07)'
    context.lineWidth = 5
    context.beginPath()
    context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    if (scan.hit && scan.trail.length > 0) {
      context.strokeStyle = '#7af0df'
      context.lineWidth = 7
      context.lineCap = 'round'
      context.lineJoin = 'round'
      if (scan.trail.length > 1) {
        context.beginPath()
        scan.trail.forEach((point, index) => {
          const canvasPoint = this.toCanvas(point)
          if (index === 0) context.moveTo(canvasPoint.x, canvasPoint.y)
          else context.lineTo(canvasPoint.x, canvasPoint.y)
        })
        context.stroke()
      }
      context.lineCap = 'butt'
      const latest = this.toCanvas(scan.trail.at(-1)!)
      context.fillStyle = '#d6fff8'
      context.beginPath()
      context.arc(latest.x, latest.y, 10, 0, Math.PI * 2)
      context.fill()
    } else {
      context.fillStyle = '#a5b7b2'
      context.textAlign = 'center'
      context.font = '600 22px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillText('NO TRACE', center.x, center.y + 8)
    }
  }

  private drawSidebar(
    context: CanvasRenderingContext2D,
    state: { label: string; hp: number; detailLabel: string; detail: string; score: number },
  ) {
    context.fillStyle = '#08100f'
    context.fillRect(0, 0, 256, 900)
    context.strokeStyle = '#334641'
    context.lineWidth = 3
    context.strokeRect(2, 2, 252, 896)
    context.fillStyle = '#66837b'
    context.font = '600 20px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textAlign = 'center'
    context.fillText(state.label, 128, 72)
    context.fillStyle = '#c4ded6'
    context.font = '700 54px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText(String(state.score).padStart(2, '0'), 128, 148)

    context.fillStyle = '#40544e'
    context.fillRect(36, 198, 184, 2)
    context.fillStyle = '#6f8b83'
    context.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText('INTEGRITY', 128, 246)
    for (let index = 0; index < 3; index += 1) {
      const filled = index < state.hp
      context.fillStyle = filled ? '#59d9c5' : '#283632'
      context.strokeStyle = filled ? '#b8fff4' : '#4c615b'
      context.lineWidth = 3
      context.fillRect(46 + index * 58, 280, 42, 70)
      context.strokeRect(46 + index * 58, 280, 42, 70)
    }
    context.fillStyle = '#40544e'
    context.fillRect(36, 406, 184, 2)
    context.fillStyle = '#6f8b83'
    context.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText(state.detailLabel, 128, 476)
    context.fillStyle = '#d1e2dc'
    context.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText(state.detail, 128, 536)

    context.strokeStyle = '#3b4e48'
    context.beginPath()
    context.arc(128, 700, 63, 0, Math.PI * 2)
    context.stroke()
    context.strokeStyle = '#a47731'
    context.lineWidth = 5
    context.beginPath()
    context.arc(128, 700, 63, -Math.PI / 2, Math.PI * 0.7)
    context.stroke()
    context.fillStyle = '#8da39d'
    context.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText('LINK', 128, 707)
    context.fillStyle = '#4ecbb9'
    context.beginPath()
    context.arc(128, 798, 7, 0, Math.PI * 2)
    context.fill()
  }

  private formatTime(seconds: number) {
    const safeSeconds = Math.max(0, Math.ceil(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`
  }

  private toCanvas(point: Vec2) {
    const uv = worldToUv(point)
    return {
      x: uv.u * this.mapCanvas.width,
      y: this.mapCanvas.height - uv.v * this.mapCanvas.height,
    }
  }
}
