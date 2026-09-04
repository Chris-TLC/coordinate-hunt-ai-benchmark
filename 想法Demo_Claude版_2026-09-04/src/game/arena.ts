import { GAME_CONFIG, OBSTACLES } from './config'
import { clamp } from './mapping'
import type { Vec2 } from './types'

type Obstacle = (typeof OBSTACLES)[number]

/** 把点变换到障碍自身的旋转坐标系，用于旋转矩形碰撞 */
const toObstacleSpace = (point: Vec2, obstacle: Obstacle): Vec2 => {
  const dx = point.x - obstacle.x
  const dz = point.z - obstacle.z
  const cos = Math.cos(-obstacle.rotation)
  const sin = Math.sin(-obstacle.rotation)
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
}

export const isInsideObstacle = (
  point: Vec2,
  radius: number = GAME_CONFIG.arena.playerRadius,
) =>
  OBSTACLES.some((obstacle) => {
    const local = toObstacleSpace(point, obstacle)
    return (
      Math.abs(local.x) < obstacle.width / 2 + radius &&
      Math.abs(local.z) < obstacle.depth / 2 + radius
    )
  })

/** 墙、贴屏禁入区与障碍体积都不可站立 */
export const isPositionBlocked = (
  point: Vec2,
  radius: number = GAME_CONFIG.arena.playerRadius,
) => {
  const { width, depth, restrictedDepth } = GAME_CONFIG.arena
  if (
    point.x < radius ||
    point.x > width - radius ||
    point.z < restrictedDepth + radius ||
    point.z > depth - radius
  ) {
    return true
  }
  return isInsideObstacle(point, radius)
}

/** 沿墙滑动而不是直接卡死，避免贴着障碍时手感发黏 */
export const resolveMovement = (
  current: Vec2,
  desired: Vec2,
  radius: number = GAME_CONFIG.arena.playerRadius,
): Vec2 => {
  if (!isPositionBlocked(desired, radius)) return desired
  const alongX = { x: desired.x, z: current.z }
  if (!isPositionBlocked(alongX, radius)) return alongX
  const alongZ = { x: current.x, z: desired.z }
  if (!isPositionBlocked(alongZ, radius)) return alongZ
  return current
}

/** 落在可行走区域内的随机点；随机源可注入，便于测试与确定性回放 */
export const randomFreePoint = (
  random: () => number,
  clearance = 0.3,
): Vec2 => {
  const { width, depth, restrictedDepth, playerRadius } = GAME_CONFIG.arena
  const radius = playerRadius + clearance
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const point = {
      x: radius + random() * (width - radius * 2),
      z: restrictedDepth + radius + random() * (depth - restrictedDepth - radius * 2),
    }
    if (!isPositionBlocked(point, radius)) return point
  }
  return { x: width / 2, z: depth - radius - 0.2 }
}

/** 把任意坐标夹回可开火的地图范围，供 AI 瞄准与效果落点使用 */
export const clampToArena = (point: Vec2, margin = 0.25): Vec2 => ({
  x: clamp(point.x, margin, GAME_CONFIG.arena.width - margin),
  z: clamp(point.z, margin, GAME_CONFIG.arena.depth - margin),
})
