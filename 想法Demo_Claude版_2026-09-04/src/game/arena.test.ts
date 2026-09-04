import { describe, expect, it } from 'vitest'
import { GAME_CONFIG, OBSTACLES, START_POSITIONS } from './config'
import { isPositionBlocked, randomFreePoint, resolveMovement } from './arena'
import type { Vec2 } from './types'

const { width, depth, restrictedDepth, playerRadius } = GAME_CONFIG.arena

const seeded = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe('arena collision', () => {
  it('blocks walls, the no-entry strip and obstacle volumes', () => {
    expect(isPositionBlocked({ x: width / 2, z: restrictedDepth - 0.1 })).toBe(true)
    expect(isPositionBlocked({ x: -0.1, z: 10 })).toBe(true)
    expect(isPositionBlocked({ x: width + 0.1, z: 10 })).toBe(true)
    expect(isPositionBlocked({ x: width / 2, z: depth + 0.1 })).toBe(true)
    for (const obstacle of OBSTACLES) {
      expect(isPositionBlocked({ x: obstacle.x, z: obstacle.z })).toBe(true)
    }
  })

  it('leaves both starting positions and the open floor walkable', () => {
    expect(isPositionBlocked(START_POSITIONS.player, playerRadius + 0.4)).toBe(false)
    expect(isPositionBlocked(START_POSITIONS.ai, playerRadius + 0.4)).toBe(false)
  })

  it('slides along a blocked axis instead of stopping dead', () => {
    const obstacle = OBSTACLES[0]
    const current = { x: obstacle.x, z: obstacle.z - obstacle.depth / 2 - playerRadius - 0.25 }
    const desired = { x: current.x + 0.3, z: obstacle.z }
    const resolved = resolveMovement(current, desired)
    expect(isPositionBlocked(resolved)).toBe(false)
    expect(resolved.z).toBe(current.z)
    expect(resolved.x).toBeCloseTo(desired.x, 6)
  })

  it('never resolves movement into a blocked cell', () => {
    const random = seeded(7)
    let position: Vec2 = { ...START_POSITIONS.player }
    for (let step = 0; step < 4000; step += 1) {
      const angle = random() * Math.PI * 2
      const desired = {
        x: position.x + Math.cos(angle) * 0.4,
        z: position.z + Math.sin(angle) * 0.4,
      }
      position = resolveMovement(position, desired)
      expect(isPositionBlocked(position)).toBe(false)
    }
  })

  it('only ever returns walkable random points', () => {
    const random = seeded(99)
    for (let index = 0; index < 3000; index += 1) {
      expect(isPositionBlocked(randomFreePoint(random))).toBe(false)
    }
  })
})

describe('arena layout guarantees', () => {
  const cell = 0.25
  const columns = Math.ceil(width / cell)
  const rows = Math.ceil(depth / cell)
  const indexOf = (i: number, j: number) => i * rows + j

  const walkable: boolean[] = []
  let walkableCount = 0
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const open = !isPositionBlocked({ x: (i + 0.5) * cell, z: (j + 0.5) * cell })
      walkable[indexOf(i, j)] = open
      if (open) walkableCount += 1
    }
  }

  const floodFrom = (start: Vec2) => {
    const seen = new Uint8Array(columns * rows)
    const startI = Math.floor(start.x / cell)
    const startJ = Math.floor(start.z / cell)
    const stack: Array<[number, number]> = [[startI, startJ]]
    seen[indexOf(startI, startJ)] = 1
    let reached = 0
    while (stack.length > 0) {
      const [i, j] = stack.pop()!
      reached += 1
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const a = i + di
        const b = j + dj
        if (a < 0 || b < 0 || a >= columns || b >= rows) continue
        if (!walkable[indexOf(a, b)] || seen[indexOf(a, b)]) continue
        seen[indexOf(a, b)] = 1
        stack.push([a, b])
      }
    }
    return { seen, reached }
  }

  it('has no sealed pockets anywhere in the walkable area', () => {
    const { reached } = floodFrom(START_POSITIONS.player)
    expect(reached).toBe(walkableCount)
  })

  it('lets either starting position reach the other', () => {
    const { seen } = floodFrom(START_POSITIONS.player)
    const aiI = Math.floor(START_POSITIONS.ai.x / cell)
    const aiJ = Math.floor(START_POSITIONS.ai.z / cell)
    expect(seen[indexOf(aiI, aiJ)]).toBe(1)
  })

  it('keeps blind fire expensive by leaving a large walkable area', () => {
    const area = walkableCount * cell * cell
    expect(area).toBeGreaterThan(250)
  })

  it('keeps every obstacle inside the playable floor', () => {
    for (const obstacle of OBSTACLES) {
      const reach = Math.hypot(obstacle.width, obstacle.depth) / 2
      expect(obstacle.x - reach).toBeGreaterThan(0)
      expect(obstacle.x + reach).toBeLessThan(width)
      expect(obstacle.z - reach).toBeGreaterThan(restrictedDepth)
      expect(obstacle.z + reach).toBeLessThan(depth)
    }
  })
})
