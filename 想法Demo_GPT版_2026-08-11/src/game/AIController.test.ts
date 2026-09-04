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

describe('fair AI perception boundary', () => {
  it('keeps movement speed equal across every difficulty', () => {
    for (const difficulty of Object.values(DIFFICULTY_CONFIG)) {
      expect(difficulty.movementSpeed).toBe(GAME_CONFIG.movement.baseSpeed)
    }
  })

  it('is deterministic for the same seed and visible evidence', () => {
    const first = new AIController('operator', seededRandom(42))
    const second = new AIController('operator', seededRandom(42))
    first.reset('operator', 0)
    second.reset('operator', 0)
    first.receiveExposure({ x: 7.5, z: 10.5 }, 1)
    second.receiveExposure({ x: 7.5, z: 10.5 }, 1)
    expect(first.chooseShot(1.77)).toEqual(second.chooseShot(1.77))
    expect(first.chooseShot(5)).toEqual(second.chooseShot(5))
  })

  it('cannot react before the configured evidence reaction time', () => {
    const ai = new AIController('operator', seededRandom(7))
    ai.reset('operator', 0)
    ai.receiveExposure({ x: 4.5, z: 7.5 }, 1)
    expect(ai.chooseShot(1.77)).toBeNull()
    expect(ai.chooseShot(1.78)).not.toBeNull()
  })

  it('treats identical public regions identically regardless of hidden source point', () => {
    const first = new AIController('hunter', seededRandom(99))
    const second = new AIController('hunter', seededRandom(99))
    first.reset('hunter', 0)
    second.reset('hunter', 0)

    // Two secret fire positions can produce this same public 3x3 region.
    const publicRegionCenter = { x: 13.5, z: 4.5 }
    first.receiveExposure(publicRegionCenter, 2)
    second.receiveExposure(publicRegionCenter, 2)
    expect(first.chooseShot(2.48)).toEqual(second.chooseShot(2.48))
  })

  it('spends its scan exactly once per round', () => {
    const ai = new AIController('cadet', () => 0)
    ai.reset('cadet', 0)
    expect(ai.shouldScan(27.99)).toBe(false)
    expect(ai.shouldScan(28)).toBe(true)
    ai.chooseScanPoint()
    expect(ai.shouldScan(100)).toBe(false)
  })
})

describe('AI shot source classification', () => {
  it('classifies a shot from fresh exposure evidence', () => {
    const ai = new AIController('operator', () => 0)
    ai.reset('operator', 0)
    ai.receiveExposure({ x: 4.5, z: 7.5 }, 1)

    expect(ai.chooseShot(1.78)).toEqual({
      target: { x: 4.5, z: 7.5 },
      source: 'exposure',
    })
  })

  it('classifies a shot from a fresh scan trail', () => {
    const ai = new AIController('operator', () => 0)
    ai.reset('operator', 0)
    ai.receiveScanTrail(
      [
        { x: 4.5, z: 7.5 },
        { x: 5, z: 7.5 },
        { x: 5.5, z: 7.5 },
      ],
      1,
    )

    expect(ai.chooseShot(1.78)?.source).toBe('scan')
  })

  it('classifies a follow-up shot from delayed hit feedback', () => {
    const ai = new AIController('operator', () => 0)
    ai.reset('operator', 0)
    const openingShot = ai.chooseShot(2.8)
    expect(openingShot?.source).toBe('blind')

    ai.receiveHitFeedback(3.3)

    expect(ai.chooseShot(7.2)?.source).toBe('hit')
  })

  it('classifies shots without fresh evidence as blind', () => {
    const noEvidence = new AIController('operator', () => 0)
    noEvidence.reset('operator', 0)
    expect(noEvidence.chooseShot(2.8)?.source).toBe('blind')

    const staleEvidence = new AIController('operator', () => 0)
    staleEvidence.reset('operator', 0)
    staleEvidence.receiveExposure({ x: 4.5, z: 7.5 }, 1)
    expect(staleEvidence.chooseShot(9.5)?.source).toBe('blind')
  })
})
