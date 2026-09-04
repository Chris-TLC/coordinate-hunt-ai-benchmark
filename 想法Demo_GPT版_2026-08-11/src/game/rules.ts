import { GAME_CONFIG } from './config'
import { distance2D } from './math'
import type { RoundWinner, Vec2 } from './types'

export type AttackIntent = {
  attacker: 'player' | 'ai'
  target: Vec2
}

type CombatState = {
  playerHp: number
  aiHp: number
  playerPosition: Vec2
  aiPosition: Vec2
}

export const winnerByHp = (playerHp: number, aiHp: number): RoundWinner => {
  if (playerHp > aiHp) return 'player'
  if (aiHp > playerHp) return 'ai'
  return 'draw'
}

export const resolveAttackTick = <T extends AttackIntent>(
  state: CombatState,
  attacks: readonly T[],
  hitRadius = GAME_CONFIG.weapon.hitRadius,
) => {
  const results = attacks.map((attack) => ({
    attack,
    hit:
      attack.attacker === 'player'
        ? distance2D(attack.target, state.aiPosition) <= hitRadius
        : distance2D(attack.target, state.playerPosition) <= hitRadius,
  }))
  const playerDamage = results.filter(({ attack, hit }) => hit && attack.attacker === 'ai').length
  const aiDamage = results.filter(({ attack, hit }) => hit && attack.attacker === 'player').length
  const playerHp = Math.max(0, state.playerHp - playerDamage)
  const aiHp = Math.max(0, state.aiHp - aiDamage)
  const ended = playerHp === 0 || aiHp === 0

  return {
    results,
    playerDamage,
    aiDamage,
    playerHp,
    aiHp,
    winner: ended ? winnerByHp(playerHp, aiHp) : null,
  }
}
