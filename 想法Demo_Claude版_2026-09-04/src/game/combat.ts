import { GAME_CONFIG } from './config'
import { distance2D } from './mapping'
import type { Combatant, HitQuality, RoundWinner, Vec2 } from './types'

export type AttackIntent = {
  attacker: Combatant
  target: Vec2
}

type CombatState = {
  playerHp: number
  aiHp: number
  playerPosition: Vec2
  aiPosition: Vec2
}

export type Weapon = {
  coreRadius: number
  coreDamage: number
  grazeRadius: number
  grazeDamage: number
}

/**
 * 阶梯命中：直击 0.9 m 内、擦伤 0.9~1.8 m。
 * 边界取闭区间，"刚好压线" 判为命中。
 */
export const classifyHit = (
  distance: number,
  weapon: Weapon = GAME_CONFIG.weapon,
): HitQuality => {
  if (distance <= weapon.coreRadius) return 'core'
  if (distance <= weapon.grazeRadius) return 'graze'
  return 'miss'
}

export const damageOf = (
  quality: HitQuality,
  weapon: Weapon = GAME_CONFIG.weapon,
) => {
  if (quality === 'core') return weapon.coreDamage
  if (quality === 'graze') return weapon.grazeDamage
  return 0
}

export const winnerByHp = (playerHp: number, aiHp: number): RoundWinner => {
  if (playerHp > aiHp) return 'player'
  if (aiHp > playerHp) return 'ai'
  return 'draw'
}

/**
 * 固定 tick 内一次性结算所有攻击：同 tick 双方同时致死判平局，
 * 结果不受攻击入队顺序影响。
 */
export const resolveAttackTick = <T extends AttackIntent>(
  state: CombatState,
  attacks: readonly T[],
  weapon: Weapon = GAME_CONFIG.weapon,
) => {
  const results = attacks.map((attack) => {
    const victimPosition =
      attack.attacker === 'player' ? state.aiPosition : state.playerPosition
    const quality = classifyHit(distance2D(attack.target, victimPosition), weapon)
    return { attack, quality, damage: damageOf(quality, weapon) }
  })

  const sumFor = (attacker: Combatant) =>
    results
      .filter((result) => result.attack.attacker === attacker)
      .reduce((total, result) => total + result.damage, 0)

  const damageToAi = sumFor('player')
  const damageToPlayer = sumFor('ai')
  const playerHp = Math.max(0, state.playerHp - damageToPlayer)
  const aiHp = Math.max(0, state.aiHp - damageToAi)
  const ended = playerHp === 0 || aiHp === 0

  return {
    results,
    damageToAi,
    damageToPlayer,
    playerHp,
    aiHp,
    winner: ended ? winnerByHp(playerHp, aiHp) : null,
  }
}
