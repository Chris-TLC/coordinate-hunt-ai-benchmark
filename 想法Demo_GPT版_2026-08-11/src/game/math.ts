import { GAME_CONFIG, OBSTACLES } from './config'
import type { Vec2 } from './types'

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const distance2D = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)

export const isUvValid = (u: number, v: number) =>
  Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1

export const uvToWorld = (u: number, v: number): Vec2 | null =>
  isUvValid(u, v)
    ? {
        x: u * GAME_CONFIG.arena.width,
        z: v * GAME_CONFIG.arena.depth,
      }
    : null

export const worldToUv = (point: Vec2) => ({
  u: clamp(point.x / GAME_CONFIG.arena.width, 0, 1),
  v: clamp(point.z / GAME_CONFIG.arena.depth, 0, 1),
})

export const quantizeExposure = (point: Vec2): Vec2 => {
  const size = GAME_CONFIG.exposure.cellSize
  const startX = Math.min(Math.floor(clamp(point.x, 0, GAME_CONFIG.arena.width) / size) * size, GAME_CONFIG.arena.width - size)
  const startZ = Math.min(Math.floor(clamp(point.z, 0, GAME_CONFIG.arena.depth) / size) * size, GAME_CONFIG.arena.depth - size)
  return {
    x: startX + size / 2,
    z: startZ + size / 2,
  }
}

export const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

export const randomPointInArena = (margin = 0.8): Vec2 => ({
  x: randomRange(margin, GAME_CONFIG.arena.width - margin),
  z: randomRange(GAME_CONFIG.arena.restrictedDepth + margin, GAME_CONFIG.arena.depth - margin),
})

const rotateIntoObstacle = (point: Vec2, obstacle: (typeof OBSTACLES)[number]) => {
  const dx = point.x - obstacle.x
  const dz = point.z - obstacle.z
  const cos = Math.cos(-obstacle.rotation)
  const sin = Math.sin(-obstacle.rotation)
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  }
}

export const isPositionBlocked = (point: Vec2, radius: number = GAME_CONFIG.arena.playerRadius) => {
  if (
    point.x < radius ||
    point.x > GAME_CONFIG.arena.width - radius ||
    point.z < GAME_CONFIG.arena.restrictedDepth + radius ||
    point.z > GAME_CONFIG.arena.depth - radius
  ) {
    return true
  }

  return OBSTACLES.some((obstacle) => {
    const local = rotateIntoObstacle(point, obstacle)
    return (
      Math.abs(local.x) < obstacle.width / 2 + radius &&
      Math.abs(local.z) < obstacle.depth / 2 + radius
    )
  })
}

export const resolveMovement = (current: Vec2, desired: Vec2, radius: number = GAME_CONFIG.arena.playerRadius) => {
  if (!isPositionBlocked(desired, radius)) return desired

  const xOnly = { x: desired.x, z: current.z }
  if (!isPositionBlocked(xOnly, radius)) return xOnly

  const zOnly = { x: current.x, z: desired.z }
  if (!isPositionBlocked(zOnly, radius)) return zOnly

  return current
}

export const randomValidPoint = (margin = 0.8) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const point = randomPointInArena(margin)
    if (!isPositionBlocked(point, GAME_CONFIG.arena.playerRadius + 0.35)) return point
  }
  return { x: GAME_CONFIG.arena.width / 2, z: GAME_CONFIG.arena.depth - 1.2 }
}

export const pointsWithinLast = (history: readonly { time: number; x: number; z: number }[], now: number, seconds: number) =>
  [...history]
    .filter((point) => now - point.time >= 0 && now - point.time <= seconds)
    .sort((a, b) => a.time - b.time)
    .map(({ x, z }) => ({ x, z }))
