import { GAME_CONFIG } from './config'
import type { TimedPoint, Vec2 } from './types'

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const distance2D = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)

export const isUvValid = (u: number, v: number) =>
  Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1

/**
 * 巨幕地图 UV 到标准竞技场坐标。原点在贴屏一侧的左下角，X 向右，Z 指向远墙。
 * 只接受地图 Quad 的 UV；越界或非有限值一律拒绝，射击因此不消耗冷却。
 */
export const uvToWorld = (u: number, v: number): Vec2 | null =>
  isUvValid(u, v)
    ? { x: u * GAME_CONFIG.arena.width, z: v * GAME_CONFIG.arena.depth }
    : null

export const worldToUv = (point: Vec2) => ({
  u: clamp(point.x / GAME_CONFIG.arena.width, 0, 1),
  v: clamp(point.z / GAME_CONFIG.arena.depth, 0, 1),
})

/**
 * 把射手开火瞬间的位置量化成固定格。对手只看到这个格子，
 * 因此同一格内的任意真实位置对外完全等价——这是信息隔离的基础。
 */
export const quantizeExposure = (point: Vec2): Vec2 => {
  const { cellSize } = GAME_CONFIG.exposure
  const { width, depth } = GAME_CONFIG.arena
  const startX = Math.min(
    Math.floor(clamp(point.x, 0, width) / cellSize) * cellSize,
    width - cellSize,
  )
  const startZ = Math.min(
    Math.floor(clamp(point.z, 0, depth) / cellSize) * cellSize,
    depth - cellSize,
  )
  return { x: startX + cellSize / 2, z: startZ + cellSize / 2 }
}

/** 冻结的历史窗口：按时间升序，排除未来采样 */
export const pointsWithinLast = (
  history: readonly TimedPoint[],
  now: number,
  seconds: number,
): Vec2[] =>
  history
    .filter((point) => now - point.time >= 0 && now - point.time <= seconds)
    .slice()
    .sort((a, b) => a.time - b.time)
    .map(({ x, z }) => ({ x, z }))

/** 由轨迹窗口估算朝向，供预判使用；样本不足时不给速度 */
export const estimateVelocity = (trail: readonly Vec2[], seconds: number): Vec2 | null => {
  if (trail.length < 2 || seconds <= 0) return null
  const first = trail[0]
  const last = trail[trail.length - 1]
  return { x: (last.x - first.x) / seconds, z: (last.z - first.z) / seconds }
}
