import { describe, expect, it } from 'vitest'
import { GAME_CONFIG } from './config'
import { classifyHit, damageOf, resolveAttackTick, winnerByHp } from './combat'
import type { AttackIntent } from './combat'

const { coreRadius, grazeRadius, coreDamage, grazeDamage } = GAME_CONFIG.weapon

const state = {
  playerHp: 2,
  aiHp: 2,
  playerPosition: { x: 4, z: 10 },
  aiPosition: { x: 18, z: 10 },
}

describe('graduated hit classification', () => {
  it('includes both radius boundaries and rejects the next epsilon', () => {
    expect(classifyHit(0)).toBe('core')
    expect(classifyHit(coreRadius - 0.001)).toBe('core')
    expect(classifyHit(coreRadius + 0.001)).toBe('graze')
    expect(classifyHit(grazeRadius - 0.001)).toBe('graze')
    expect(classifyHit(grazeRadius + 0.001)).toBe('miss')
  })

  it('pays more for precision than for luck', () => {
    expect(damageOf('core')).toBe(coreDamage)
    expect(damageOf('graze')).toBe(grazeDamage)
    expect(damageOf('miss')).toBe(0)
    expect(coreDamage).toBeGreaterThan(grazeDamage)
  })

  it('needs several accurate shots to end a round', () => {
    expect(GAME_CONFIG.round.startingHp / coreDamage).toBeGreaterThanOrEqual(3)
  })
})

describe('fixed tick resolution', () => {
  it('resolves simultaneous lethal attacks as a draw in either queue order', () => {
    const lethal: AttackIntent[] = [
      { attacker: 'player', target: { ...state.aiPosition } },
      { attacker: 'ai', target: { ...state.playerPosition } },
    ]
    expect(resolveAttackTick(state, lethal).winner).toBe('draw')
    expect(resolveAttackTick(state, [...lethal].reverse()).winner).toBe('draw')
  })

  it('scores a graze near the outer boundary and nothing beyond it', () => {
    const base = { ...state, playerHp: 6, aiHp: 6 }
    const aiX = state.aiPosition.x
    const graze = resolveAttackTick(base, [
      { attacker: 'player', target: { x: aiX + grazeRadius - 0.1, z: 10 } },
    ])
    expect(graze.results[0].quality).toBe('graze')
    expect(graze.damageToAi).toBe(grazeDamage)

    const miss = resolveAttackTick(base, [
      { attacker: 'player', target: { x: aiX + grazeRadius + 0.1, z: 10 } },
    ])
    expect(miss.results[0].quality).toBe('miss')
    expect(miss.damageToAi).toBe(0)
    expect(miss.winner).toBeNull()
  })

  it('accumulates damage from several attacks inside one tick', () => {
    const base = { ...state, playerHp: 6, aiHp: 6 }
    const aiX = state.aiPosition.x
    const resolution = resolveAttackTick(base, [
      { attacker: 'player', target: { x: aiX, z: 10 } },
      { attacker: 'player', target: { x: aiX + grazeRadius - 0.1, z: 10 } },
    ])
    expect(resolution.damageToAi).toBe(coreDamage + grazeDamage)
    expect(resolution.aiHp).toBe(6 - coreDamage - grazeDamage)
  })

  it('never produces negative HP', () => {
    const attacks: AttackIntent[] = Array.from({ length: 9 }, () => ({
      attacker: 'ai',
      target: { ...state.playerPosition },
    }))
    expect(resolveAttackTick({ ...state, playerHp: 6 }, attacks).playerHp).toBe(0)
  })

  it('leaves an untouched combatant alone', () => {
    const resolution = resolveAttackTick({ ...state, playerHp: 6, aiHp: 6 }, [
      { attacker: 'ai', target: { x: 12, z: 3 } },
    ])
    expect(resolution.playerHp).toBe(6)
    expect(resolution.aiHp).toBe(6)
  })

  it('compares remaining HP when time expires', () => {
    expect(winnerByHp(4, 2)).toBe('player')
    expect(winnerByHp(1, 5)).toBe('ai')
    expect(winnerByHp(3, 3)).toBe('draw')
  })
})
