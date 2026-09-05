'use strict';
/* ============ 坐标猎场 · 主游戏 ============ */
const GAME = (() => {

/* ---------------- 规则常量 ----------------
   数值经过无头模拟批量调校(见 _sim.js):
   在"猎手"难度下,会走位看痕迹的玩家胜率约 52%,新手约 23%,
   一局平均 35~45 秒结束,既有来回博弈,也不会拖到超时。*/
const RULE = {
  ROUND_TIME: 120,
  HP_MAX: 100,
  DMG_CORE: 22,        // 直击(核心圈内)—— 需要 5 发才能击倒
  DMG_EDGE: 11,        // 擦伤(外缘)
  HIT_CORE_R: 0.80,    // 核心命中半径(米)
  HIT_EDGE_R: 1.45,    // 擦伤半径(米)
  RELOAD: 2.0,         // 两枪之间的冷却 —— 每一枪都要想清楚
  AMMO_MAX: 5,         // 弹夹
  RELOAD_FULL: 2.6,    // 打空后换弹
  DET_COOLDOWN: 11,    // 侦测器冷却
  DET_RAD: 2.6,        // 侦测器半径(米,方形半边)
  DET_TRAIL: 2.2,      // 侦测器显示的历史轨迹秒数
  WALK: 3.5,
  SPRINT: 5.9,
  HURT_SPRINT_BOOST: 1.32,   // 受击后加速逃跑
  HURT_BOOST_TIME: 3.2,
  TRAIL_INTERVAL: 0.42,      // 移动残痕生成间隔
  TRAIL_SPRINT_MUL: 1.9,     // 疾跑残痕更明显
  FLASH_LIFE: 2.6,           // 开火闪光在对方屏幕上的持续
  TRAIL_LIFE: 1.9,
  PLAYER_R: 0.34,
  /* —— 体温显影 ——
     房间是封闭的,没有藏身处。站着不动久了,你的体温会在对方屏幕上
     慢慢烧出一团热痕 —— 越站越亮、越站越准。
     这条规则把"蹲着不动"这个退化解堵死:
       动 → 留下移动残痕   不动 → 烧出热痕   开枪 → 直接暴露坐标
     三条路都要付代价,博弈才成立。*/
  HEAT_DELAY: 4.2,           // 静止多久开始显影
  HEAT_FULL: 12.0,           // 多久烧到最亮
  HEAT_MOVE_RESET: 0.55,     // 移动多少米清空积累
  HEAT_COOL_RATE: 2.6,       // 移动时热度消退倍率
  HEAT_SPREAD_MAX: 2.6,      // 刚显影时的模糊半径(米)
  HEAT_SPREAD_MIN: 0.85,     // 烧到最亮时的模糊半径 —— 留一点余地,不做斩杀
};

/* ---------------- 全局状态 ---------------- */
const S = {
  phase:'menu',        // menu | countdown | play | over | paused
  t:0, dt:0, roundT:RULE.ROUND_TIME,
  countdown:4.6,
  difficulty:'std',
  sens:1.0,
  tally:{win:0,lose:0,draw:0},
  shake:0, shakeT:0,
  hurtFlash:0, dmgDir:0,
  hitFeedback:0,
  msg:null, msgT:0,
  hint:null, hintT:0,
  killcam:null,
};

/* 实体 */
function newEnt(spawn,isPlayer){
  return {
    x:spawn.x, z:spawn.z, yaw:spawn.yaw, pitch:0,
    vx:0, vz:0,
    hp:RULE.HP_MAX,
    ammo:RULE.AMMO_MAX, reloadT:0, cool:0, reloading:false,
    detCd:0,
    trailT:0, stepT:0, bob:0, sprinting:false,
    hurtBoost:0,
    hist:[],            // 位置历史(供侦测器读取轨迹)
    histT:0,
    stillT:0,           // 静止累计时间(体温显影)
    heat:0,             // 当前热度 0~1
    anchorX:spawn.x, anchorZ:spawn.z,   // 静止锚点
    isPlayer:!!isPlayer,
    shots:0, hits:0, dmgDealt:0, dmgTaken:0, detUsed:0, detHits:0,
    moved:0,
  };
}
let P=null, E=null, ai=null;

/* 输入 */
const IN = { f:0,b:0,l:0,r:0, sprint:false, fire:false, ads:false, mdx:0, mdy:0, locked:false };
let adsK=0;   // 瞄准镜过渡 0~1

/* ---------------- 初始化 ---------------- */
let hudC=null, hx=null;
function boot(){
  SCENE.initTextures();
  SCENE.buildStatic();
  SCENE.buildScreenQuad();
  SCENE.initDyn();
  hudC=document.getElementById('hud'); hx=hudC.getContext('2d');
  resizeHUD();
  addEventListener('resize',resizeHUD);
  bindInput();
  bindUI();
  requestAnimationFrame(loop);
}
function resizeHUD(){
  const d=Math.min(devicePixelRatio||1,2);
  hudC.width=Math.floor(innerWidth*d); hudC.height=Math.floor(innerHeight*d);
  hudC.style.width=innerWidth+'px'; hudC.style.height=innerHeight+'px';
  hx.setTransform(d,0,0,d,0,0);
}

/* ---------------- 输入 ---------------- */
function bindInput(){
  const cv=GL.cnv;
  addEventListener('keydown',e=>{
    if(e.repeat) return;
    const k=e.code;
    if(k==='KeyW'||k==='ArrowUp')IN.f=1;
    if(k==='KeyS'||k==='ArrowDown')IN.b=1;
    if(k==='KeyA'||k==='ArrowLeft')IN.l=1;
    if(k==='KeyD'||k==='ArrowRight')IN.r=1;
    if(k==='ShiftLeft'||k==='ShiftRight')IN.sprint=true;
    if(k==='KeyQ'){ toggleDetector(); e.preventDefault(); }
    if(k==='KeyR'){ manualReload(); }
    if(k==='Escape'){ togglePause(); }
    if(k==='Space'&&S.phase==='over'){ restart(); }
    if(['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup',e=>{
    const k=e.code;
    if(k==='KeyW'||k==='ArrowUp')IN.f=0;
    if(k==='KeyS'||k==='ArrowDown')IN.b=0;
    if(k==='KeyA'||k==='ArrowLeft')IN.l=0;
    if(k==='KeyD'||k==='ArrowRight')IN.r=0;
    if(k==='ShiftLeft'||k==='ShiftRight')IN.sprint=false;
  });
  document.addEventListener('pointerlockchange',()=>{
    IN.locked = document.pointerLockElement===cv;
    if(!IN.locked && S.phase==='play'){ setPause(true); }
  });
  cv.addEventListener('mousemove',e=>{
    if(!IN.locked) return;
    IN.mdx+=e.movementX; IN.mdy+=e.movementY;
  });
  cv.addEventListener('mousedown',e=>{
    if(S.phase==='menu'||S.phase==='over') return;
    if(!IN.locked){ cv.requestPointerLock(); return; }
    if(e.button===0) tryFire();
    if(e.button===2){ IN.ads=true; }
  });
  cv.addEventListener('mouseup',e=>{
    if(e.button===2) IN.ads=false;
  });
  addEventListener('blur',()=>{ IN.ads=false; IN.f=IN.b=IN.l=IN.r=0; IN.sprint=false; });
  cv.addEventListener('contextmenu',e=>e.preventDefault());
}
function bindUI(){
  const $=id=>document.getElementById(id);
  $('diffChips').addEventListener('click',e=>{
    const c=e.target.closest('.chip'); if(!c) return;
    [...$('diffChips').children].forEach(x=>x.classList.remove('on'));
    c.classList.add('on'); S.difficulty=c.dataset.d; SFX.uiClick();
  });
  $('sndSwitch').addEventListener('click',e=>{
    const on=!e.target.classList.contains('on');
    e.target.classList.toggle('on',on);
    e.target.textContent=on?'开启':'关闭';
    SFX.enabled=on; SFX.uiClick();
  });
  $('vol').addEventListener('input',e=>{ SFX.vol=e.target.value/100; });
  $('sens').addEventListener('input',e=>{ S.sens=e.target.value/100; });
  $('btnStart').addEventListener('click',()=>{ SFX.unlock(); SFX.uiClick(); startRound(); });
  $('btnResume').addEventListener('click',()=>{ setPause(false); });
  $('btnRestart').addEventListener('click',()=>{ $('pause').classList.add('hidden'); startRound(); });
  $('btnQuit').addEventListener('click',()=>{ toMenu(); });
  $('btnAgain').addEventListener('click',()=>{ SFX.uiClick(); startRound(); });
  $('btnMenu').addEventListener('click',()=>{ toMenu(); });
}

/* ---------------- 回合控制 ---------------- */
function startRound(){
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  P=newEnt(WORLD.playerSpawn,true);
  E=newEnt(WORLD.enemySpawn,false);
  ai=new AI.Agent(S.difficulty);
  ai.reset(E);
  PLAN.clear();
  SCENE.tracers.length=0; SCENE.screenBlips.length=0; SCENE.roomFx.length=0;
  detectors.length=0;
  S.roundT=RULE.ROUND_TIME; S.countdown=4.6; S.phase='countdown';
  S.hurtFlash=0; S.shake=0; S.hitFeedback=0; S.msg=null; S.hint=null;
  lastCountInt=99;
  GL.env.hurt=0;
  GL.cnv.requestPointerLock();
  S.openingHintPending=true;
}
function toMenu(){
  S.phase='menu';
  document.exitPointerLock&&document.exitPointerLock();
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
}
function restart(){ startRound(); }
let paused=false;
function togglePause(){
  if(S.phase==='play'||S.phase==='countdown') setPause(!paused);
  else if(S.phase==='over') toMenu();
}
function setPause(v){
  paused=v;
  document.getElementById('pause').classList.toggle('hidden',!v);
  if(v) document.exitPointerLock&&document.exitPointerLock();
  else GL.cnv.requestPointerLock();
}

/* ---------------- 射击 ---------------- */
const detectors=[];   // 场上侦测器
let detectorArmed=false;

function toggleDetector(){
  if(S.phase!=='play') return;
  if(P.detCd>0){ showHint(`侦测器充能中 ${P.detCd.toFixed(1)}s`,1.2); return; }
  detectorArmed=!detectorArmed;
  SFX.detectorSnd();
}
function manualReload(){
  if(S.phase!=='play') return;
  if(P.reloading||P.ammo>=RULE.AMMO_MAX) return;
  P.reloading=true; P.reloadT=RULE.RELOAD_FULL*0.75;
}
function aimPoint(ent){
  // 玩家视线与巨幕的交点 → 对面房间坐标
  const dir=lookDir(ent);
  const hit=SCENE.raycastScreen(ent.x, eyeY(ent), ent.z, dir[0],dir[1],dir[2]);
  if(!hit) return null;
  const u=hit.u, v=hit.v;
  const w=SCENE.screenUV2world(u,v);
  return {u,v, x:w.x, z:w.z, inside:w.inside && hit.onScreen, sx:hit.x, sy:hit.y};
}
function tryFire(){
  if(S.phase!=='play') return;
  const a=aimPoint(P);
  if(detectorArmed){
    if(!a||!a.inside){ showHint('把准星对准巨幕范围内',1.2); return; }
    throwDetector(P,a.x,a.z,true);
    detectorArmed=false;
    return;
  }
  if(P.reloading){ return; }
  if(P.cool>0) return;
  if(P.ammo<=0){ P.reloading=true; P.reloadT=RULE.RELOAD_FULL; SFX.tick(); return; }
  if(!a||!a.inside){ showHint('准星要落在巨幕上',1.1); return; }
  doFire(P,E,a.x,a.z,true);
}

function doFire(shooter,target,tx,tz,isPlayer){
  shooter.ammo--; shooter.cool=RULE.RELOAD; shooter.shots++;
  if(shooter.ammo<=0){ shooter.reloading=true; shooter.reloadT=RULE.RELOAD_FULL; }

  const d=U.dist(tx,tz,target.x,target.z);
  let dmg=0, grade='miss';
  if(d<=RULE.HIT_CORE_R){ dmg=RULE.DMG_CORE; grade='core'; }
  else if(d<=RULE.HIT_EDGE_R){
    const k=1-(d-RULE.HIT_CORE_R)/(RULE.HIT_EDGE_R-RULE.HIT_CORE_R);
    dmg=Math.round(RULE.DMG_EDGE*(0.55+0.45*k)); grade='edge';
  }

  if(isPlayer){
    /* —— 玩家开火 —— */
    SFX.shoot();
    S.shake=Math.max(S.shake,0.9); S.shakeT=0.16;
    // 枪口特效
    const dir=lookDir(P);
    const mx=P.x+dir[0]*0.45, my=eyeY(P)-0.16+dir[1]*0.45, mz=P.z+dir[2]*0.45;
    SCENE.burstSparks(mx,my,mz,10,[1.6,1.2,0.55],2.6);
    SCENE.smokePuff(mx,my,mz,4);
    // 弹道:从枪口打到巨幕
    const a=aimPoint(P);
    if(a) SCENE.addTracer(mx,my,mz, a.sx, a.sy, SCENE.SCREEN_Z+0.01,[1.7,1.35,0.7]);
    // 巨幕上留下我的弹着标记
    PLAN.add(PLAN.MARK.IMPACT, tx, tz, {life:1.5, rad:RULE.HIT_EDGE_R});
    const sp=SCENE.world2screen(tx,tz);
    SCENE.addBlip(sp.x,sp.y,[1.1,1.9,2.4],1.0);
    // 让 AI 知道我开火了 —— 我的位置会亮在它的屏幕上
    ai.onPlayerFire(P.x,P.z, tx,tz, E);
    const cd=coordStr(tx,tz);
    if(dmg>0){
      target.hp=Math.max(0,target.hp-dmg); P.hits++; P.dmgDealt+=dmg;
      target.hurtBoost=RULE.HURT_BOOST_TIME;
      ai.onSelfHit();
      PLAN.add(PLAN.MARK.HIT, tx,tz,{life:1.7});
      SCENE.addBlip(sp.x,sp.y,[2.4,1.0,0.7],1.7);
      SFX.hit();
      S.hitFeedback=1;
      showMsg(grade==='core'?'直 击':'擦 伤', grade==='core'?'#9fe4ff':'#ffd08a');
      PLAN.pushLog(`${cd} ${grade==='core'?'直击':'擦伤'} -${dmg}`, 'me');
      if(target.hp<=0) endRound('win');
    }else{
      ai.brain.observeEmpty(tx,tz,1.3,0.42);
      PLAN.pushLog(`${cd} 打空`, 'i');
    }
  }else{
    /* —— AI 开火 —— */
    E.shots++;
    // 我的屏幕上出现它的开火闪光
    PLAN.add(PLAN.MARK.FLASH, E.x, E.z, {life:RULE.FLASH_LIFE});
    // 房间内:子弹落到我这边的对应位置
    SCENE.addRoomFx(tx,tz,'impact',1);
    const dd=U.dist(tx,tz,P.x,P.z);
    // 远近声音
    if(dd<3.4){ SFX.shotNear(); } else { SFX.nearmiss(); }
    SCENE.burstSparks(tx,0.12,tz,16,[1.6,0.85,0.5],3.2);
    SCENE.smokePuff(tx,0.2,tz,5);
    if(dmg>0){
      P.hp=Math.max(0,P.hp-dmg); E.hits++; E.dmgDealt+=dmg; P.dmgTaken+=dmg;
      P.hurtBoost=RULE.HURT_BOOST_TIME;
      S.hurtFlash=1; S.shake=Math.max(S.shake,1.5); S.shakeT=0.34;
      S.dmgDir=Math.atan2(tx-P.x, tz-P.z);
      SFX.hurt();
      showMsg(grade==='core'?'受到直击!':'被擦伤','#ff7a68');
      PLAN.pushLog(`他命中了你 -${dmg}`, 'hit');
      ai.onOwnShotHit(tx,tz);
      if(P.hp<=0) endRound('lose');
    }else{
      ai.onOwnShotMiss(tx,tz);
      if(dd<2.6){
        S.hurtFlash=Math.max(S.hurtFlash,0.35); S.shake=Math.max(S.shake,0.7); S.shakeT=0.2;
        showMsg('险些命中','#ffb454');
        PLAN.pushLog(`他打在你身边 ${dd.toFixed(1)}m`, 'warn');
      }else{
        PLAN.pushLog('他开了一枪 · 没打中', 'i');
      }
    }
  }
}

function throwDetector(owner,tx,tz,isPlayer){
  if(isPlayer){
    if(P.detCd>0) return;
    P.detCd=RULE.DET_COOLDOWN; P.detUsed++;
  }
  detectors.push({x:tx,z:tz,t:0,life:1.75,owner:isPlayer?'p':'e',resolved:false});
  SFX.detectorSnd();
  if(isPlayer){
    PLAN.add(PLAN.MARK.SCAN, tx, tz, {life:1.75, rad:RULE.DET_RAD});
  }else{
    // AI 的侦测器落在我的房间里 → 我能"看到"一个扫描光柱
    SCENE.addRoomFx(tx,tz,'scan',RULE.DET_RAD);
  }
}
function resolveDetector(d){
  d.resolved=true;
  const target = d.owner==='p' ? E : P;
  const inside = Math.abs(target.x-d.x)<RULE.DET_RAD && Math.abs(target.z-d.z)<RULE.DET_RAD;
  if(d.owner==='p'){
    // 更新我屏幕上那个 SCAN 标记的结果
    for(let i=PLAN.marks.length-1;i>=0;i--){
      const m=PLAN.marks[i];
      if(m.type===PLAN.MARK.SCAN && Math.abs(m.x-d.x)<0.01 && Math.abs(m.z-d.z)<0.01){ m.result=inside; break; }
    }
    if(inside){
      // 显示目标最近 DET_TRAIL 秒的轨迹
      const path=target.hist.filter(h=>h.t>=0).slice(-14).map(h=>[h.x,h.z]);
      PLAN.add(PLAN.MARK.SCANHIT, target.x, target.z, {life:2.4, path});
      SFX.detected();
      P.detHits++;
      showMsg('侦测到目标','#6effc4');
      PLAN.pushLog(`侦测 ${coordStr(d.x,d.z)} 有人!`, 'ok');
    }else{
      showMsg('区域为空','#7f97b8');
      PLAN.pushLog(`侦测 ${coordStr(d.x,d.z)} 空`, 'i');
    }
  }else{
    const path=inside? P.hist.slice(-14).map(h=>[h.x,h.z]) : null;
    ai.onDetectorResult(d.x,d.z,RULE.DET_RAD,inside, path? path[path.length-1]:null);
    if(inside){ showHint('侦测器扫到了你 —— 快离开这里',2.4); SFX.detected();
                PLAN.pushLog('他的侦测器扫到了你','hit'); }
  }
}

/* ---------------- 玩家运动 ---------------- */
function eyeY(e){ return 1.62 + Math.sin(e.bob)*0.045; }
function lookDir(e){
  const cp=Math.cos(e.pitch);
  return [ Math.sin(e.yaw)*cp, Math.sin(e.pitch), -Math.cos(e.yaw)*cp ];
}
function updatePlayer(dt){
  // 瞄准镜过渡:按住右键放大巨幕,便于读坐标、精细瞄准
  const adsWant = IN.ads && !P.sprinting ? 1 : 0;
  adsK += (adsWant-adsK)*Math.min(1, dt*11);
  // 视角(瞄准时灵敏度降低,便于微调)
  const s=0.0022*S.sens*U.lerp(1, 0.42, adsK);
  P.yaw += IN.mdx*s;
  P.pitch = U.clamp(P.pitch - IN.mdy*s, -1.15, 1.05);
  IN.mdx=0; IN.mdy=0;
  // 移动
  let fx=Math.sin(P.yaw), fz=-Math.cos(P.yaw);
  let rx=-fz, rz=fx;
  let mx=(IN.f-IN.b)*fx + (IN.r-IN.l)*rx;
  let mz=(IN.f-IN.b)*fz + (IN.r-IN.l)*rz;
  const ml=Math.hypot(mx,mz);
  const moving=ml>0.01;
  let spd = IN.sprint? RULE.SPRINT : RULE.WALK;
  if(P.hurtBoost>0) spd*=RULE.HURT_SPRINT_BOOST;
  if(adsK>0.15) spd*=U.lerp(1,0.55,adsK);      // 瞄准时移动变慢
  P.sprinting = IN.sprint && moving && adsK<0.5;
  if(moving){
    mx/=ml; mz/=ml;
    const nx=P.x+mx*spd*dt, nz=P.z+mz*spd*dt;
    const [cx,cz]=COLL.resolve(nx,nz,RULE.PLAYER_R);
    P.moved+=U.dist(P.x,P.z,cx,cz);
    P.vx=(cx-P.x)/dt; P.vz=(cz-P.z)/dt;
    P.x=cx; P.z=cz;
    P.bob+=dt*(P.sprinting?15:10.5);
    // 脚步
    P.stepT-=dt*(P.sprinting?1.55:1);
    if(P.stepT<=0){ P.stepT=0.44; P.sprinting?SFX.sprint():SFX.step(); }
  }else{
    P.vx*=0.8; P.vz*=0.8;
    P.bob+=dt*1.4;
  }
  leaveTrail(P,dt,moving);
  recordHist(P,dt);
  updateHeat(P,dt);
}
function leaveTrail(ent,dt,moving){
  ent.trailT-=dt;
  if(ent.trailT<=0){
    const mult = ent.sprinting? RULE.TRAIL_SPRINT_MUL : (moving?1:0.28);
    ent.trailT = RULE.TRAIL_INTERVAL * (ent.sprinting?0.62:1);
    if(ent.isPlayer){
      // 我的移动被 AI 看到(弱证据)
      if(moving){
        ai.onPlayerTrail(ent.x,ent.z, mult*0.85);
        ai.noteTrailDir(ent.vx,ent.vz);
      }
    }else{
      // AI 的移动出现在我的屏幕上
      if(moving){
        PLAN.add(PLAN.MARK.TRAIL, ent.x, ent.z,
          {life:RULE.TRAIL_LIFE*(ent.sprinting?1.25:0.9),
           strong: ent.sprinting?1.25:0.72,
           dx:ent.vx*0.34, dz:ent.vz*0.34});
      }
    }
  }
}
function recordHist(ent,dt){
  ent.histT-=dt;
  if(ent.histT<=0){ ent.histT=0.16; ent.hist.push({x:ent.x,z:ent.z,t:S.t});
    if(ent.hist.length>28) ent.hist.shift(); }
}

/* ---------------- 体温显影 ----------------
   站着不动 → 热度累积 → 在对方屏幕上烧出一团越来越亮、越来越准的热痕。
   玩家和 AI 走同一套规则。 */
function updateHeat(ent,dt){
  const drift=U.dist(ent.x,ent.z, ent.anchorX,ent.anchorZ);
  if(drift > RULE.HEAT_MOVE_RESET){
    // 真的挪窝了 → 重置锚点,热度快速消退
    ent.anchorX=ent.x; ent.anchorZ=ent.z;
    ent.stillT=0;
    ent.heat=Math.max(0, ent.heat - dt*RULE.HEAT_COOL_RATE/RULE.HEAT_FULL);
  }else{
    ent.stillT+=dt;
    const over=ent.stillT-RULE.HEAT_DELAY;
    ent.heat = over<=0 ? Math.max(0,ent.heat-dt*0.35/RULE.HEAT_FULL)
                       : U.clamp(over/(RULE.HEAT_FULL-RULE.HEAT_DELAY),0,1);
  }
  if(ent.heat<=0.02) return;

  // 热度足够 → 周期性向对手投放证据
  ent.heatEmitT=(ent.heatEmitT||0)-dt;
  if(ent.heatEmitT<=0){
    ent.heatEmitT = U.lerp(1.15, 0.42, ent.heat);   // 越热越频繁
    const spread = U.lerp(RULE.HEAT_SPREAD_MAX, RULE.HEAT_SPREAD_MIN, ent.heat);
    if(ent.isPlayer){
      // 我的体温被 AI 读到
      ai.onHeatSignature(ent.x, ent.z, spread, ent.heat);
    }else{
      // AI 的体温出现在我的巨幕上
      PLAN.add(PLAN.MARK.HEAT, ent.x+U.rand(-spread,spread)*0.34,
                               ent.z+U.rand(-spread,spread)*0.34,
        {life:1.5, heat:ent.heat, rad:spread});
    }
  }
}

/* ---------------- AI 更新 ---------------- */
function updateAI(dt){
  E.cool=Math.max(0,E.cool-dt);
  if(E.reloading){ E.reloadT-=dt; if(E.reloadT<=0){ E.reloading=false; E.ammo=RULE.AMMO_MAX; } }
  E.detCd=Math.max(0,E.detCd-dt);
  E.hurtBoost=Math.max(0,E.hurtBoost-dt);
  const before={x:E.x,z:E.z};
  const api={
    time:S.t,
    walkSpeed:RULE.WALK, sprintSpeed:RULE.SPRINT*(E.hurtBoost>0?RULE.HURT_SPRINT_BOOST:1),
    canFire: E.cool<=0 && !E.reloading && E.ammo>0,
    detectorReady: E.detCd<=0,
    move(dx,dz,sprint){
      const [cx,cz]=COLL.resolve(E.x+dx, E.z+dz, RULE.PLAYER_R);
      E.vx=(cx-E.x)/Math.max(dt,1e-4); E.vz=(cz-E.z)/Math.max(dt,1e-4);
      E.x=cx; E.z=cz; E.sprinting=!!sprint;
      E.bob+=Math.hypot(dx,dz)*3.2;
    },
    fire(tx,tz){ doFire(E,P,tx,tz,false); },
    throwDetector(tx,tz){ E.detCd=RULE.DET_COOLDOWN; E.detUsed++; throwDetector(E,tx,tz,false); },
  };
  ai.update(dt,E,api);
  const movedD=U.dist(before.x,before.z,E.x,E.z);
  E.moved+=movedD;
  leaveTrail(E,dt, movedD>0.002);
  recordHist(E,dt);
  updateHeat(E,dt);
  // 脚步声:AI 距离我"对应位置"很近时,给一点模糊提示(镜像空间的心理暗示)
  E.stepT-=dt;
  if(E.stepT<=0 && movedD>0.002){
    E.stepT= E.sprinting?0.30:0.46;
    // 只有疾跑才会在我屏幕上多留一个模糊波纹
    if(E.sprinting && Math.random()<0.45){
      PLAN.add(PLAN.MARK.PING, E.x+U.rand(-1.3,1.3), E.z+U.rand(-1.3,1.3), {life:1.3});
    }
  }
}

/* ---------------- 结算 ---------------- */
function endRound(result){
  if(S.phase==='over') return;
  S.phase='over'; S.result=result;
  document.exitPointerLock&&document.exitPointerLock();
  if(result==='win'){ S.tally.win++; SFX.kill(); setTimeout(()=>SFX.win(),340); }
  else if(result==='lose'){ S.tally.lose++; SFX.death(); setTimeout(()=>SFX.lose(),400); }
  else { S.tally.draw++; SFX.lose(); }
  setTimeout(showEndPanel, 900);
}
function showEndPanel(){
  const $=id=>document.getElementById(id);
  const big=$('endBig'), sub=$('endSub');
  big.className='big '+(S.result==='win'?'win':S.result==='lose'?'lose':'draw');
  if(S.result==='win'){ big.textContent='胜 利'; sub.textContent=`你把 ${AI.PRESETS[S.difficulty].name} 从那间房里挖了出来`; }
  else if(S.result==='lose'){ big.textContent='阵 亡'; sub.textContent='他一直知道你在哪 —— 你开火太多次了'; }
  else { big.textContent='平 局'; sub.textContent= `时间到 · 你 ${P.hp} HP  vs  他 ${E.hp} HP`; }
  const acc = P.shots? Math.round(P.hits/P.shots*100):0;
  $('endStats').innerHTML=`
    <div><div class="n">${P.hp>0?P.hp:0}</div><div class="l">剩余生命</div></div>
    <div><div class="n">${P.hits}/${P.shots}</div><div class="l">命中 / 开火</div></div>
    <div><div class="n">${acc}%</div><div class="l">猜中率</div></div>
    <div><div class="n">${P.dmgDealt}</div><div class="l">造成伤害</div></div>`;
  $('endTally').innerHTML=`本次会话战绩 &nbsp; <b>${S.tally.win}</b> 胜 &nbsp; <b>${S.tally.lose}</b> 负 &nbsp; <b>${S.tally.draw}</b> 平 &nbsp;·&nbsp; 对手:${AI.PRESETS[S.difficulty].name}`;
  $('end').classList.remove('hidden');
}

/* ---------------- 暴露风险 ----------------
   把 AI 的信念状态翻译成玩家看得懂的一个 0~1 数字:
   "他现在有多确定你在哪"。这是让博弈可读的关键 —— 玩家能感觉到
   自己开枪之后风险条冲高,于是学会"打完就换位置"。*/
function exposureRisk(){
  if(!ai||!P) return 0;
  const pk=ai.beliefPeak();
  const err=U.dist(pk.x,pk.z, P.x,P.z);         // 它猜得准不准
  const sharp=U.clamp((pk.sharp-1)/13,0,1);      // 它有多确定
  const near=U.clamp(1-err/7.5,0,1);             // 猜的点离我多近
  return U.clamp(sharp*0.45 + near*sharp*0.75, 0, 1);
}

/* ---------------- 提示 ---------------- */
/* 世界坐标 → 玩家读得懂的图纸坐标(左上角为原点,与巨幕刻度一致) */
function coordStr(x,z){ return `(${(x+WORLD.W/2).toFixed(1)}, ${(z+WORLD.D/2).toFixed(1)})`; }
function showMsg(text,color){ S.msg={text,color:color||'#cfe6ff'}; S.msgT=1.5; }
function showHint(text,dur){ S.hint=text; S.hintT=dur||2.5; }

/* ---------------- 主循环 ---------------- */
let last=0, lastCountInt=99;
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min(0.05,(ts-last)/1000||0); last=ts;
  S.dt=dt;
  if(S.phase!=='menu') S.t+=dt;

  if(!paused){
    if(S.phase==='countdown'){
      S.countdown-=dt;
      const ci=Math.ceil(S.countdown);
      if(ci!==lastCountInt && ci>=0){ lastCountInt=ci; SFX.countdown(ci); }
      if(S.countdown<=0){
        S.phase='play';
        if(S.openingHintPending){
          S.openingHintPending=false;
          showHint('先按住右键放大巨幕,找找他留下的痕迹',5.0);
        }
      }
      // 倒计时期间也允许转视角
      updateLookOnly(dt);
    }else if(S.phase==='play'){
      S.roundT-=dt;
      updatePlayer(dt);
      updateAI(dt);
      // 冷却
      P.cool=Math.max(0,P.cool-dt);
      P.detCd=Math.max(0,P.detCd-dt);
      P.hurtBoost=Math.max(0,P.hurtBoost-dt);
      if(P.reloading){ P.reloadT-=dt; if(P.reloadT<=0){ P.reloading=false; P.ammo=RULE.AMMO_MAX; SFX.tick(); } }
      // 侦测器结算
      for(let i=detectors.length-1;i>=0;i--){
        const d=detectors[i]; d.t+=dt;
        if(!d.resolved && d.t>0.85) resolveDetector(d);
        if(d.t>d.life) detectors.splice(i,1);
      }
      if(S.roundT<=0){
        S.roundT=0;
        if(P.hp>E.hp) endRound('win');
        else if(P.hp<E.hp) endRound('lose');
        else endRound('draw');
      }
      // 最后 10 秒滴答
      const ri=Math.ceil(S.roundT);
      if(ri<=10 && ri!==lastTick){ lastTick=ri; SFX.tick(); }
    }else if(S.phase==='over'){
      updateLookOnly(dt);
    }
  }

  // 特效时间推进
  PLAN.update(dt);
  SCENE.updateParticles(dt);
  advanceFx(dt);
  S.hurtFlash=Math.max(0,S.hurtFlash-dt*1.7);
  S.hitFeedback=Math.max(0,S.hitFeedback-dt*2.2);
  S.msgT=Math.max(0,S.msgT-dt);
  S.hintT=Math.max(0,S.hintT-dt);
  S.shakeT=Math.max(0,S.shakeT-dt);
  if(S.shakeT<=0) S.shake*=Math.pow(0.02,dt);

  GL.env.hurt = S.hurtFlash*0.5;

  renderFrame(dt);
  drawHUD();
}
let lastTick=99;
function updateLookOnly(dt){
  if(!P) return;
  const s=0.0022*S.sens;
  P.yaw += IN.mdx*s;
  P.pitch=U.clamp(P.pitch - IN.mdy*s, -1.15,1.05);
  IN.mdx=0; IN.mdy=0;
}
function advanceFx(dt){
  for(let i=SCENE.tracers.length-1;i>=0;i--){ const t=SCENE.tracers[i]; t.t+=dt; if(t.t>t.life) SCENE.tracers.splice(i,1); }
  for(let i=SCENE.screenBlips.length-1;i>=0;i--){ const b=SCENE.screenBlips[i]; b.t+=dt; if(b.t>b.life) SCENE.screenBlips.splice(i,1); }
  for(let i=SCENE.roomFx.length-1;i>=0;i--){ const f=SCENE.roomFx[i]; f.t+=dt; if(f.t>f.life) SCENE.roomFx.splice(i,1); }
}

/* ---------------- 3D 渲染 ---------------- */
function renderFrame(dt){
  if(!P){ renderIdleCam(dt); return; }
  // 巨幕贴图更新
  const a=aimPoint(P);
  GL.texUpdate(SCENE.T.plan, PLAN.draw({
    aim: (a&&a.inside)? a : null,
    aimRad: RULE.HIT_EDGE_R,
    detRad: RULE.DET_RAD,
    ready: P.cool<=0 && !P.reloading && P.ammo>0,
    detectorArmed,
    time:S.t,
    hp:P.hp, ehp:E.hp,
    ammo:P.ammo, ammoMax:RULE.AMMO_MAX,
    detK: P.detCd<=0?1:1-P.detCd/RULE.DET_COOLDOWN, detCd:P.detCd,
    shots:P.shots, hits:P.hits,
    risk: exposureRisk(),
    roundT:S.roundT,
  }));

  // 摄像机
  const sh=S.shake;
  const shx=Math.sin(S.t*74)*sh*0.028 + Math.sin(S.t*53)*sh*0.017;
  const shy=Math.cos(S.t*67)*sh*0.024;
  const ey=eyeY(P)+shy;
  const dir=lookDir(P);
  const cam={ x:P.x+shx, y:ey, z:P.z,
              tx:P.x+shx+dir[0], ty:ey+dir[1], tz:P.z+dir[2],
              fov: U.lerp(1.10 + (P.sprinting?0.045:0) + sh*0.02, 0.62, adsK) };

  buildDynamic(cam,dir);
  GL.render(cam, {
    opaque:[SCENE.B.floor, SCENE.B.ceil, SCENE.B.room, SCENE.B.crate, SCENE.B.panelB, SCENE.B.frame, SCENE.B.trim, SCENE.B.trimRed, SCENE.B.lamp],
    cutout:[SCENE.B.rack, SCENE.B.drum],
    alpha:[SCENE.planBatch],
    add:[SCENE.DB.add, SCENE.DB.addC, SCENE.DB.addR, SCENE.DB.addG, SCENE.DB.dot],
  });
  // 枪(单独一遍,近裁剪面内)
  drawViewModel(cam,dir,dt);
}
function renderIdleCam(dt){
  // 菜单背景:缓慢巡游的房间镜头
  const t=S.t*0.12;
  GL.texUpdate(SCENE.T.plan, PLAN.draw({
    aim:null, time:S.t, hp:100, ehp:100, ammo:5, ammoMax:5,
    detK:1, detCd:0, shots:0, hits:0, risk:0, roundT:120, ready:true,
  }));
  const r=5.4;
  const cam={ x:Math.sin(t)*r*0.6, y:2.05+Math.sin(t*0.7)*0.25, z:3.2+Math.cos(t)*r*0.4,
              tx:Math.sin(t+0.4)*1.2, ty:2.0, tz:-7.4, fov:1.02 };
  buildDynamic(cam,[0,0,-1]);
  GL.render(cam,{
    opaque:[SCENE.B.floor, SCENE.B.ceil, SCENE.B.room, SCENE.B.crate, SCENE.B.panelB, SCENE.B.frame, SCENE.B.trim, SCENE.B.trimRed, SCENE.B.lamp],
    cutout:[SCENE.B.rack, SCENE.B.drum],
    alpha:[SCENE.planBatch],
    add:[SCENE.DB.add, SCENE.DB.addC, SCENE.DB.addR, SCENE.DB.addG, SCENE.DB.dot],
  });
}

/* 动态几何:粒子、弹道、房间光效、屏幕光斑 */
function buildDynamic(cam,dir){
  const D=SCENE.DB;
  for(const k in D) D[k].clear();
  // 摄像机基向量(公告板)
  const fx=cam.tx-cam.x, fy=cam.ty-cam.y, fz=cam.tz-cam.z;
  const fl=Math.hypot(fx,fy,fz)||1;
  const f=[fx/fl,fy/fl,fz/fl];
  let right=[ f[2], 0, -f[0] ];
  const rl=Math.hypot(right[0],right[2])||1; right=[right[0]/rl,0,right[2]/rl];
  const up=[ right[1]*f[2]-right[2]*f[1], right[2]*f[0]-right[0]*f[2], right[0]*f[1]-right[1]*f[0] ];
  const upl=Math.hypot(up[0],up[1],up[2])||1;
  const U3=[up[0]/upl,up[1]/upl,up[2]/upl];

  /* 粒子 */
  for(let i=0;i<SCENE.pn;i++){
    const l=SCENE.P.life[i]; if(l<=0) continue;
    const k=l/SCENE.P.max[i];
    const kind=SCENE.P.kind[i];
    const sz=SCENE.P.size[i]*(kind===2? (2.2-k*1.1) : k*0.9+0.35);
    const col=[SCENE.P.r[i],SCENE.P.g[i],SCENE.P.b[i], kind===2? k*0.30 : k];
    const b = kind===2 ? D.dot : D.add;
    b.billboard(SCENE.P.x[i],SCENE.P.y[i],SCENE.P.z[i], sz*(kind===2?7:5), sz*(kind===2?7:5),
                right,U3,col);
  }
  /* 弹道 */
  for(const t of SCENE.tracers){
    const k=1-t.t/t.life;
    const steps=9;
    for(let i=0;i<=steps;i++){
      const s=i/steps;
      const x=U.lerp(t.ax,t.bx,s), y=U.lerp(t.ay,t.by,s), z=U.lerp(t.az,t.bz,s);
      const w=0.075*k*(1.15-s*0.35);
      D.add.billboard(x,y,z, w*6, w*6, right,U3, [t.col[0],t.col[1],t.col[2], k*0.85*(1-s*0.25)]);
    }
  }
  /* 屏幕命中光斑(贴在巨幕表面) */
  for(const b of SCENE.screenBlips){
    const k=1-b.t/b.life;
    const s=b.size*(0.5+ (1-k)*1.5);
    const col=[b.col[0],b.col[1],b.col[2], k*0.9];
    D.add.quad(
      [b.x-s, b.y-s, SCENE.SCREEN_Z+0.012],[b.x+s, b.y-s, SCENE.SCREEN_Z+0.012],
      [b.x+s, b.y+s, SCENE.SCREEN_Z+0.012],[b.x-s, b.y+s, SCENE.SCREEN_Z+0.012],
      0,0,1,1, 0,0,1, col);
  }
  /* 房间内立体光效(敌方弹着 / 侦测器扫描) */
  for(const fx2 of SCENE.roomFx){
    const k=1-fx2.t/fx2.life;
    if(fx2.type==='impact'){
      // 地面冲击环 + 上冲光柱
      const r=0.5+(1-k)*2.6;
      D.addR.ground(fx2.x,fx2.z, r*2.4, 0.035, [2.2,0.8,0.5, k*0.55]);
      const hgt=(1-k)*2.4+0.4;
      for(let i=0;i<6;i++){
        const y=0.1+ i/6*hgt;
        const w=(1-i/6)*0.85*(0.4+k*0.9);
        D.add.billboard(fx2.x, y, fx2.z, w*2.2, w*2.2, right,U3, [2.0,1.0,0.55, k*k*0.5]);
      }
    }else if(fx2.type==='scan'){
      const R=fx2.rad;
      const pulse=(fx2.t*1.6)%1;
      D.addG.ground(fx2.x,fx2.z, R*2.1, 0.03, [0.5,2.2,1.6, k*0.30]);
      // 四角柱
      for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        for(let i=0;i<5;i++){
          const y=0.12+i*0.36;
          D.addG.billboard(fx2.x+sx*R, y, fx2.z+sz*R, 0.30,0.30, right,U3,[0.55,2.4,1.8, k*0.55*(1-i/6)]);
        }
      }
      // 扫描面
      D.addG.ground(fx2.x,fx2.z, R*2, 0.08+pulse*1.7, [0.6,2.4,1.9, k*0.16]);
    }
  }
  /* 巨幕自身的整体辉光(打在墙上的溢光) */
  {
    const glowK=0.42+Math.sin(S.t*0.9)*0.03;
    D.addC.quad(
      [-SCENE.SCR_W/2, SCENE.SCR_Y0, SCENE.SCREEN_Z+0.006],
      [ SCENE.SCR_W/2, SCENE.SCR_Y0, SCENE.SCREEN_Z+0.006],
      [ SCENE.SCR_W/2, SCENE.SCR_Y0+SCENE.SCR_H, SCENE.SCREEN_Z+0.006],
      [-SCENE.SCR_W/2, SCENE.SCR_Y0+SCENE.SCR_H, SCENE.SCREEN_Z+0.006],
      0,0,1,1, 0,0,1, [0.35,0.72,1.0, glowK*0.09]);
  }
  /* 天花灯的柔光晕(与着色器光池、灯具几何三者位置一致) */
  for(let i=-1;i<=1;i++){
    for(let j=-1;j<=1;j++){
      D.add.ground(j*5.2, i*4.6, 3.4, WORLD.H-0.28, [1.0,0.96,0.88, 0.10]);
    }
  }
}

/* 第一人称枪械视图模型:面向摄像机的贴图片,锚在右下角 */
function drawViewModel(cam,dir,dt){
  const gl=GL.gl;
  const D=SCENE.DB.gun;
  D.clear();
  const bob = P? P.bob : 0;
  const sway  = Math.sin(bob)*0.010;
  const swayY = Math.cos(bob*2)*0.008;
  const kick  = P? U.clamp(P.cool/RULE.RELOAD,0,1) : 0;
  const recoil= Math.pow(kick,2.6)*0.075;
  const reloadDip = (P&&P.reloading)
      ? Math.sin(U.clamp(1-P.reloadT/RULE.RELOAD_FULL,0,1)*Math.PI)*0.13 : 0;

  /* 摄像机正交基 */
  const f=[cam.tx-cam.x, cam.ty-cam.y, cam.tz-cam.z];
  const fl=Math.hypot(f[0],f[1],f[2])||1; f[0]/=fl; f[1]/=fl; f[2]/=fl;
  // right = normalize(f × up),up=(0,1,0)
  let r=[-f[2], 0, f[0]];
  const rl=Math.hypot(r[0],r[2])||1; r[0]/=rl; r[2]/=rl;
  // up = right × f
  const u=[ r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0] ];
  const ul=Math.hypot(u[0],u[1],u[2])||1; u[0]/=ul; u[1]/=ul; u[2]/=ul;

  /* 按视口比例定尺寸:让枪稳定占据画面右下,与分辨率无关。
     瞄准时枪往下沉出画面 —— 让位给巨幕。*/
  const dist=0.42;
  const halfH_at = dist*Math.tan(cam.fov/2);
  const H2 = halfH_at*0.44;
  const W2 = H2;
  const aspect = GL.W()/GL.H();
  const halfW_at = halfH_at*aspect;
  const adsDrop = adsK*halfH_at*1.5;
  const ox =  halfW_at*0.50 + sway;
  const oy = -halfH_at*0.76 + swayY - reloadDip - adsDrop;
  const oz =  dist - recoil;

  const cx=cam.x + r[0]*ox + u[0]*oy + f[0]*oz;
  const cy=cam.y + r[1]*ox + u[1]*oy + f[1]*oz;
  const cz=cam.z + r[2]*ox + u[2]*oy + f[2]*oz;

  /* 后坐时枪口上抬 */
  const tilt=0.13 + recoil*2.6;
  const uu=[u[0]*Math.cos(tilt)+f[0]*Math.sin(tilt),
            u[1]*Math.cos(tilt)+f[1]*Math.sin(tilt),
            u[2]*Math.cos(tilt)+f[2]*Math.sin(tilt)];
  const A =[cx-r[0]*W2-uu[0]*H2, cy-r[1]*W2-uu[1]*H2, cz-r[2]*W2-uu[2]*H2];
  const Bv=[cx+r[0]*W2-uu[0]*H2, cy+r[1]*W2-uu[1]*H2, cz+r[2]*W2-uu[2]*H2];
  const C =[cx+r[0]*W2+uu[0]*H2, cy+r[1]*W2+uu[1]*H2, cz+r[2]*W2+uu[2]*H2];
  const Dv=[cx-r[0]*W2+uu[0]*H2, cy-r[1]*W2+uu[1]*H2, cz-r[2]*W2+uu[2]*H2];
  D.quad(A,Bv,C,Dv, 0,0, 1,1, 0,0,1, [1,1,1,1]);
  D.upload();
  if(!D.n) return;

  /* 单独一遍绘制:清深度,枪永远在最前 */
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const proj=M4.persp(cam.fov, aspect, 0.02, 10);
  const view=M4.lookAt(cam.x,cam.y,cam.z, cam.tx,cam.ty,cam.tz);
  const mvp=M4.mul(proj,view);
  gl.useProgram(GL.__flat.p);
  gl.uniformMatrix4fv(GL.__flat.u.uMVP,false,mvp);
  if(GL.__flat.u.uHurt) gl.uniform1f(GL.__flat.u.uHurt, GL.env.hurt);
  if(GL.__flat.u.uEye)  gl.uniform3f(GL.__flat.u.uEye, cam.x,cam.y,cam.z);
  if(GL.__flat.u.uFogK) gl.uniform1f(GL.__flat.u.uFogK, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  gl.bindBuffer(gl.ARRAY_BUFFER,D.buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,48,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,48,12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,48,20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,48,32);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, SCENE.T.gun.tex);
  gl.uniform1i(GL.__flat.u.uTx,0);
  gl.drawArrays(gl.TRIANGLES,0,D.n);
  gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
}

/* ---------------- HUD ---------------- */
function drawHUD(){
  const W=innerWidth, H=innerHeight;
  hx.clearRect(0,0,W,H);
  if(S.phase==='menu') return;

  /* 受击红边 */
  if(S.hurtFlash>0.01){
    const k=S.hurtFlash;
    const vg=hx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.22, W/2,H/2,Math.max(W,H)*0.72);
    vg.addColorStop(0,'rgba(255,40,30,0)');
    vg.addColorStop(0.6,`rgba(220,30,24,${k*0.30})`);
    vg.addColorStop(1,`rgba(255,55,40,${k*0.62})`);
    hx.fillStyle=vg; hx.fillRect(0,0,W,H);
    // 伤害来向指示
    if(P){
      const rel=S.dmgDir - P.yaw;
      const cx=W/2, cy=H/2, R=Math.min(W,H)*0.24;
      hx.save(); hx.translate(cx,cy); hx.rotate(rel);
      hx.beginPath();
      hx.moveTo(0,-R); hx.lineTo(-26,-R-30); hx.lineTo(26,-R-30); hx.closePath();
      hx.fillStyle=`rgba(255,80,60,${k*0.85})`; hx.fill();
      hx.restore();
    }
  }
  /* 低血量脉动 */
  if(P&&P.hp<=35&&P.hp>0&&S.phase==='play'){
    const p=(Math.sin(S.t*4.6)*0.5+0.5)*(1-P.hp/35);
    const vg=hx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.7);
    vg.addColorStop(0,'rgba(255,0,0,0)'); vg.addColorStop(1,`rgba(200,20,15,${p*0.32})`);
    hx.fillStyle=vg; hx.fillRect(0,0,W,H);
  }
  /* 体温显影:画面边缘泛起暖红 —— 你正在被"烧"出来 */
  if(P&&P.heat>0.15&&S.phase==='play'){
    const k=(P.heat-0.15)/0.85;
    const br=1+Math.sin(S.t*2.4)*0.10;
    const vg=hx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.42,W/2,H/2,Math.max(W,H)*0.76);
    vg.addColorStop(0,'rgba(255,120,60,0)');
    vg.addColorStop(1,`rgba(255,${130-k*50|0},70,${k*0.24*br})`);
    hx.fillStyle=vg; hx.fillRect(0,0,W,H);
  }
  /* 暗角 */
  {
    const vg=hx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.36,W/2,H/2,Math.max(W,H)*0.78);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.55)');
    hx.fillStyle=vg; hx.fillRect(0,0,W,H);
  }

  /* 瞄准镜:轻微暗角 + 边缘收束,强化"正在细看巨幕"的专注感 */
  if(adsK>0.02){
    const k=adsK;
    const vg=hx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.30,W/2,H/2,Math.max(W,H)*0.62);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,`rgba(0,0,0,${k*0.55})`);
    hx.fillStyle=vg; hx.fillRect(0,0,W,H);
    // 四角刻度线
    hx.strokeStyle=`rgba(140,215,255,${k*0.32})`; hx.lineWidth=1.4;
    const m=Math.min(W,H)*0.30, cx=W/2, cy=H/2;
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+Math.PI/4;
      hx.beginPath();
      hx.moveTo(cx+Math.cos(a)*m, cy+Math.sin(a)*m);
      hx.lineTo(cx+Math.cos(a)*m*1.5, cy+Math.sin(a)*m*1.5);
      hx.stroke();
    }
  }

  if(S.phase==='countdown'){ drawCountdown(W,H); }
  if(!P) return;

  drawCrosshair(W,H);
  drawTopBar(W,H);
  drawHealth(W,H);
  drawAmmo(W,H);
  drawMinimapSelf(W,H);
  drawMessages(W,H);
}

function drawCountdown(W,H){
  const n=Math.ceil(S.countdown);
  const frac=S.countdown-Math.floor(S.countdown);
  /* 三条规则,一行一条,跟着倒数逐条亮起 —— 30 秒内讲清整个游戏 */
  const RULES=[
    ['① 那块巨幕,是他房间的俯视图', '#9fe4ff'],
    ['② 朝你猜他在的位置开枪 —— 打的是地图上的坐标', '#ffd08a'],
    ['③ 但你开火的位置,也会亮在他的屏幕上', '#ff8a72'],
  ];
  hx.save();
  hx.textAlign='center'; hx.textBaseline='middle';

  // 数字
  const scale=1+(1-frac)*0.20;
  hx.save();
  hx.translate(W/2,H*0.30);
  hx.scale(scale,scale);
  hx.font='900 116px ui-monospace,Menlo,monospace';
  hx.fillStyle=`rgba(190,235,255,${U.clamp(frac*1.4,0,1)*0.95})`;
  hx.shadowColor='#6fd3ff'; hx.shadowBlur=36;
  hx.fillText(n>0?String(n):'开 始', 0,0);
  hx.restore();

  // 三条规则:随倒数依次点亮,底下垫一层暗板保证可读
  const shown = Math.floor((4.6-S.countdown)/1.15)+1;
  const boxW=Math.min(W*0.62, 720), boxH=RULES.length*34+56;
  const boxX=W/2-boxW/2, boxY=H*0.44;
  roundRect(hx, boxX, boxY, boxW, boxH, 12);
  hx.fillStyle='rgba(5,10,19,0.80)'; hx.fill();
  hx.strokeStyle='rgba(70,120,180,0.42)'; hx.lineWidth=1.4; hx.stroke();

  let y=boxY+30;
  for(let i=0;i<RULES.length;i++){
    const on = i < shown;
    hx.font=`${on?'700':'600'} ${on?17:16}px -apple-system,"PingFang SC",sans-serif`;
    hx.fillStyle = on? RULES[i][1] : 'rgba(120,145,175,0.42)';
    hx.globalAlpha = on? U.clamp((shown-i)*1.2,0,1) : 1;
    hx.fillText(RULES[i][0], W/2, y);
    y+=34;
  }
  hx.globalAlpha=1;
  hx.font='600 13px -apple-system,"PingFang SC",sans-serif';
  hx.fillStyle='rgba(150,180,215,0.6)';
  hx.fillText('WASD 移动 · 右键放大巨幕 · 左键开火 · Q 侦测器', W/2, y+8);
  hx.restore();
}

function drawCrosshair(W,H){
  const cx=W/2, cy=H/2;
  const ready = P.cool<=0 && !P.reloading && P.ammo>0;
  const a=aimPoint(P);
  const on = a&&a.inside;
  const col = detectorArmed? '110,255,215' : (on? (ready?'160,235,255':'255,150,110') : '150,165,190');
  const spread = 9 + (P.cool/RULE.RELOAD)*16 + (P.sprinting?7:0);
  hx.save();
  hx.strokeStyle=`rgba(${col},${on?0.95:0.4})`;
  hx.lineWidth=2; hx.lineCap='round';
  for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
    hx.beginPath();
    hx.moveTo(cx+dx*spread, cy+dy*spread);
    hx.lineTo(cx+dx*(spread+8), cy+dy*(spread+8));
    hx.stroke();
  }
  hx.fillStyle=`rgba(${col},${on?0.95:0.35})`;
  hx.beginPath(); hx.arc(cx,cy,1.7,0,U.TAU); hx.fill();
  // 命中反馈
  if(S.hitFeedback>0){
    const k=S.hitFeedback;
    hx.strokeStyle=`rgba(255,235,200,${k})`; hx.lineWidth=3.5;
    for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      hx.beginPath();
      hx.moveTo(cx+dx*11, cy+dy*11); hx.lineTo(cx+dx*23, cy+dy*23); hx.stroke();
    }
  }
  // 冷却环
  if(!ready && !P.reloading){
    const k=1-P.cool/RULE.RELOAD;
    hx.strokeStyle='rgba(255,170,120,0.55)'; hx.lineWidth=3;
    hx.beginPath(); hx.arc(cx,cy,30,-Math.PI/2, -Math.PI/2+k*U.TAU); hx.stroke();
  }
  if(P.reloading){
    const k=1-P.reloadT/RULE.RELOAD_FULL;
    hx.strokeStyle='rgba(130,200,255,0.75)'; hx.lineWidth=3.5;
    hx.beginPath(); hx.arc(cx,cy,34,-Math.PI/2,-Math.PI/2+k*U.TAU); hx.stroke();
    hx.font='600 12px -apple-system,sans-serif'; hx.textAlign='center';
    hx.fillStyle='rgba(160,210,255,0.85)'; hx.fillText('换弹', cx, cy+52);
  }
  // 侦测器模式
  if(detectorArmed){
    hx.font='700 13px -apple-system,sans-serif'; hx.textAlign='center';
    hx.fillStyle='rgba(120,255,215,0.9)';
    hx.fillText('侦测器已就绪 · 左键投放 · Q 取消', cx, cy+62);
  }
  hx.restore();
}

function drawTopBar(W,H){
  const cx=W/2;
  // 计时器
  const t=Math.max(0,S.roundT);
  const m=Math.floor(t/60), s=Math.floor(t%60);
  const urgent=t<=20;
  hx.save();
  hx.textAlign='center'; hx.textBaseline='middle';
  // 背板
  const bw=196, bh=46;
  roundRect(hx, cx-bw/2, 14, bw, bh, 10);
  hx.fillStyle='rgba(8,15,26,0.72)'; hx.fill();
  hx.strokeStyle= urgent? `rgba(255,90,78,${0.5+Math.sin(S.t*7)*0.3})` : 'rgba(40,66,104,0.8)';
  hx.lineWidth=1.5; hx.stroke();
  hx.font=`800 30px ui-monospace,Menlo,monospace`;
  hx.fillStyle= urgent? `rgb(255,${110+Math.sin(S.t*8)*60|0},90)`:'#d6ecff';
  hx.fillText(`${m}:${String(s).padStart(2,'0')}`, cx, 38);
  // 进度条
  const pw=bw-24;
  hx.fillStyle='rgba(255,255,255,0.08)';
  hx.fillRect(cx-pw/2, 54, pw, 3);
  hx.fillStyle= urgent? '#ff6a58':'#6fd3ff';
  hx.fillRect(cx-pw/2, 54, pw*(t/RULE.ROUND_TIME), 3);
  hx.restore();

  // 敌方血条(在计时器下方,给"我打得有没有用"的反馈)
  const ew=250, eh=8, ex=cx-ew/2, ey=72;
  hx.save();
  hx.font='600 11px -apple-system,sans-serif'; hx.textAlign='center';
  hx.fillStyle='rgba(150,175,205,0.72)';
  hx.fillText(`对手 · ${AI.PRESETS[S.difficulty].name}`, cx, ey-6);
  roundRect(hx, ex, ey, ew, eh, 4);
  hx.fillStyle='rgba(255,255,255,0.07)'; hx.fill();
  const ehp=U.clamp(E.hp/RULE.HP_MAX,0,1);
  roundRect(hx, ex, ey, Math.max(2,ew*ehp), eh, 4);
  const eg=hx.createLinearGradient(ex,0,ex+ew,0);
  eg.addColorStop(0,'#ff8a70'); eg.addColorStop(1,'#ffc27a');
  hx.fillStyle=eg; hx.fill();
  hx.strokeStyle='rgba(255,255,255,0.12)'; hx.lineWidth=1;
  roundRect(hx, ex, ey, ew, eh, 4); hx.stroke();
  hx.restore();
}

function drawHealth(W,H){
  const x=34, y=H-58;
  hx.save();
  // 数值
  hx.font='800 44px ui-monospace,Menlo,monospace';
  hx.textAlign='left'; hx.textBaseline='alphabetic';
  const hp=Math.max(0,P.hp);
  const low=hp<=35;
  hx.fillStyle= low? `rgb(255,${90+Math.sin(S.t*6)*40|0},80)` : '#dff0ff';
  hx.fillText(String(hp), x, y);
  hx.font='600 12px -apple-system,sans-serif';
  hx.fillStyle='rgba(150,175,205,0.7)';
  hx.fillText('生命', x+2, y+18);
  // 条
  const bw=210, bh=9, bx=x+86, by=y-22;
  roundRect(hx,bx,by,bw,bh,4); hx.fillStyle='rgba(255,255,255,0.07)'; hx.fill();
  roundRect(hx,bx,by,Math.max(2,bw*(hp/RULE.HP_MAX)),bh,4);
  const g2=hx.createLinearGradient(bx,0,bx+bw,0);
  if(low){ g2.addColorStop(0,'#ff5f4e'); g2.addColorStop(1,'#ff9a6a'); }
  else { g2.addColorStop(0,'#5fd0ff'); g2.addColorStop(1,'#9ff0e0'); }
  hx.fillStyle=g2; hx.fill();
  // 逃跑加速提示
  if(P.hurtBoost>0){
    hx.font='700 11px -apple-system,sans-serif';
    hx.fillStyle=`rgba(255,190,110,${U.clamp(P.hurtBoost,0,1)*0.9})`;
    hx.fillText('肾上腺素 · 移动加速', bx, by-8);
  }
  /* 体温显影警告:站着不动会被烧出来 */
  if(P.heat>0.04){
    const k=P.heat;
    const wx=bx, wy=by-(P.hurtBoost>0?26:10);
    hx.font='700 11.5px -apple-system,sans-serif';
    hx.fillStyle=`rgba(255,${170-k*80|0},${120-k*70|0},${0.45+k*0.55})`;
    hx.fillText(k>0.75? '体温已显影 —— 他看得到你' : k>0.4? '你站太久了' : '体温开始显影', wx, wy);
    // 小热度条
    const hw=92, hh=4, hxx=wx+ (k>0.75?150: k>0.4?86:98), hyy=wy-8;
    hx.fillStyle='rgba(255,255,255,0.10)'; hx.fillRect(hxx,hyy,hw,hh);
    const hg=hx.createLinearGradient(hxx,0,hxx+hw,0);
    hg.addColorStop(0,'rgba(255,190,120,0.85)'); hg.addColorStop(1,'rgba(255,90,70,0.95)');
    hx.fillStyle=hg; hx.fillRect(hxx,hyy,Math.max(2,hw*k),hh);
  }
  hx.restore();
}

function drawAmmo(W,H){
  const x=W-34, y=H-58;
  hx.save();
  hx.textAlign='right';
  // 子弹格
  const n=RULE.AMMO_MAX, gw=15, gh=30, gap=7;
  const total=n*gw+(n-1)*gap;
  for(let i=0;i<n;i++){
    const bx=x-total+i*(gw+gap), by=y-gh;
    const filled = i < P.ammo;
    roundRect(hx,bx,by,gw,gh,3);
    if(filled){
      const g2=hx.createLinearGradient(0,by,0,by+gh);
      g2.addColorStop(0,'#ffd89a'); g2.addColorStop(1,'#e59a4a');
      hx.fillStyle=g2; hx.fill();
      hx.strokeStyle='rgba(255,225,180,0.5)';
    }else{
      hx.fillStyle='rgba(255,255,255,0.05)'; hx.fill();
      hx.strokeStyle='rgba(255,255,255,0.10)';
    }
    hx.lineWidth=1; hx.stroke();
  }
  hx.font='600 12px -apple-system,sans-serif';
  hx.fillStyle='rgba(150,175,205,0.7)';
  hx.fillText('弹药  R 换弹', x, y+18);

  // 侦测器充能
  const dy=y-58;
  const dw=104, dh=7, dx=x-dw;
  const ready=P.detCd<=0;
  hx.font='600 12px -apple-system,sans-serif';
  hx.fillStyle= ready? 'rgba(120,255,215,0.92)':'rgba(140,165,195,0.6)';
  hx.fillText(ready? '侦测器就绪  Q':`侦测器 ${P.detCd.toFixed(1)}s`, x, dy-6);
  roundRect(hx,dx,dy,dw,dh,3); hx.fillStyle='rgba(255,255,255,0.07)'; hx.fill();
  const k= ready?1:1-P.detCd/RULE.DET_COOLDOWN;
  roundRect(hx,dx,dy,Math.max(2,dw*k),dh,3);
  hx.fillStyle= ready? '#6effc4':'rgba(110,220,190,0.5)'; hx.fill();
  hx.restore();
}

/* 左下角:我自己房间的小地图(我知道我在哪,对手不知道) */
function drawMinimapSelf(W,H){
  const size=124, pad=22;
  const x=pad, y=pad+16;
  const mw=size, mh=size*WORLD.D/WORLD.W;
  hx.save();
  roundRect(hx,x,y,mw,mh,8);
  hx.fillStyle='rgba(6,12,22,0.72)'; hx.fill();
  hx.strokeStyle='rgba(45,75,115,0.8)'; hx.lineWidth=1.2; hx.stroke();
  hx.save();
  roundRect(hx,x,y,mw,mh,8); hx.clip();
  const w2p=(wx)=>x+(wx+WORLD.W/2)/WORLD.W*mw;
  const z2p=(wz)=>y+(wz+WORLD.D/2)/WORLD.D*mh;
  // 障碍
  for(const o of WORLD.layout){
    if(o.type==='prop'){
      hx.fillStyle='rgba(130,180,235,0.45)';
      hx.beginPath(); hx.arc(w2p(o.x),z2p(o.z),2.4,0,U.TAU); hx.fill();
      continue;
    }
    hx.fillStyle= o.type==='pillar'? 'rgba(150,190,240,0.5)':
                  o.type==='panel' ? 'rgba(110,160,215,0.34)':'rgba(120,170,225,0.42)';
    hx.fillRect(w2p(o.x-o.sx/2), z2p(o.z-o.sz/2), o.sx/WORLD.W*mw, o.sz/WORLD.D*mh);
  }
  // 巨幕位置(顶部亮条)
  const sg=hx.createLinearGradient(0,y,0,y+14);
  sg.addColorStop(0,'rgba(110,210,255,0.55)'); sg.addColorStop(1,'rgba(110,210,255,0)');
  hx.fillStyle=sg; hx.fillRect(x,y,mw,14);
  hx.fillStyle='rgba(160,230,255,0.85)'; hx.fillRect(x+mw*0.06, y+1, mw*0.88, 2.4);
  // 敌方弹着点(我被打的地方)
  for(const f of SCENE.roomFx){
    const k=1-f.t/f.life;
    if(f.type==='impact'){
      hx.strokeStyle=`rgba(255,110,80,${k*0.9})`; hx.lineWidth=1.4;
      hx.beginPath(); hx.arc(w2p(f.x),z2p(f.z), 3+(1-k)*7, 0,U.TAU); hx.stroke();
    }else{
      hx.strokeStyle=`rgba(110,255,210,${k*0.8})`; hx.lineWidth=1.2;
      const R=f.rad/WORLD.W*mw;
      hx.strokeRect(w2p(f.x)-R, z2p(f.z)-R*(WORLD.W/WORLD.D)*(WORLD.D/WORLD.W), R*2, R*2*(mh/mw)*(WORLD.W/WORLD.D));
    }
  }
  // 我
  const px=w2p(P.x), pz=z2p(P.z);
  hx.save(); hx.translate(px,pz); hx.rotate(P.yaw);
  // 视野扇
  hx.beginPath(); hx.moveTo(0,0);
  hx.arc(0,0,26,-Math.PI/2-0.55,-Math.PI/2+0.55); hx.closePath();
  const fg=hx.createRadialGradient(0,0,0,0,0,26);
  fg.addColorStop(0,'rgba(130,220,255,0.30)'); fg.addColorStop(1,'rgba(130,220,255,0)');
  hx.fillStyle=fg; hx.fill();
  hx.beginPath(); hx.moveTo(0,-5.5); hx.lineTo(-3.6,4); hx.lineTo(3.6,4); hx.closePath();
  hx.fillStyle='#9fe8ff'; hx.fill();
  hx.restore();
  hx.restore();
  // 标题
  hx.font='600 10px -apple-system,sans-serif'; hx.textAlign='left';
  hx.fillStyle='rgba(140,170,205,0.68)';
  hx.fillText('你的房间 · SECTOR-A', x+1, y-6);
  hx.restore();
}

function drawMessages(W,H){
  // 中央大字提示
  if(S.msgT>0 && S.msg){
    const a=U.clamp(Math.min(S.msgT*3.4,(1.5-S.msgT)*5),0,1);
    hx.save();
    hx.textAlign='center'; hx.textBaseline='middle';
    hx.font='800 30px -apple-system,"PingFang SC",sans-serif';
    hx.globalAlpha=a;
    hx.shadowColor='#000'; hx.shadowBlur=14;
    hx.fillStyle=S.msg.color;
    hx.fillText(S.msg.text, W/2, H*0.30);
    hx.restore();
  }
  // 底部教学提示(倒计时期间让位给三条规则)
  if(S.hintT>0 && S.hint && S.phase!=='countdown'){
    const a=U.clamp(Math.min(S.hintT*2.6,1),0,1);
    hx.save();
    hx.textAlign='center';
    hx.font='600 13.5px -apple-system,"PingFang SC",sans-serif';
    const tw=hx.measureText(S.hint).width;
    hx.globalAlpha=a;
    roundRect(hx, W/2-tw/2-18, H-132, tw+36, 32, 8);
    hx.fillStyle='rgba(8,16,28,0.80)'; hx.fill();
    hx.strokeStyle='rgba(60,100,150,0.5)'; hx.lineWidth=1; hx.stroke();
    hx.fillStyle='#bcd8f5';
    hx.textBaseline='middle';
    hx.fillText(S.hint, W/2, H-116);
    hx.restore();
  }
}

function roundRect(c,x,y,w,h,r){
  c.beginPath();
  if(c.roundRect){ c.roundRect(x,y,w,h,r); return; }
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}

/* ---------------- 启动 ---------------- */
window.addEventListener('load',()=>{ boot(); });
return { S, RULE, get P(){return P;}, get E(){return E;}, get ai(){return ai;},
         showHint, exposureRisk,
         /* 测试钩子:绕过指针锁直接触发输入动作 */
         _fire: tryFire, _detector: toggleDetector, _reload: manualReload,
         _aimPoint: ()=>aimPoint(P), _in: IN,
         _ads: v=>{ IN.ads=!!v; } };
})();
