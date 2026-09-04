import type { Difficulty } from './config'

export type Vec2 = {
  x: number
  z: number
}

export type TimedPoint = Vec2 & {
  time: number
}

export type GamePhase =
  | 'menu'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'roundEnd'
  | 'matchEnd'

export type RoundWinner = 'player' | 'ai' | 'draw'

/** 命中品质同时是伤害档位与反馈文案的依据 */
export type HitQuality = 'core' | 'graze' | 'miss'

export type Combatant = 'player' | 'ai'

/** AI 允许使用的线索来源；blind 表示没有可用线索 */
export type ShotSource = 'exposure' | 'scan' | 'feedback' | 'blind'

export type RoundStats = {
  shots: number
  coreHits: number
  grazeHits: number
  damageDealt: number
  damageTaken: number
  /** 开火前 3 秒内用过暴露区或侦测线索的射击 */
  informedShots: number
  informedDamage: number
  scans: number
  scanHits: number
  aiShots: number
  aiInformedShots: number
  elapsedSeconds: number
}

export type RoundResult = {
  winner: RoundWinner
  reason: 'elimination' | 'time'
  playerHp: number
  aiHp: number
  playerScore: number
  aiScore: number
  round: number
  matchComplete: boolean
  stats: RoundStats
}

export type HudSnapshot = {
  phase: GamePhase
  difficulty: Difficulty
  round: number
  playerScore: number
  aiScore: number
  playerHp: number
  aiHp: number
  maxHp: number
  timeRemaining: number
  countdownRemaining: number
  fireCooldown: number
  scansLeft: number
  speedBoostRemaining: number
  playerPosition: Vec2
  aimPosition: Vec2 | null
  aimValid: boolean
  pointerLocked: boolean
  pointerFallback: boolean
  /** 自己刚刚被暴露，屏幕边缘给出警告 */
  exposureWarning: boolean
  incomingScanWarning: boolean
  lastFeedback: HitQuality | null
}

export type Settings = {
  difficulty: Difficulty
  audioEnabled: boolean
  mouseSensitivity: number
}

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger'

export type GameToast = {
  id: number
  text: string
  tone: ToastTone
  duration?: number
}

export type GameCallbacks = {
  onHud: (snapshot: HudSnapshot) => void
  onToast: (toast: Omit<GameToast, 'id'>) => void
  onRoundEnd: (result: RoundResult) => void
  onPauseRequest: () => void
}
