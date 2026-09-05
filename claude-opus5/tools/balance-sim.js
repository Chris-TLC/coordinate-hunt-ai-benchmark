'use strict';
/* ============================================================
   坐标猎场 · 无头平衡模拟器(开发用,不属于游戏本体)
   在 Node 里加载纯逻辑模块(util / world / ai),用脚本化的
   "玩家策略"跑成百上千局,检验数值与 AI 是否构成真正的博弈。
   用法: node tools/balance-sim.js [局数] [难度]
         (从项目根目录运行)
   ============================================================ */
const fs=require('fs'), path=require('path'), vm=require('vm');

/* ---- 搭一个最小的浏览器壳,让 js/ 里的纯逻辑模块能跑起来 ---- */
const sandbox={ console, Math, performance:{now:()=>Date.now()},
  document:{ getElementById:()=>null, createElement:()=>({getContext:()=>({})}) } };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
for(const f of ['00_util.js','04_world.js','07_ai.js']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'), sandbox, {filename:f});
}
// 顶层 const 不会挂到 sandbox 对象上,显式取出
const [U,WORLD,COLL,AI]=vm.runInContext('[U,WORLD,COLL,AI]', sandbox);

/* ---- 与 08_game.js 保持同步的规则常量 ---- */
const RULE={
  ROUND_TIME:120, HP_MAX:100, DMG_CORE:22, DMG_EDGE:11,
  HIT_CORE_R:0.80, HIT_EDGE_R:1.45, RELOAD:2.0, AMMO_MAX:5, RELOAD_FULL:2.6,
  DET_COOLDOWN:11, DET_RAD:2.6, WALK:3.5, SPRINT:5.9,
  HURT_SPRINT_BOOST:1.32, HURT_BOOST_TIME:3.2,
  TRAIL_INTERVAL:0.42, TRAIL_SPRINT_MUL:1.9,
  HEAT_DELAY:4.2, HEAT_FULL:12.0, HEAT_MOVE_RESET:0.55, HEAT_COOL_RATE:2.6,
  HEAT_SPREAD_MAX:2.6, HEAT_SPREAD_MIN:0.85,
  PLAYER_R:0.34,
};
for(const k of Object.keys(RULE)){
  if(process.env['R_'+k]!==undefined) RULE[k]=parseFloat(process.env['R_'+k]);
}
const DT=1/60;
const DIAG={aiErr:[],pErr:[],aiPeakSharp:[],aiConf:[]};
function stat(a){ if(!a.length) return '-'; const s=[...a].sort((x,y)=>x-y);
  const q=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];
  return `中位${q(0.5).toFixed(2)} 25%${q(0.25).toFixed(2)} 75%${q(0.75).toFixed(2)}`; }

function newEnt(sp,isP){
  return {x:sp.x,z:sp.z,vx:0,vz:0,hp:RULE.HP_MAX,ammo:RULE.AMMO_MAX,cool:0,reloadT:0,
    reloading:false,detCd:0,trailT:0,hurtBoost:0,sprinting:false,
    stillT:0,heat:0,heatEmitT:0,anchorX:sp.x,anchorZ:sp.z,
    hist:[],histT:0,isPlayer:!!isP,shots:0,hits:0,dmgDealt:0,moved:0};
}

/* ---- 玩家策略(模拟一个会玩的人) ----
   参数化:命中猜测误差、开火频率、走位频率、是否用侦测器 */
function makePolicy(cfg){
  return {
    cfg,
    belief:null, goal:null, goalT:0, lastShot:-99, reactT:0,
    marks:[],            // 玩家从巨幕上读到的敌方痕迹
    noteFlash(x,z){ this.marks.push({x,z,t:0,w:1.0,kind:'flash'}); },
    noteTrail(x,z,s){ this.marks.push({x,z,t:0,w:0.34*s,kind:'trail'}); },
    noteHeat(x,z,h){ this.marks.push({x,z,t:0,w:0.30+h*0.5,kind:'heat'}); },
    /* 从痕迹里估一个敌人位置(模拟人的直觉:看最新最亮的痕迹) */
    guess(){
      let bx=0,bz=0,tw=0;
      for(const m of this.marks){
        const age=Math.max(0,1-m.t/4.5);
        const w=m.w*age*age;
        if(w<=0) continue;
        bx+=m.x*w; bz+=m.z*w; tw+=w;
      }
      if(tw<0.05) return null;
      return {x:bx/tw, z:bz/tw, conf:Math.min(1,tw)};
    },
    tick(dt){
      for(let i=this.marks.length-1;i>=0;i--){
        this.marks[i].t+=dt;
        if(this.marks[i].t>5) this.marks.splice(i,1);
      }
    }
  };
}

function simulate(diff, policyCfg, seed){
  let rs=seed>>>0||1;
  const rnd=()=>{ rs=(rs*1664525+1013904223)>>>0; return rs/4294967296; };
  const R=(a,b)=>a+rnd()*(b-a);

  const P=newEnt(WORLD.playerSpawn,true), E=newEnt(WORLD.enemySpawn,false);
  const ai=new AI.Agent(diff); ai.reset(E);
  const pol=makePolicy(policyCfg);
  let t=0, roundT=RULE.ROUND_TIME, over=null;

  function heat(ent, onEmit){
    const drift=U.dist(ent.x,ent.z,ent.anchorX,ent.anchorZ);
    if(drift>RULE.HEAT_MOVE_RESET){
      ent.anchorX=ent.x; ent.anchorZ=ent.z; ent.stillT=0;
      ent.heat=Math.max(0,ent.heat-DT*RULE.HEAT_COOL_RATE/RULE.HEAT_FULL);
    }else{
      ent.stillT+=DT;
      const o=ent.stillT-RULE.HEAT_DELAY;
      ent.heat = o<=0 ? Math.max(0,ent.heat-DT*0.35/RULE.HEAT_FULL)
                      : U.clamp(o/(RULE.HEAT_FULL-RULE.HEAT_DELAY),0,1);
    }
    if(ent.heat<=0.02) return;
    ent.heatEmitT-=DT;
    if(ent.heatEmitT<=0){
      ent.heatEmitT=U.lerp(1.15,0.42,ent.heat);
      onEmit(U.lerp(RULE.HEAT_SPREAD_MAX,RULE.HEAT_SPREAD_MIN,ent.heat), ent.heat);
    }
  }
  function fire(sh,tg,tx,tz,byPlayer){
    sh.ammo--; sh.cool=RULE.RELOAD; sh.shots++;
    if(sh.ammo<=0){ sh.reloading=true; sh.reloadT=RULE.RELOAD_FULL; }
    const d=U.dist(tx,tz,tg.x,tg.z);
    let dmg=0;
    if(d<=RULE.HIT_CORE_R) dmg=RULE.DMG_CORE;
    else if(d<=RULE.HIT_EDGE_R){
      const k=1-(d-RULE.HIT_CORE_R)/(RULE.HIT_EDGE_R-RULE.HIT_CORE_R);
      dmg=Math.round(RULE.DMG_EDGE*(0.55+0.45*k));
    }
    if(byPlayer){
      DIAG.pErr.push(U.dist(tx,tz,E.x,E.z));
      ai.onPlayerFire(P.x,P.z,tx,tz,E);
      if(dmg>0){ tg.hp-=dmg; sh.hits++; sh.dmgDealt+=dmg; tg.hurtBoost=RULE.HURT_BOOST_TIME; ai.onSelfHit(); }
      else ai.brain.observeEmpty(tx,tz,1.3,0.42);
    }else{
      DIAG.aiErr.push(U.dist(tx,tz,P.x,P.z));
      DIAG.aiPeakSharp.push(ai.brain.peak().sharp);
      DIAG.aiConf.push(ai.brain.confidence);
      pol.noteFlash(E.x,E.z);
      if(dmg>0){ tg.hp-=dmg; sh.hits++; sh.dmgDealt+=dmg; tg.hurtBoost=RULE.HURT_BOOST_TIME; ai.onOwnShotHit(tx,tz); }
      else ai.onOwnShotMiss(tx,tz);
    }
  }

  while(roundT>0 && !over){
    t+=DT; roundT-=DT;
    /* ---------- 玩家策略 ---------- */
    P.cool=Math.max(0,P.cool-DT); P.detCd=Math.max(0,P.detCd-DT);
    P.hurtBoost=Math.max(0,P.hurtBoost-DT);
    if(P.reloading){ P.reloadT-=DT; if(P.reloadT<=0){P.reloading=false;P.ammo=RULE.AMMO_MAX;} }
    pol.tick(DT);
    // 走位
    pol.goalT-=DT;
    if(!pol.goal||pol.goalT<=0||U.dist(P.x,P.z,pol.goal.x,pol.goal.z)<0.7){
      pol.goal={x:R(-WORLD.W/2+1.2,WORLD.W/2-1.2), z:R(-WORLD.D/2+1.2,WORLD.D/2-1.2)};
      pol.goalT=R(1.2,2.8)/Math.max(0.3,policyCfg.moveRate);
    }
    if(policyCfg.moveRate>0.01){
      let dx=pol.goal.x-P.x, dz=pol.goal.z-P.z;
      const dl=Math.hypot(dx,dz)||1;
      const spd=(policyCfg.sprint?RULE.SPRINT:RULE.WALK)*(P.hurtBoost>0?RULE.HURT_SPRINT_BOOST:1);
      const nx=P.x+dx/dl*spd*DT, nz=P.z+dz/dl*spd*DT;
      const [cx,cz]=COLL.resolve(nx,nz,RULE.PLAYER_R);
      P.vx=(cx-P.x)/DT; P.vz=(cz-P.z)/DT;
      P.moved+=U.dist(P.x,P.z,cx,cz);
      P.x=cx; P.z=cz;
      P.sprinting=!!policyCfg.sprint;
    }else{ P.vx=P.vz=0; P.sprinting=false; }
    // 玩家留痕(AI 读到)
    P.trailT-=DT;
    if(P.trailT<=0){
      P.trailT=RULE.TRAIL_INTERVAL*(P.sprinting?0.62:1);
      if(policyCfg.moveRate>0.01){
        ai.onPlayerTrail(P.x,P.z,(P.sprinting?RULE.TRAIL_SPRINT_MUL:1)*0.85);
        ai.noteTrailDir(P.vx,P.vz);
      }
    }
    heat(P,(sp,h)=>ai.onHeatSignature(P.x,P.z,sp,h));
    // 玩家开火
    if(P.cool<=0&&!P.reloading&&P.ammo>0&&t-pol.lastShot>policyCfg.fireGap){
      const g=pol.guess();
      if(g&&g.conf>policyCfg.minConf){
        const err=policyCfg.aimErr*(1.4-g.conf*0.8);
        fire(P,E,U.clamp(g.x+R(-err,err),-7.7,7.7),U.clamp(g.z+R(-err,err),-7.2,7.2),true);
        pol.lastShot=t;
      }
    }
    /* ---------- AI ---------- */
    E.cool=Math.max(0,E.cool-DT); E.detCd=Math.max(0,E.detCd-DT);
    E.hurtBoost=Math.max(0,E.hurtBoost-DT);
    if(E.reloading){ E.reloadT-=DT; if(E.reloadT<=0){E.reloading=false;E.ammo=RULE.AMMO_MAX;} }
    const bx=E.x,bz=E.z;
    ai.update(DT,E,{
      time:t, walkSpeed:RULE.WALK,
      sprintSpeed:RULE.SPRINT*(E.hurtBoost>0?RULE.HURT_SPRINT_BOOST:1),
      canFire:E.cool<=0&&!E.reloading&&E.ammo>0,
      detectorReady:E.detCd<=0,
      move(dx,dz,sp){ const [cx,cz]=COLL.resolve(E.x+dx,E.z+dz,RULE.PLAYER_R);
        E.vx=(cx-E.x)/DT; E.vz=(cz-E.z)/DT; E.x=cx; E.z=cz; E.sprinting=!!sp; },
      fire(tx,tz){ fire(E,P,tx,tz,false); },
      throwDetector(tx,tz){
        E.detCd=RULE.DET_COOLDOWN;
        const inside=Math.abs(P.x-tx)<RULE.DET_RAD&&Math.abs(P.z-tz)<RULE.DET_RAD;
        ai.onDetectorResult(tx,tz,RULE.DET_RAD,inside, inside?[P.x,P.z]:null);
      },
    });
    const md=U.dist(bx,bz,E.x,E.z); E.moved+=md;
    E.trailT-=DT;
    if(E.trailT<=0){ E.trailT=RULE.TRAIL_INTERVAL*(E.sprinting?0.62:1);
      if(md>0.002) pol.noteTrail(E.x,E.z,E.sprinting?RULE.TRAIL_SPRINT_MUL:1); }
    heat(E,(sp,h)=>pol.noteHeat(E.x+R(-sp,sp)*0.34, E.z+R(-sp,sp)*0.34, h));

    if(P.hp<=0) over='lose';
    else if(E.hp<=0) over='win';
  }
  if(!over) over = P.hp>E.hp?'win':P.hp<E.hp?'lose':'draw';
  return {result:over, php:Math.max(0,P.hp), ehp:Math.max(0,E.hp),
          pShots:P.shots,pHits:P.hits,eShots:E.shots,eHits:E.hits,
          dur:+(RULE.ROUND_TIME-roundT).toFixed(1),
          pMoved:+P.moved.toFixed(0), eMoved:+E.moved.toFixed(0)};
}

/* ---- 跑批 ---- */
const N=parseInt(process.argv[2]||'200',10);
const DIFFS=(process.argv[3]?[process.argv[3]]:['easy','std','hard']);
const POLICIES={
  '躺平(完全不动不开枪)': {moveRate:0, fireGap:1e9, aimErr:9, minConf:9, sprint:false},
  '蹲坑(不动但会还击)':   {moveRate:0, fireGap:2.2, aimErr:1.5, minConf:0.28, sprint:false},
  '新手(乱走乱打)':       {moveRate:0.8, fireGap:1.9, aimErr:2.6, minConf:0.10, sprint:false},
  '会玩(走位+看痕迹)':    {moveRate:1.0, fireGap:2.3, aimErr:1.25, minConf:0.30, sprint:false},
  '高手(疾跑+高精度)':    {moveRate:1.35, fireGap:2.0, aimErr:0.85, minConf:0.36, sprint:true},
};
console.log(`\n=== 坐标猎场 平衡模拟 · 每组 ${N} 局 ===\n`);
for(const diff of DIFFS){
  console.log(`--- 对手:${AI.PRESETS[diff].name} (${diff}) ---`);
  console.log('玩家策略                    胜  平  负   胜率   均剩血  玩家命中率 AI命中率  均时长');
  for(const [name,cfg] of Object.entries(POLICIES)){
    let w=0,l=0,d=0,hp=0,ps=0,ph=0,es=0,eh=0,dur=0;
    for(let i=0;i<N;i++){
      const r=simulate(diff,cfg, 0x9E3779B9 ^ (i*2654435761));
      if(r.result==='win')w++; else if(r.result==='lose')l++; else d++;
      hp+=r.php; ps+=r.pShots; ph+=r.pHits; es+=r.eShots; eh+=r.eHits; dur+=r.dur;
    }
    const pad=(s,n)=>String(s).padEnd(n,' ');
    console.log(`${pad(name,26)}${pad(w,4)}${pad(d,4)}${pad(l,5)}${pad((w/N*100).toFixed(0)+'%',7)}`
      +`${pad((hp/N).toFixed(0),8)}${pad(ps?(ph/ps*100).toFixed(0)+'%':'-',11)}`
      +`${pad(es?(eh/es*100).toFixed(0)+'%':'-',9)}${(dur/N).toFixed(0)}s`);
  }
  console.log('');
}

/* ---- 诊断汇总 ---- */
console.log('=== 瞄准误差诊断(米,越小越准;命中核心需 <0.85,擦伤 <1.55)===');
console.log('AI  开火落点误差: '+stat(DIAG.aiErr)+`   (样本 ${DIAG.aiErr.length})`);
console.log('玩家开火落点误差: '+stat(DIAG.pErr)+`   (样本 ${DIAG.pErr.length})`);
console.log('AI  信念峰值锐度: '+stat(DIAG.aiPeakSharp));
console.log('AI  置信度      : '+stat(DIAG.aiConf));
