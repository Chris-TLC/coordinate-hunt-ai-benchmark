import { describe, expect, it } from 'vitest'
import { resolveAttackTick, winnerByHp, type AttackIntent } from './rules'

const state = {
  playerHp: 1,
  aiHp: 1,
  playerPosition: { x: 3, z: 8 },
  aiPosition: { x: 13, z: 8 },
}

const lethalAttacks: AttackIntent[] = [
  { attacker: 'player', target: { x: 13, z: 8 } },
  { attacker: 'ai', target: { x: 3, z: 8 } },
]

describe('fixed tick combat resolution', () => {
  it('resolves simultaneous lethal attacks as a draw in either queue order', () => {
    expect(resolveAttackTick(state, lethalAttacks).winner).toBe('draw')
    expect(resolveAttackTick(state, [...lethalAttacks].reverse()).winner).toBe('draw')
  })

  it('includes the hit-radius boundary and excludes the next epsilon', () => {
    const base = { ...state, playerHp: 3, aiHp: 3 }
    const boundary = resolveAttackTick(base, [
      { attacker: 'player', target: { x: 11.5, z: 8 } },
    ])
    const outside = resolveAttackTick(base, [
      { attacker: 'player', target: { x: 11.499, z: 8 } },
    ])
    expect(boundary.results[0].hit).toBe(true)
    expect(outside.results[0].hit).toBe(false)
  })

  it('never produces negative HP', () => {
    const attacks = Array.from({ length: 8 }, () => ({
      attacker: 'ai' as const,
      target: { x: 3, z: 8 },
    }))
    expect(resolveAttackTick({ ...state, playerHp: 3 }, attacks).playerHp).toBe(0)
  })

  it('compares remaining HP for time expiry', () => {
    expect(winnerByHp(2, 1)).toBe('player')
    expect(winnerByHp(1, 2)).toBe('ai')
    expect(winnerByHp(2, 2)).toBe('draw')
  })
})
