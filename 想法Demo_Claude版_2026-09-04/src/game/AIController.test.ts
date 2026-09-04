import { describe, expect, it } from 'vitest'
import { AIController } from './AIController'
import { DIFFICULTY_CONFIG, GAME_CONFIG } from './config'

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe('AI information isolation', () => {
  it('keeps movement speed equal across every difficulty', () => {
    for (const difficulty of Object.values(DIFFICULTY_CONFIG)) {
      expect(difficulty.movementSpeed).toBe(GAME_CONFIG.movement.baseSpeed)
    }
  })

  it('is deterministic for the same seed and same evidence', () => {
    const first = new AIController('operator', seededRandom(42))
    const second = new AIController('operator', seededRandom(42))
    first.reset('operator', 0)
    second.reset('operator', 0)
    first.receiveExposure({ x: 7.5, z: 10.5 }, 1)
    second.receiveExposure({ x: 7.5, z: 10.5 }, 1)
    expect(first.chooseShot(1.78)).toEqual(second.chooseShot(1.78))
  })

  it('cannot react before the configured evidence reaction time', () => {
    const ai = new AIController('operator', seededRandom(7))
    ai.reset('operator', 0)
    ai.receiveExposure({ x: 4.5, z: 7.5 }, 1)
    expect(ai.chooseShot(1.79)).toBeNull()
    expect(ai.chooseShot(1.81)).not.toBeNull()
  })

  it('treats identical public regions identically regardless of hidden source point', () => {
    const first = new AIController('hunter', seededRandom(99))
    const second = new AIController('hunter', seededRandom(99))
    first.reset('hunter', 0)
    second.reset('hunter', 0)
    const publicRegionCenter = { x: 13.5, z: 4.5 }
    first.receiveExposure(publicRegionCenter, 2)
    second.receiveExposure(publicRegionCenter, 2)
    expect(first.chooseShot(2.48)).toEqual(second.chooseShot(2.48))
  })

  it('spends its scan exactly once per round', () => {
    const ai = new AIController('cadet', () => 0)
    ai.reset('cadet', 0)
    expect(ai.shouldScan(29.99)).toBe(false)
    expect(ai.shouldScan(30)).toBe(true)
    ai.chooseScanPoint()
    expect(ai.shouldScan(100)).toBe(false)
  })
})

describe('shot source classification', () => {
  it('classifies from fresh exposure evidence', () => {
    const ai = new AIController('operator', seededRandom(7))
    ai.reset('operator', 0)
    ai.receiveExposure({ x: 4.5, z: 7.5 }, 0.5)
    expect(ai.chooseShot(1.31)?.source).toBe('exposure')
  })

  it('classifies from a fresh scan trail', () => {
    const ai = new AIController('operator', seededRandom(8))
    ai.reset('operator', 0)
    ai.receiveScanTrail(
      [{ x: 4.5, z: 7.5, time: 0.5 }, { x: 5, z: 7.5, time: 0.8 }, { x: 5.5, z: 7.5, time: 1 }],
      0.5,
    )
    expect(ai.chooseShot(1.31)?.source).toBe('scan')
  })

  it('classifies from delayed hit feedback', () => {
    const ai = new AIController('operator', seededRandom(9))
    ai.reset('operator', 0)
    const opening = ai.chooseShot(3.1)
    expect(opening?.source).toBe('blind')
    // 反馈必须在首枪冷却与决策间隔结束后、且线索 3 秒信任窗口内到达
    ai.receiveHitFeedback(8.6)
    expect(ai.chooseShot(8.9)?.source).toBe('feedback')
  })

  it('falls back to blind without fresh evidence', () => {
    const ai = new AIController('operator', seededRandom(7))
    ai.reset('operator', 0)
    expect(ai.chooseShot(5)?.source).toBe('blind')

    const stale = new AIController('operator', seededRandom(11))
    stale.reset('operator', 0)
    stale.receiveExposure({ x: 4.5, z: 7.5 }, 0.5)
    expect(stale.chooseShot(10)?.source).toBe('blind')
  })
})

describe('belief grid behaviour', () => {
  it('diffuses toward uniform over time', () => {
    const ai = new AIController('operator', seededRandom(7))
    ai.reset('operator', 0)
    ai.receiveExposure({ x: 11, z: 10 }, 0)
    const peakBefore = Math.max(...ai['grid'])
    for (let t = 0; t < 30; t += 0.05) ai.diffuse(0.05)
    const peakAfter = Math.max(...ai['grid'])
    expect(peakAfter).toBeLessThan(peakBefore)
  })
})
