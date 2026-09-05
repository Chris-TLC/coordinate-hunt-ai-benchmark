/* 无头模拟测试:AI vs AI 对战,N 局统计(验证可运行性、回合节奏、命中率) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'mirrorroom.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* ---------- DOM 桩 ---------- */
function makeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({
    canvas: null, measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createPattern: () => grad, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }, {
    get(t, p) {
      if (p in t) return t[p];
      return () => undefined;   // 其余方法全部 no-op
    },
    set() { return true; },
  });
}
function makeEl() {
  const el = {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    children: [], innerHTML: '', textContent: '',
    addEventListener() {}, appendChild() {}, setAttribute() {},
    querySelectorAll: () => [], querySelector: () => null,
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    requestPointerLock: () => undefined,
  };
  return new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      return (...a) => undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const documentStub = {
  createElement: () => makeEl(),
  getElementById: () => makeEl(),
  addEventListener() {},
  head: makeEl(),
  body: makeEl(),
  documentElement: makeEl(),
  pointerLockElement: null,
  exitPointerLock() {},
};
const windowStub = {
  addEventListener() {},
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2,
  requestAnimationFrame() { return 0; },
};
const locationStub = { search: '' };
const performanceStub = { now: () => Date.now() };
const navigatorStub = {};

const fn = new Function(
  'window', 'document', 'location', 'performance', 'navigator',
  script + '\n;return window.__G;'
);
const G = fn(windowStub, documentStub, locationStub, performanceStub, navigatorStub);

/* ---------- 模拟 ---------- */
function runOne(diff, seed) {
  const m = G.newSim(diff, seed);
  const dt = 1 / 60;
  const maxSteps = 60 * 130;
  let steps = 0;
  while (m.state !== 'end' && steps < maxSteps) {
    G.stepSim(m, dt);
    steps++;
  }
  const s = G.simStats(m);
  return { steps, dur: steps / 60, ...s };
}

for (const diff of ['easy', 'normal', 'hard']) {
  const N = 60;
  const rows = [];
  for (let seed = 1; seed <= N; seed++) rows.push(runOne(diff, seed));
  const kills = rows.filter(r => r.state === 'end' && (r.php <= 0 || r.ehp <= 0));
  const timeouts = rows.filter(r => r.state === 'end' && r.php > 0 && r.ehp > 0);
  const pWin = rows.filter(r => r.winner === 'player').length;
  const eWin = rows.filter(r => r.winner === 'enemy').length;
  const draws = rows.filter(r => r.winner === 'draw').length;
  const pShots = rows.reduce((a, r) => a + r.pShots, 0);
  const pHits = rows.reduce((a, r) => a + r.pHits, 0);
  const eShots = rows.reduce((a, r) => a + r.eShots, 0);
  const eHits = rows.reduce((a, r) => a + r.eHits, 0);
  const pScans = rows.reduce((a, r) => a + r.pScans, 0);
  const pFound = rows.reduce((a, r) => a + r.pFound, 0);
  const eScans = rows.reduce((a, r) => a + r.eScans, 0);
  const eFound = rows.reduce((a, r) => a + r.eFound, 0);
  const avgDur = rows.reduce((a, r) => a + r.dur, 0) / N;
  const avgShotsP = pShots / N, avgShotsE = eShots / N;
  console.log('================ 难度:' + diff + ' (N=' + N + ') ================');
  console.log('结局: 击杀 ' + kills.length + ' | 时间到 ' + timeouts.length + ' | 平局 ' + draws);
  console.log('胜负: 玩家侧胜 ' + pWin + ' | 敌方胜 ' + eWin + ' | 平 ' + draws);
  console.log('平均用时: ' + avgDur.toFixed(1) + 's (回合上限 120s)');
  console.log('玩家侧: 射击 ' + avgShotsP.toFixed(1) + '/局, 命中率 ' + (pHits / Math.max(1, pShots) * 100).toFixed(1) + '%, 侦测 ' + (pScans / N).toFixed(1) + ' 次(发现 ' + (pFound / N).toFixed(1) + ')');
  console.log('敌方:   射击 ' + avgShotsE.toFixed(1) + '/局, 命中率 ' + (eHits / Math.max(1, eShots) * 100).toFixed(1) + '%, 侦测 ' + (eScans / N).toFixed(1) + ' 次(发现 ' + (eFound / N).toFixed(1) + ')');
  console.log('');
}
console.log('SIM OK');
