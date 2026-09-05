'use strict';
/* ================= 工具函数 ================= */

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function frac(v) { v = v - Math.floor(v); return v < 0 ? v + 1 : v; }
function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 全局游戏随机源(每局可重置,保证可复现) */
let RNG = mulberry32((Date.now() % 1e9) | 0);
function seedRng(s) { RNG = mulberry32(s | 0); }
function rnd(a, b) { return a + RNG() * (b - a); }
function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(arr) { return arr[Math.floor(RNG() * arr.length) % arr.length]; }

/* 标准正态 */
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = RNG();
  while (v === 0) v = RNG();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = (s / 60) | 0;
  return m + ':' + String(s % 60).padStart(2, '0');
}

function hash2(x, y) {
  let h = ((x * 374761393) ^ (y * 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function drawText(ctx, text, x, y, size, color, align, alpha, font) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.font = size + 'px ' + (font || '"SF Mono",Menlo,Consolas,monospace');
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* 世界坐标 → 巨幕位图像素 */
function mapPX(x) { return (x + 8) / 16 * C.MAP_W; }
function mapPY(z) { return z / 15 * C.MAP_H; }

/* 圆形径向渐变缓存辅助 */
function radialGlow(ctx, x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}
