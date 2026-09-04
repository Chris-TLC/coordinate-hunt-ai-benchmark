export const GAME_CONFIG = {
  arena: {
    width: 16,
    depth: 15,
    height: 9,
    restrictedDepth: 2.5,
    playerRadius: 0.36,
  },
  round: {
    duration: 120,
    countdown: 3,
    startingHp: 3,
    winsToMatch: 3,
  },
  movement: {
    baseSpeed: 5,
    boostedSpeed: 6.5,
    boostDuration: 1.5,
  },
  weapon: {
    cooldown: 1.5,
    hitRadius: 1.5,
    hitFeedbackDelay: 0.5,
    fixedTick: 1 / 20,
  },
  exposure: {
    delay: 0.4,
    duration: 1.2,
    cellSize: 3,
  },
  scan: {
    radius: 4,
    trailSeconds: 1.5,
    displaySeconds: 2.8,
  },
  historySeconds: 2.25,
} as const

export type Difficulty = 'cadet' | 'operator' | 'hunter'

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    label: string
    movementSpeed: number
    reactionSeconds: number
    informedScatter: number
    blindScatter: number
    blindFireMin: number
    blindFireMax: number
    scanDelayMin: number
    scanDelayMax: number
  }
> = {
  cadet: {
    label: '见习',
    movementSpeed: 5,
    reactionSeconds: 1.25,
    informedScatter: 1.9,
    blindScatter: 5.2,
    blindFireMin: 5.8,
    blindFireMax: 8.4,
    scanDelayMin: 28,
    scanDelayMax: 42,
  },
  operator: {
    label: '行动员',
    movementSpeed: 5,
    reactionSeconds: 0.78,
    informedScatter: 1.05,
    blindScatter: 4.2,
    blindFireMin: 4.4,
    blindFireMax: 7,
    scanDelayMin: 21,
    scanDelayMax: 34,
  },
  hunter: {
    label: '猎手',
    movementSpeed: 5,
    reactionSeconds: 0.48,
    informedScatter: 0.56,
    blindScatter: 3.3,
    blindFireMin: 3.5,
    blindFireMax: 5.8,
    scanDelayMin: 16,
    scanDelayMax: 27,
  },
}

export const OBSTACLES = [
  { x: 4.1, z: 6.25, width: 3.4, depth: 1.25, height: 1.35, rotation: -0.16 },
  { x: 11.75, z: 7.55, width: 3.25, depth: 1.3, height: 1.5, rotation: 0.2 },
  { x: 7.75, z: 11.1, width: 3.6, depth: 1.2, height: 1.25, rotation: -0.08 },
] as const

export const START_POSITIONS = {
  player: { x: 3.15, z: 12.8 },
  ai: { x: 12.85, z: 12.8 },
} as const
