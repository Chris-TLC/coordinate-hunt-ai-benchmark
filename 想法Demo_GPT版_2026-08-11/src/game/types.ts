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

export type RoundStats = {
  shots: number
  hits: number
  informedShots: number
  informedHits: number
  scans: number
  scanHits: number
  damageTaken: number
  aiShots: number
  aiBlindShots: number
  aiExposureShots: number
  aiScanShots: number
  aiHitFollowupShots: number
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
  timeRemaining: number
  countdownRemaining: number
  fireCooldown: number
  scanAvailable: boolean
  speedBoostRemaining: number
  playerPosition: Vec2
  aimPosition: Vec2 | null
  aimValid: boolean
  pointerLocked: boolean
  exposureWarning: boolean
  aiScanning: boolean
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
