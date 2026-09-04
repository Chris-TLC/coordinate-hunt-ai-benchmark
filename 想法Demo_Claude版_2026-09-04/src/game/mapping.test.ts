import { describe, expect, it } from 'vitest'
import { GAME_CONFIG } from './config'
import {
  estimateVelocity,
  pointsWithinLast,
  quantizeExposure,
  uvToWorld,
  worldToUv,
} from './mapping'

const { width, depth } = GAME_CONFIG.arena

describe('coordinate mapping', () => {
  it.each([
    [0, 0, 0, 0],
    [1, 1, width, depth],
    [0.5, 0.5, width / 2, depth / 2],
    [0.25, 0.8, width * 0.25, depth * 0.8],
  ])('maps UV (%s, %s) onto the standard arena', (u, v, x, z) => {
    expect(uvToWorld(u, v)).toEqual({ x, z })
  })

  it.each([
    [-0.0001, 0.5],
    [1.0001, 0.5],
    [0.5, -0.0001],
    [0.5, 1.0001],
    [Number.NaN, 0.5],
    [Number.POSITIVE_INFINITY, 0.5],
  ])('rejects invalid UV (%s, %s) so no shot is spent', (u, v) => {
    expect(uvToWorld(u, v)).toBeNull()
  })

  it('round-trips well inside the 0.01 m budget from the concept archive', () => {
    for (let x = 0; x <= width; x += 0.37) {
      for (let z = 0; z <= depth; z += 0.41) {
        const uv = worldToUv({ x, z })
        const world = uvToWorld(uv.u, uv.v)!
        expect(Math.abs(world.x - x)).toBeLessThan(0.01)
        expect(Math.abs(world.z - z)).toBeLessThan(0.01)
      }
    }
  })

  it('keeps the map aspect identical to the arena so nothing is stretched', () => {
    expect(GAME_CONFIG.screen.mapWidth / GAME_CONFIG.screen.mapHeight).toBeCloseTo(
      width / depth,
      6,
    )
  })
})

describe('exposure quantisation', () => {
  const { cellSize } = GAME_CONFIG.exposure
  const half = cellSize / 2

  it.each([
    { x: 0, z: 0 },
    { x: 3.99, z: 3.99 },
    { x: 12.1, z: 7.4 },
    { x: 21.99, z: 19.99 },
    { x: width, z: depth },
    { x: 20.5, z: 18.5 },
  ])('keeps a full cell in bounds while still containing $x/$z', (point) => {
    const centre = quantizeExposure(point)
    expect(centre.x - half).toBeGreaterThanOrEqual(0)
    expect(centre.z - half).toBeGreaterThanOrEqual(0)
    expect(centre.x + half).toBeLessThanOrEqual(width)
    expect(centre.z + half).toBeLessThanOrEqual(depth)
    expect(point.x).toBeGreaterThanOrEqual(centre.x - half)
    expect(point.x).toBeLessThanOrEqual(centre.x + half)
    expect(point.z).toBeGreaterThanOrEqual(centre.z - half)
    expect(point.z).toBeLessThanOrEqual(centre.z + half)
  })

  it('reports one region for distinct positions inside the same cell', () => {
    const first = quantizeExposure({ x: 8.1, z: 8.1 })
    const second = quantizeExposure({ x: 11.9, z: 11.9 })
    expect(first).toEqual(second)
  })
})

describe('frozen history windows', () => {
  it('orders samples and excludes anything newer than now', () => {
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

  it('does not mutate the caller history', () => {
    const history = [
      { x: 4, z: 4, time: 10 },
      { x: 2, z: 2, time: 9 },
    ]
    pointsWithinLast(history, 10, 2)
    expect(history[0].time).toBe(10)
  })

  it('keeps history longer than the scan trail it must serve', () => {
    expect(GAME_CONFIG.historySeconds).toBeGreaterThan(GAME_CONFIG.scan.trailSeconds)
  })

  it('estimates heading from a trail and declines when samples are thin', () => {
    expect(estimateVelocity([{ x: 0, z: 0 }, { x: 4, z: 2 }], 2)).toEqual({ x: 2, z: 1 })
    expect(estimateVelocity([{ x: 1, z: 1 }], 2)).toBeNull()
    expect(estimateVelocity([{ x: 0, z: 0 }, { x: 4, z: 2 }], 0)).toBeNull()
  })
})
