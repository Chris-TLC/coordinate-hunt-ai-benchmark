'use strict';
/* ================= HUD / 界面 ================= */

const CSS_TEXT = `
:root { --cy: #9fd8ff; --cy2: #6fc3ff; --red: #ff5040; --amber: #ffd76a; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:100%; height:100%; overflow:hidden; background:#05070c;
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  color:#cfe8f7; -webkit-user-select:none; user-select:none; }
#stage { position:fixed; inset:0; }
#game { display:block; width:100%; height:100%; }
#ui { position:fixed; inset:0; pointer-events:none; z-index:10; }
.hidden { display:none !important; }

/* ---------- 对局 HUD ---------- */
.hud-top { position:absolute; top:18px; left:0; right:0; display:flex; flex-direction:column; align-items:center; gap:6px; }
.timer { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:44px; font-weight:600;
  color:#d9f1ff; text-shadow:0 0 18px rgba(120,210,255,.35); letter-spacing:2px; }
.timer.urgent { color:#ff6a5e; text-shadow:0 0 18px rgba(255,80,64,.5); animation:tpulse 1s infinite; }
@keyframes tpulse { 50% { opacity:.55; } }
.msg { font-size:15px; letter-spacing:3px; min-height:20px; text-shadow:0 0 12px rgba(0,0,0,.8); }
.hp { position:absolute; left:26px; bottom:26px; display:flex; align-items:center; gap:10px; }
.hp-label { font-size:12px; letter-spacing:2px; color:#7fa8c8; }
.hp-segs { display:flex; gap:4px; }
.hp-seg { width:44px; height:10px; background:rgba(140,220,255,.14); border:1px solid rgba(140,220,255,.3); position:relative; overflow:hidden; }
.hp-seg i { position:absolute; inset:0; background:linear-gradient(90deg,#4fd8ff,#a8f0ff); transform-origin:left; }
.hp-seg.low i { background:linear-gradient(90deg,#ff5040,#ff9d5e); }
.scan { position:absolute; right:26px; bottom:26px; display:flex; align-items:center; gap:10px; }
.scan-label { font-size:12px; letter-spacing:2px; color:#7fa8c8; }
.scan-ring { width:40px; height:40px; border-radius:50%; position:relative;
  background:conic-gradient(rgba(120,230,255,.85) 0deg, rgba(120,230,255,.1) 0deg);
  border:1px solid rgba(140,220,255,.35); display:flex; align-items:center; justify-content:center; }
.scan-ring::after { content:''; position:absolute; inset:5px; border-radius:50%; background:#060b12; }
.scan-ring span { position:relative; z-index:1; font-size:14px; color:#bfe8ff; }
.scan.ready .scan-ring { border-color:rgba(140,240,255,.9); box-shadow:0 0 16px rgba(120,230,255,.5); }
.hint { position:absolute; bottom:100px; left:50%; transform:translateX(-50%); max-width:70%;
  text-align:center; font-size:14px; letter-spacing:1px; color:#bcd9ec;
  background:rgba(6,11,18,.55); border:1px solid rgba(120,200,255,.18); border-radius:8px;
  padding:8px 18px; text-shadow:0 0 8px rgba(0,0,0,.8); }
.count { position:absolute; top:34%; left:0; right:0; text-align:center;
  font-family:"SF Mono",Menlo,monospace; font-size:110px; font-weight:700; color:#d9f1ff;
  text-shadow:0 0 40px rgba(120,210,255,.6); }
.toast { position:absolute; bottom:150px; left:50%; transform:translateX(-50%);
  font-size:13px; letter-spacing:2px; color:#ff9d8e; opacity:0; transition:opacity .2s; }

/* ---------- 面板 ---------- */
.panel-layer { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(3,6,11,.72); }
.panel { pointer-events:auto; background:rgba(8,13,22,.92); border:1px solid rgba(120,200,255,.22);
  border-radius:16px; padding:44px 56px; text-align:center; min-width:520px; max-width:640px;
  box-shadow:0 0 80px rgba(30,80,130,.25), inset 0 0 60px rgba(20,50,80,.15);
  animation:pop .35s cubic-bezier(.2,1.4,.4,1); }
@keyframes pop { from { transform:scale(.92); opacity:0; } }
.title { font-size:76px; font-weight:700; letter-spacing:18px; color:#e8f6ff;
  text-shadow:0 0 30px rgba(120,210,255,.45), 0 0 80px rgba(120,210,255,.2); margin-left:18px; }
.subtitle { margin-top:6px; font-size:13px; letter-spacing:6px; color:#6fa8d0; font-family:"SF Mono",Menlo,monospace; }
.pitch { margin-top:22px; font-size:15px; line-height:1.9; color:#a8c8de; }
.pitch b { color:#bfe8ff; font-weight:600; }
.diff { margin-top:26px; display:flex; gap:10px; justify-content:center; }
.diff button { pointer-events:auto; font-family:inherit; font-size:14px; letter-spacing:2px; color:#8fb8d4;
  background:rgba(20,32,48,.6); border:1px solid rgba(120,200,255,.2); border-radius:8px;
  padding:9px 26px; cursor:pointer; transition:all .15s; }
.diff button:hover { color:#d9f1ff; border-color:rgba(140,220,255,.5); }
.diff button.on { color:#041018; background:linear-gradient(180deg,#8fd8ff,#5fb8ee); border-color:#9fd8ff;
  box-shadow:0 0 18px rgba(120,210,255,.4); font-weight:700; }
.big { pointer-events:auto; font-family:inherit; margin-top:30px; font-size:19px; letter-spacing:10px;
  color:#e8f6ff; background:linear-gradient(180deg,rgba(40,80,120,.85),rgba(18,40,64,.85));
  border:1px solid rgba(140,220,255,.45); border-radius:10px; padding:15px 60px; cursor:pointer;
  text-shadow:0 0 10px rgba(140,220,255,.6); transition:all .15s; }
.big:hover { box-shadow:0 0 26px rgba(120,210,255,.4); transform:translateY(-1px); }
.big:active { transform:translateY(1px); }
.controls { margin-top:26px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.ctl { font-size:11.5px; letter-spacing:1px; color:#7fa8c8; background:rgba(16,26,40,.6);
  border:1px solid rgba(120,200,255,.14); border-radius:6px; padding:6px 12px; }
.ctl b { display:block; color:#bfe8ff; font-weight:600; font-size:12px; margin-bottom:2px; }
.foot { margin-top:24px; font-size:11px; letter-spacing:2px; color:#4d6f8a; }

/* 结算 */
.end-title { font-size:56px; font-weight:700; letter-spacing:14px; }
.end-title.win { color:#7fe8c0; text-shadow:0 0 30px rgba(90,230,170,.4); }
.end-title.lose { color:#ff6a5e; text-shadow:0 0 30px rgba(255,80,64,.4); }
.end-title.draw { color:#ffd76a; text-shadow:0 0 30px rgba(255,210,110,.4); }
.end-reason { margin-top:10px; font-size:14px; letter-spacing:3px; color:#8fb8d4; }
.stats { margin-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:10px 26px; text-align:left; }
.stat { display:flex; justify-content:space-between; font-size:13.5px; color:#9fc4de;
  border-bottom:1px dashed rgba(120,200,255,.15); padding:6px 2px; }
.stat b { color:#d9f1ff; font-family:"SF Mono",Menlo,monospace; font-weight:600; }
.end-btns { margin-top:30px; display:flex; gap:14px; justify-content:center; }
.end-btns button { pointer-events:auto; font-family:inherit; font-size:15px; letter-spacing:4px; padding:11px 30px;
  border-radius:8px; cursor:pointer; transition:all .15s; }
.btn-pri { color:#041018; background:linear-gradient(180deg,#8fd8ff,#5fb8ee); border:1px solid #9fd8ff; font-weight:700; }
.btn-pri:hover { box-shadow:0 0 20px rgba(120,210,255,.5); }
.btn-sec { color:#a8cfe8; background:rgba(20,32,48,.6); border:1px solid rgba(120,200,255,.25); }
.btn-sec:hover { border-color:rgba(140,220,255,.6); }

/* 暂停 */
.pause-title { font-size:34px; letter-spacing:12px; color:#d9f1ff; }
.sliders { margin-top:22px; display:flex; flex-direction:column; gap:14px; text-align:left; }
.slider { display:flex; align-items:center; gap:14px; font-size:13px; color:#9fc4de; letter-spacing:2px; }
.slider span { width:64px; }
.slider input { flex:1; accent-color:#6fc3ff; cursor:pointer; }
.slider em { width:44px; font-style:normal; font-family:"SF Mono",Menlo,monospace; color:#d9f1ff; }
.pause-btns { margin-top:26px; display:flex; flex-direction:column; gap:10px; }
.pause-btns button { pointer-events:auto; font-family:inherit; font-size:14px; letter-spacing:4px; color:#bfe8ff;
  background:rgba(20,32,48,.55); border:1px solid rgba(120,200,255,.22); border-radius:8px;
  padding:11px 0; cursor:pointer; transition:all .15s; }
.pause-btns button:hover { border-color:rgba(140,220,255,.6); box-shadow:0 0 14px rgba(120,210,255,.25); }
`;

const HINTS = [
  { t: 4.2, text: 'WASD 移动 · 鼠标环视房间' },
  { t: 5.2, text: '按住 SHIFT 奔跑 — 更快,但脚步声更响,地图上会留下轨迹' },
  { t: 5.6, text: '瞄准巨幕上的位置,左键开火 — 子弹落在对面房间的同一位置' },
  { t: 5.6, text: '右键发射侦测器 — 区域内有人会被锁定;但敌方也会看到脉冲' },
  { t: 4.6, text: '三枪命中即可击败目标 · 停下脚步,听 — 声音会穿过墙壁' },
];

const HUD = {
  init(main) {
    this.main = main;
    const style = document.createElement('style');
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud" class="hidden">
      <div class="hud-top">
        <div class="timer" id="timer">2:00</div>
        <div class="msg" id="msg"></div>
      </div>
      <div class="hp"><div class="hp-label">生命</div><div class="hp-segs" id="hpsegs"></div></div>
      <div class="scan" id="scanbox"><div class="scan-ring" id="scanring"><span id="scanicon">◈</span></div><div class="scan-label" id="scanlabel">侦测</div></div>
      <div class="hint hidden" id="hint"></div>
      <div class="count hidden" id="count"></div>
      <div class="toast" id="toast"></div>
      </div>

      <div class="panel-layer hidden" id="menulayer">
        <div class="panel">
          <div class="title">对影</div>
          <div class="subtitle">MIRRORROOM · 隔墙对局</div>
          <div class="pitch">巨幕里是<b>对方的房间</b>。你看不见他 —<br>只能看见他留下的<b>光影痕迹</b>与<b>脚步声</b>。<br>朝屏幕开火,子弹会落在对面房间的同一位置。</div>
          <div class="diff" id="diffsel">
            <button data-d="easy">简单</button>
            <button data-d="normal" class="on">标准</button>
            <button data-d="hard">困难</button>
          </div>
          <div><button class="big" id="startbtn">开始对局</button></div>
          <div class="controls">
            <div class="ctl"><b>WASD</b>移动</div>
            <div class="ctl"><b>SHIFT</b>奔跑·会暴露</div>
            <div class="ctl"><b>左键</b>向巨幕射击</div>
            <div class="ctl"><b>右键</b>侦测扫描</div>
            <div class="ctl"><b>ESC</b>暂停</div>
          </div>
          <div class="foot">回合 120 秒 · 三枪定胜负 · 完全离线 · 素材全部由代码生成</div>
        </div>
      </div>

      <div class="panel-layer hidden" id="endlayer">
        <div class="panel">
          <div class="end-title" id="endtitle">胜利</div>
          <div class="end-reason" id="endreason"></div>
          <div class="stats" id="endstats"></div>
          <div class="end-btns">
            <button class="btn-pri" id="rematch">再来一局</button>
            <button class="btn-sec" id="tomenu">回到标题</button>
          </div>
        </div>
      </div>

      <div class="panel-layer hidden" id="pauselayer">
        <div class="panel">
          <div class="pause-title">暂停</div>
          <div class="sliders">
            <div class="slider"><span>灵敏度</span><input type="range" id="sens" min="0.4" max="2" step="0.05" value="1"><em id="sensv">1.00</em></div>
            <div class="slider"><span>音量</span><input type="range" id="vol" min="0" max="1" step="0.05" value="0.9"><em id="volv">90%</em></div>
          </div>
          <div class="pause-btns">
            <button id="resume">继续对局</button>
            <button id="restart">重新开始</button>
            <button id="quit">回到标题</button>
          </div>
        </div>
      </div>`;
    this.$ = id => document.getElementById(id);

    const hpsegs = this.$('hpsegs');
    hpsegs.innerHTML = '<div class="hp-seg"><i style="transform:scaleX(1)"></i></div>'.repeat(3);

    /* 事件绑定 */
    this.$('startbtn').addEventListener('click', () => {
      AudioSys.init();
      AudioSys.click();
      main.startMatch(main.diffKey);
    });
    this.$('diffsel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      AudioSys.init(); AudioSys.click();
      main.diffKey = b.dataset.d;
      this.$('diffsel').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    this.$('rematch').addEventListener('click', () => { AudioSys.click(); main.startMatch(main.diffKey); });
    this.$('tomenu').addEventListener('click', () => { AudioSys.click(); main.toMenu(); });
    this.$('resume').addEventListener('click', () => { AudioSys.click(); main.resume(); });
    this.$('restart').addEventListener('click', () => { AudioSys.click(); main.startMatch(main.diffKey); });
    this.$('quit').addEventListener('click', () => { AudioSys.click(); main.toMenu(); });
    this.$('sens').addEventListener('input', e => {
      main.sens = parseFloat(e.target.value);
      this.$('sensv').textContent = main.sens.toFixed(2);
    });
    this.$('vol').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      AudioSys.muted = false;
      AudioSys.setVolume(v);
      this.$('volv').textContent = Math.round(v * 100) + '%';
    });
  },

  showMenu() {
    this.$('menulayer').classList.remove('hidden');
    this.$('endlayer').classList.add('hidden');
    this.$('pauselayer').classList.add('hidden');
  },
  hideAll() {
    this.$('menulayer').classList.add('hidden');
    this.$('endlayer').classList.add('hidden');
    this.$('pauselayer').classList.add('hidden');
  },
  showEnd(match) {
    const t = this.$('endtitle');
    const w = match.winner;
    t.className = 'end-title ' + (w === 'player' ? 'win' : w === 'enemy' ? 'lose' : 'draw');
    t.textContent = w === 'player' ? '胜 利' : w === 'enemy' ? '失 败' : '平 局';
    const r = this.$('endreason');
    if (match.endReason === 'kill') r.textContent = w === 'player' ? '目标被消灭' : '你被消灭了';
    else r.textContent = w === 'draw' ? '时间到 · 生命值相同' : '时间到 · 生命值' + (w === 'player' ? '领先' : '落后');
    const s = match.stats;
    const used = C.ROUND_T - Math.max(0, match.timeLeft);
    this.$('endstats').innerHTML = `
      <div class="stat"><span>射击次数</span><b>${s.pShots}</b></div>
      <div class="stat"><span>命中 / 命中率</span><b>${s.pHits} / ${match.accuracy('p')}%</b></div>
      <div class="stat"><span>敌方命中</span><b>${s.eHits}</b></div>
      <div class="stat"><span>侦测 / 锁定</span><b>${s.pScans} / ${s.pFound}</b></div>
      <div class="stat"><span>剩余生命</span><b>${match.player.hp}</b></div>
      <div class="stat"><span>对局用时</span><b>${fmtTime(used)}</b></div>`;
    this.$('endlayer').classList.remove('hidden');
  },
  showPause() {
    this.$('pauselayer').classList.remove('hidden');
  },
  hidePause() {
    this.$('pauselayer').classList.add('hidden');
  },

  setHint(text) {
    const h = this.$('hint');
    h.textContent = text;
    h.classList.remove('hidden');
  },
  hideHint() {
    this.$('hint').classList.add('hidden');
  },
  toast(text, ms) {
    const t = this.$('toast');
    t.textContent = text;
    t.style.opacity = 1;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.style.opacity = 0; }, ms || 1000);
  },

  update(match) {
    const show = match && (match.state === 'play' || match.state === 'ending' || match.state === 'countdown');
    this.$('hud').classList.toggle('hidden', !show);
    this.$('timer').textContent = fmtTime(match ? match.timeLeft : 0);
    this.$('timer').classList.toggle('urgent', show && match.timeLeft <= 30);
    /* 生命 */
    const hp = match ? match.player.hp : 100;
    const segs = this.$('hpsegs').children;
    for (let i = 0; i < 3; i++) {
      const f = clamp((hp - i * 33.4) / 33.4, 0, 1);
      segs[i].querySelector('i').style.transform = 'scaleX(' + f.toFixed(3) + ')';
      segs[i].classList.toggle('low', f > 0 && i === 2);
    }
    /* 侦测冷却 */
    const scan = this.$('scanbox');
    if (match) {
      const p = 1 - clamp(match.player.scanCd / C.SCAN_CD, 0, 1);
      this.$('scanring').style.background = 'conic-gradient(rgba(120,230,255,.85) ' + (p * 360).toFixed(0) + 'deg, rgba(120,230,255,.1) 0deg)';
      scan.classList.toggle('ready', match.player.scanCd <= 0 && !match.player.scanActive);
      this.$('scanlabel').textContent = match.player.scanActive ? '侦测中' : (match.player.scanCd <= 0 ? '就绪' : '冷却');
    }
    /* 消息 */
    const m = this.$('msg');
    if (match && match.hudMsg) {
      m.textContent = match.hudMsg.text;
      m.style.color = match.hudMsg.color;
      m.style.opacity = Math.min(1, match.hudMsgT * 3 + 0.3);
    } else m.textContent = '';
    /* 倒计时数字 */
    const c = this.$('count');
    if (match && match.state === 'countdown') {
      c.classList.remove('hidden');
      c.textContent = Math.max(1, Math.ceil(match.countT));
    } else c.classList.add('hidden');
  },
};
