import { describe, expect, it } from 'vitest'
import { GAME_CONFIG, OBSTACLES } from './config'
import {
  isPositionBlocked,
  pointsWithinLast,
  quantizeExposure,
  uvToWorld,
  worldToUv,
} from './math'

describe('coordinate mapping', () => {
  it.each([
    [0, 0, 0, 0],
    [1, 1, 16, 15],
    [0.5, 0.5, 8, 7.5],
    [0.25, 0.8, 4, 12],
  ])('maps UV (%s, %s) to world (%s, %s)', (u, v, x, z) => {
    expect(uvToWorld(u, v)).toEqual({ x, z })
  })

  it.each([
    [-0.0001, 0.5],
    [1.0001, 0.5],
    [0.5, -0.0001],
    [0.5, 1.0001],
    [Number.NaN, 0.5],
    [Number.POSITIVE_INFINITY, 0.5],
  ])('rejects invalid UV (%s, %s)', (u, v) => {
    expect(uvToWorld(u, v)).toBeNull()
  })

  it('round-trips points without measurable drift', () => {
    for (let x = 0; x <= 16; x += 0.37) {
      for (let z = 0; z <= 15; z += 0.41) {
        const uv = worldToUv({ x, z })
        const world = uvToWorld(uv.u, uv.v)!
        expect(Math.abs(world.x - x)).toBeLessThan(0.01)
        expect(Math.abs(world.z - z)).toBeLessThan(0.01)
      }
    }
  })
})

describe('exposure regions', () => {
  it.each([
    { x: 0, z: 0 },
    { x: 2.99, z: 2.99 },
    { x: 12.1, z: 7.4 },
    { x: 15.99, z: 14.99 },
    { x: 16, z: 15 },
  ])('keeps a full 3x3 region in bounds and containing $x/$z', (point) => {
    const center = quantizeExposure(point)
    const half = GAME_CONFIG.exposure.cellSize / 2
    expect(center.x - half).toBeGreaterThanOrEqual(0)
    expect(center.z - half).toBeGreaterThanOrEqual(0)
    expect(center.x + half).toBeLessThanOrEqual(GAME_CONFIG.arena.width)
    expect(center.z + half).toBeLessThanOrEqual(GAME_CONFIG.arena.depth)
    expect(point.x).toBeGreaterThanOrEqual(center.x - half)
    expect(point.x).toBeLessThanOrEqual(center.x + half)
    expect(point.z).toBeGreaterThanOrEqual(center.z - half)
    expect(point.z).toBeLessThanOrEqual(center.z + half)
  })
})

describe('history and collision contracts', () => {
  it('returns an ordered frozen window and excludes future samples', () => {
    const result = pointsWithinLast(
      [
        { x: 4, z: 4, time: 10.2 },
        { x: 2, z: 2, time: 8.5 },
        { x: 3, z: 3, time: 9.8 },
        { x: 1, z: 1, time: 8.49 },
      ],
      10,
      1.5,
    )
    expect(result).toEqual([
      { x: 2, z: 2 },
      { x: 3, z: 3 },
    ])
  })

  it('blocks the no-entry zone, walls and obstacle volumes', () => {
    expect(isPositionBlocked({ x: 8, z: 2.6 })).toBe(true)
    expect(isPositionBlocked({ x: -0.1, z: 8 })).toBe(true)
    expect(isPositionBlocked({ x: OBSTACLES[0].x, z: OBSTACLES[0].z })).toBe(true)
    expect(isPositionBlocked({ x: 8, z: 13.8 })).toBe(false)
  })
})
