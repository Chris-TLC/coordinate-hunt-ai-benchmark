'use strict';
/* ================= 《对影 MIRRORROOM》 常量与调参 ================= */

const C = {
  /* 房间 */
  ROOM_W: 16, ROOM_D: 15,            // 16m 宽 × 15m 深
  WALL_H: 4.2,                        // 普通墙高
  SCREEN_H: 6.4, SCREEN_Y0: 0.4,     // 巨幕高 / 幕底离地
  EYE: 1.7,                           // 视点高度
  FOV: 78 * Math.PI / 180,
  PLAYER_R: 0.32,                     // 碰撞半径

  /* 移动 */
  WALK: 2.35, RUN: 3.95,
  ADRENALINE_MULT: 1.3, ADRENALINE_T: 1.4,

  /* 回合 */
  ROUND_T: 120, COUNTDOWN: 3.6,
  MAX_HP: 100,

  /* 武器 */
  GUN_CD: 0.85, GUN_DMG: 34, GUN_RADIUS: 1.15, NEAR_MISS: 2.4,
  SCAN_CD: 9, SCAN_DELAY: 0.65, SCAN_R: 3.2, SCAN_REVEAL: 1.5,

  /* 打击感 */
  HITSTOP: 0.13, KILL_TS: 0.3, KILL_SLOW_T: 1.05,

  /* 痕迹系统 */
  TRAIL_RUN:  { every: [0.45, 0.8],  life: 2.4, noise: 0.5,  alpha: 0.5 },
  TRAIL_WALK: { every: [3.0, 5.2],   life: 1.9, noise: 0.95, alpha: 0.34 },
  RIPPLE:     { idle: 4.5, every: 2.6, life: 1.15, noise: 1.3, alpha: 0.15 },

  /* 终局全域扫描 */
  ENDGAME: { at: 25, every: 6, reveal: 1.6, sweep: 0.9 },

  /* 特效寿命 */
  FLASH_LIFE: 2.7, BEAM_LIFE: 0.3, INCOMING_LIFE: 0.55, PULSE_LIFE: 1.1,

  /* 巨幕位图(蓝图) */
  MAP_W: 960, MAP_H: 384,
};

/* 障碍物:网格坐标(1 格 = 1 米;gx∈[0,15] 对应 x∈[-8,8],gz∈[0,14] 对应 z∈[0,15]) */
const MAPDEF = {
  obstacles: [
    { gx: 4,  gz: 4,  w: 1, h: 1 },   // 左前柱
    { gx: 11, gz: 4,  w: 1, h: 1 },   // 右前柱
    { gx: 6,  gz: 7,  w: 2, h: 1 },   // 中央货箱
    { gx: 12, gz: 9,  w: 1, h: 1 },   // 右侧柱
    { gx: 2,  gz: 10, w: 2, h: 1 },   // 左后箱
    { gx: 9,  gz: 12, w: 1, h: 1 },   // 后右柱
  ],
  spawn: { x: 0, z: 13.5 },
};

/* AI 难度预设 */
const DIFF = {
  easy: {
    name: '简单', noise: 1.9, react: 0.9, cadence: [2.4, 4.2],
    confThresh: 34, scanEvery: 13, camp: 0.2, follow: 1.0, walkBias: 0.5,
  },
  normal: {
    name: '标准', noise: 1.25, react: 0.5, cadence: [1.7, 3.0],
    confThresh: 24, scanEvery: 10, camp: 0.16, follow: 1.6, walkBias: 0.32,
  },
  hard: {
    name: '困难', noise: 0.85, react: 0.28, cadence: [1.3, 2.4],
    confThresh: 16, scanEvery: 8, camp: 0.08, follow: 2.2, walkBias: 0.2,
  },
};
