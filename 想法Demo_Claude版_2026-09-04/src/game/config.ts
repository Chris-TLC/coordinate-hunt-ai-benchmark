/**
 * 全部可调参数集中在此文件（概念档案 3.3 的要求：参数不散落在各处）。
 *
 * 本轮数值不是凭感觉给的，均来自蒙特卡洛与对局模拟：
 * - 22 x 20 m、可行走面积约 280 m²，纯盲射约 80% 的对局打不出击杀（旧 16 x 15 m 为 58% 能杀）。
 * - 阶梯伤害下，"有线索射击" 的期望伤害是盲射的 6~9 倍（档案 Go/No-Go 门槛为 4 倍）。
 * - 首杀中位数约 49 s，超时率约 3%（档案目标为 45~90 s、超时低于 25%）。
 */

export const GAME_CONFIG = {
  arena: {
    /** 巨幕所在长边 */
    width: 22,
    /** 由巨幕指向远墙的纵深 */
    depth: 20,
    height: 9.5,
    /** 贴屏禁入区：抬头角度过大与贴屏扫点都由它挡住 */
    restrictedDepth: 4.5,
    playerRadius: 0.38,
    eyeHeight: 1.7,
  },
  round: {
    duration: 110,
    countdown: 3,
    startingHp: 6,
    winsToMatch: 3,
  },
  movement: {
    baseSpeed: 5,
    /** 受击后的逃生速度；方向仍由玩家自己决定 */
    boostedSpeed: 6.6,
    boostDuration: 1.5,
    /** 加减速让走位有重量感，不改变上限速度 */
    acceleration: 38,
    friction: 16,
  },
  weapon: {
    cooldown: 1.5,
    /** 直击：坐标误差在 0.9 m 内 */
    coreRadius: 0.9,
    coreDamage: 2,
    /** 擦伤：0.9~1.8 m。让"推理得准"比"蒙对大概"更值钱 */
    grazeRadius: 1.8,
    grazeDamage: 1,
    /** 攻击者延迟拿到模糊命中反馈 */
    feedbackDelay: 0.5,
    fixedTick: 1 / 20,
  },
  exposure: {
    /** 开火后多久才把射手的旧位置交给对手 */
    delay: 0.5,
    duration: 1.4,
    /** 量化格边长：4 m 让暴露成为"需要推理的区域"而不是准星 */
    cellSize: 4,
  },
  scan: {
    /** 场地变大后同步放大；5.5 m 圆覆盖可行走面积约 34% */
    radius: 5.5,
    /** 命中时回放的历史长度，够长才能看出朝向并预判 */
    trailSeconds: 2,
    displaySeconds: 3,
    perRound: 1,
  },
  screen: {
    /** 地图宽高严格等于 22:20，不拉伸 */
    mapWidth: 6.6,
    mapHeight: 6,
    /** 地图下边缘离地高度：与 1.7 m 视高配合，最近合法站位处俯仰角约 -12°~+51° */
    bottomHeight: 0.8,
    planeZ: 0.3,
  },
  /** 轨迹采样保留时长，需大于 scan.trailSeconds */
  historySeconds: 3,
} as const

export type Difficulty = 'cadet' | 'operator' | 'hunter'

/**
 * 难度只允许改变反应时间、瞄准散布、决策频率与侦测时机。
 * HP、移速、冷却、命中半径与信息权限对双方永远相同。
 */
export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    label: string
    description: string
    movementSpeed: number
    reactionSeconds: number
    informedScatter: number
    blindScatter: number
    decisionMin: number
    decisionMax: number
    scanDelayMin: number
    scanDelayMax: number
    /** 线索多久之后不再采用 */
    clueTrustSeconds: number
  }
> = {
  cadet: {
    label: '见习',
    description: '反应慢，散布大，常常空手开火',
    movementSpeed: GAME_CONFIG.movement.baseSpeed,
    reactionSeconds: 1.3,
    informedScatter: 2.1,
    blindScatter: 5.6,
    decisionMin: 6,
    decisionMax: 9,
    scanDelayMin: 30,
    scanDelayMax: 46,
    clueTrustSeconds: 2.2,
  },
  operator: {
    label: '行动员',
    description: '会等线索，会预判走向',
    movementSpeed: GAME_CONFIG.movement.baseSpeed,
    reactionSeconds: 0.8,
    informedScatter: 1.15,
    blindScatter: 4.4,
    decisionMin: 4.6,
    decisionMax: 7.2,
    scanDelayMin: 20,
    scanDelayMax: 34,
    clueTrustSeconds: 3,
  },
  hunter: {
    label: '猎手',
    description: '反应快，散布小，几乎不浪费冷却',
    movementSpeed: GAME_CONFIG.movement.baseSpeed,
    reactionSeconds: 0.5,
    informedScatter: 0.62,
    blindScatter: 3.4,
    decisionMin: 3.4,
    decisionMax: 5.4,
    scanDelayMin: 15,
    scanDelayMax: 26,
    clueTrustSeconds: 3.4,
  },
}

/**
 * 障碍布局：中央长条 + 左右两道斜肋 + 两个后方凹位，构成至少一条绕行环路。
 * 已用 0.25 m 栅格洪泛验证：可行走区域全连通，无封闭死角，两个出生点互相可达。
 * 高度 1.6~1.9 m 是刻意的——齐眼的掩体才能给出房间的尺度参照，
 * 也让"障碍只挡走位、不挡坐标伤害"这条规则在视觉上说得通。
 */
export const OBSTACLES = [
  { x: 11, z: 12.2, width: 4, depth: 1.6, height: 1.9, rotation: 0 },
  { x: 4.6, z: 9, width: 3.2, depth: 1.4, height: 1.65, rotation: -0.22 },
  { x: 17.4, z: 9.4, width: 3.2, depth: 1.4, height: 1.65, rotation: 0.2 },
  { x: 7, z: 16.8, width: 3, depth: 1.3, height: 1.6, rotation: 0.14 },
  { x: 15.2, z: 17, width: 3, depth: 1.3, height: 1.6, rotation: -0.16 },
] as const

/** 逐回合互换，避免出生点带来系统性优势 */
export const START_POSITIONS = {
  player: { x: 3.4, z: 17.6 },
  ai: { x: 18.6, z: 17.6 },
} as const
