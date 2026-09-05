'use strict';
/* ============ 坐标猎场 · 对手 AI ============
   核心原则:AI 和玩家吃同一套信息。它看不见玩家,只能通过
     ① 玩家开火时在它屏幕上留下的闪光
     ② 玩家移动留下的残痕(它的屏幕上也有)
     ③ 自己投放的侦测器
   来推断玩家位置。内部维护一张概率信念网格,随时间扩散、随证据收敛。
*/
const AI = (() => {
  const GX=32, GZ=30;                              // 信念网格 (0.5m 一格)
  const CW=WORLD.W/GX, CZ=WORLD.D/GZ;
  const RULE_HIT_EDGE=1.45;   // 必须与 08_game.js 的 RULE.HIT_EDGE_R 一致

  class Brain{
    constructor(cfg){
      this.cfg=cfg;
      this.bel=new Float32Array(GX*GZ);
      this.tmp=new Float32Array(GX*GZ);
      this.reset();
    }
    reset(){
      this.bel.fill(1/(GX*GZ));
      this.confidence=0;
    }
    cellCenter(gx,gz){ return [ -WORLD.W/2+(gx+0.5)*CW, -WORLD.D/2+(gz+0.5)*CZ ]; }
    normalize(){
      let s=0; for(let i=0;i<this.bel.length;i++) s+=this.bel[i];
      if(s<=1e-9){ this.bel.fill(1/this.bel.length); return; }
      for(let i=0;i<this.bel.length;i++) this.bel[i]/=s;
    }
    /* 时间流逝:概率向邻域扩散(目标在移动) */
    diffuse(dt, speed){
      const spread=U.clamp(speed*dt/CW, 0, 0.5);
      if(spread<=0.001) return;
      const b=this.bel, t=this.tmp;
      t.set(b);
      const k=spread*0.22;
      for(let z=0;z<GZ;z++) for(let x=0;x<GX;x++){
        const i=z*GX+x;
        let acc=t[i]*(1-k*4);
        acc += (x>0? t[i-1]:t[i])*k;
        acc += (x<GX-1? t[i+1]:t[i])*k;
        acc += (z>0? t[i-GX]:t[i])*k;
        acc += (z<GZ-1? t[i+GX]:t[i])*k;
        b[i]=acc;
      }
      // 缓慢回归均匀(信息过期)
      const u=1/(GX*GZ), decay=U.clamp(dt*0.055,0,0.4);
      for(let i=0;i<b.length;i++) b[i]=b[i]*(1-decay)+u*decay;
      this.normalize();
      this.confidence*=Math.pow(0.72,dt);
    }
    /* 硬证据:目标就在 (x,z) 附近 sigma 米内 */
    observePoint(x,z,sigma,weight){
      const s2=2*sigma*sigma;
      for(let gz=0;gz<GZ;gz++) for(let gx=0;gx<GX;gx++){
        const [cx,cz]=this.cellCenter(gx,gz);
        const d2=(cx-x)*(cx-x)+(cz-z)*(cz-z);
        const l=Math.exp(-d2/s2);
        const i=gz*GX+gx;
        this.bel[i]*= (1-weight) + weight*l*8;
      }
      this.normalize();
      this.confidence=Math.min(1, this.confidence+weight*0.9);
    }
    /* 否证:这块区域没人(侦测器返回"空" / 打空了) */
    observeEmpty(x,z,rad,strength){
      for(let gz=0;gz<GZ;gz++) for(let gx=0;gx<GX;gx++){
        const [cx,cz]=this.cellCenter(gx,gz);
        if(Math.abs(cx-x)<rad && Math.abs(cz-z)<rad){
          this.bel[gz*GX+gx]*= (1-strength);
        }
      }
      this.normalize();
    }
    /* 取最可能的点 + 峰值锐度 */
    peak(){
      let best=-1,bi=0;
      for(let i=0;i<this.bel.length;i++) if(this.bel[i]>best){best=this.bel[i];bi=i;}
      const gx=bi%GX, gz=(bi/GX)|0;
      const [x,z]=this.cellCenter(gx,gz);
      return {x,z,p:best, sharp: best*GX*GZ};
    }
    /* 朝 (x,z) 开一枪的命中概率:落在命中半径内的信念质量。
       这是"这一枪值不值得开"的唯一正确度量 —— 比看峰值高度靠谱得多。*/
    hitMass(x,z,rad){
      let m=0;
      const r2=rad*rad;
      for(let gz=0;gz<GZ;gz++){
        const cz=-WORLD.D/2+(gz+0.5)*CZ;
        const dz=cz-z; if(dz*dz>r2) continue;
        for(let gx=0;gx<GX;gx++){
          const cx=-WORLD.W/2+(gx+0.5)*CW;
          const dx=cx-x;
          if(dx*dx+dz*dz<=r2) m+=this.bel[gz*GX+gx];
        }
      }
      return m;
    }
    /* 在信念上找命中质量最大的落点(网格搜索 + 局部精修) */
    bestShot(rad){
      let bx=0,bz=0,bm=-1;
      // 粗搜:每 2 格取一个候选
      for(let gz=1;gz<GZ;gz+=2){
        const z=-WORLD.D/2+(gz+0.5)*CZ;
        for(let gx=1;gx<GX;gx+=2){
          const x=-WORLD.W/2+(gx+0.5)*CW;
          if(this.bel[gz*GX+gx]<1e-6) continue;
          const m=this.hitMass(x,z,rad);
          if(m>bm){ bm=m; bx=x; bz=z; }
        }
      }
      // 精修
      for(let i=0;i<6;i++){
        const s=0.55/(i*0.5+1);
        let improved=false;
        for(const [ox,oz] of [[s,0],[-s,0],[0,s],[0,-s],[s,s],[-s,-s],[s,-s],[-s,s]]){
          const m=this.hitMass(bx+ox,bz+oz,rad);
          if(m>bm){ bm=m; bx+=ox; bz+=oz; improved=true; }
        }
        if(!improved) break;
      }
      return {x:bx, z:bz, mass:bm};
    }
    /* 在信念分布上按概率采样一个点(带一点噪声,不完美) */
    sample(noise){
      let r=Math.random(), acc=0, bi=0;
      for(let i=0;i<this.bel.length;i++){ acc+=this.bel[i]; if(acc>=r){bi=i;break;} bi=i; }
      const gx=bi%GX, gz=(bi/GX)|0;
      let [x,z]=this.cellCenter(gx,gz);
      x+=U.rand(-noise,noise); z+=U.rand(-noise,noise);
      return {x:U.clamp(x,-WORLD.W/2+0.4,WORLD.W/2-0.4),
              z:U.clamp(z,-WORLD.D/2+0.4,WORLD.D/2-0.4)};
    }
  }

  /* ------- 难度配置 -------
     fireGate = 开火所需的最低命中概率(信念落在命中圈内的质量)。
                低 = 更爱赌、开枪更频繁;高 = 更谨慎。
     aimNoise = 落点手抖(米)。
     evidenceSigma = 它把一条证据"糊开"多宽 —— 越小推断越锐利。*/
  const PRESETS={
    easy:{ name:'侦察兵',
      aimNoise:1.30, reactMin:0.55, reactMax:1.15, fireGate:0.30,
      moveAfterShot:0.55, detectorUse:0.40, predictLead:0.20,
      repositionRate:0.55, speedScale:0.94, evidenceSigma:2.10 },
    std:{ name:'猎手',
      aimNoise:0.62, reactMin:0.28, reactMax:0.62, fireGate:0.17,
      moveAfterShot:0.85, detectorUse:0.75, predictLead:0.45,
      repositionRate:0.85, speedScale:1.0,  evidenceSigma:1.45 },
    hard:{ name:'幽灵',
      aimNoise:0.30, reactMin:0.16, reactMax:0.38, fireGate:0.11,
      moveAfterShot:1.0, detectorUse:1.0, predictLead:0.70,
      repositionRate:1.0, speedScale:1.06, evidenceSigma:1.05 },
  };

  class Agent{
    constructor(diff){
      this.setDifficulty(diff);
      this.brain=new Brain(this.cfg);
    }
    setDifficulty(d){ this.diffKey=d; this.cfg=PRESETS[d]||PRESETS.std; }
    reset(ent){
      this.brain.reset();
      this.state='roam';
      this.goal=null;
      this.thinkT=0;
      this.reactT=0;
      this.lastShotAt=-99;
      this.dangerT=0;
      this.strafeDir=Math.random()<0.5?-1:1;
      this.lastTrailDir=null;
      this.recentShots=[];     // 自己最近开火的位置(= 自己暴露过的点)
      this.commitGoalT=0;
    }

    /* ===== 感知:玩家开火在 AI 屏幕上留下闪光 ===== */
    onPlayerFire(px,pz, aimX,aimZ, me){
      // AI 得知:玩家在 (px,pz) 开了一枪 —— 这是最强的位置证据
      const s=this.cfg.evidenceSigma;
      this.brain.observePoint(px,pz, s, 0.82);
      this.recentShots.push({x:px,z:pz,t:0});
      if(this.recentShots.length>4) this.recentShots.shift();
      // 反应延迟
      this.reactT = U.rand(this.cfg.reactMin, this.cfg.reactMax);
      this.state='hunt';
      // 打到我附近了 → 危险,该跑
      const near=U.dist(aimX,aimZ, me.x,me.z);
      if(near<3.2){ this.dangerT=Math.max(this.dangerT, 2.2 + (3.2-near)*0.6); }
    }
    /* 玩家移动残痕(弱证据) */
    onPlayerTrail(px,pz,strength){
      this.brain.observePoint(px,pz, this.cfg.evidenceSigma*1.8, 0.14*strength);
    }
    /* 玩家体温显影(站着不动被烧出来的热痕)—— 越热越强的证据 */
    onHeatSignature(px,pz,spread,heat){
      this.brain.observePoint(px,pz, Math.max(0.6,spread), 0.16+heat*0.42);
      if(heat>0.7) this.state='hunt';
    }
    /* 侦测器回报 */
    onDetectorResult(x,z,rad,found,pathLast){
      if(found && pathLast){ this.brain.observePoint(pathLast[0],pathLast[1], 0.8, 0.95); this.state='hunt';
        this.reactT=Math.min(this.reactT, this.cfg.reactMin*0.6); }
      else this.brain.observeEmpty(x,z,rad,0.86);
    }
    /* 自己打空了 → 那块地方没人 */
    onOwnShotMiss(x,z){ this.brain.observeEmpty(x,z,1.4,0.55); }
    onOwnShotHit(x,z){ this.brain.observePoint(x,z,0.9,0.9); }
    /* 自己被打中 → 对手知道我在这,必须马上换位置 */
    onSelfHit(){ this.dangerT=Math.max(this.dangerT,3.4); this.state='evade'; this.goal=null; }

    /* ===== 每帧决策 ===== */
    update(dt, me, api){
      const c=this.cfg;
      // 信念扩散
      this.brain.diffuse(dt, 3.2);
      for(const s of this.recentShots) s.t+=dt;
      this.dangerT=Math.max(0,this.dangerT-dt);
      if(this.reactT>0) this.reactT-=dt;

      /* --- 走位目标选择 --- */
      this.commitGoalT-=dt;
      if(!this.goal || this.commitGoalT<=0 || U.dist(me.x,me.z,this.goal.x,this.goal.z)<0.7){
        this.goal=this.chooseGoal(me);
        this.commitGoalT=U.rand(1.1,2.6);
      }
      /* --- 移动 --- */
      let sprint = this.dangerT>0.1 || me.hp<40;
      const spd=(sprint? api.sprintSpeed : api.walkSpeed)*c.speedScale;
      let dx=this.goal.x-me.x, dz=this.goal.z-me.z;
      const dl=Math.hypot(dx,dz)||1;
      dx/=dl; dz/=dl;
      // 侧向抖动:避免直线可预测
      const t=api.time;
      const sx=-dz*this.strafeDir, sz=dx*this.strafeDir;
      const wob=Math.sin(t*1.7+this.seedOff||0)*0.34;
      let mx=dx+sx*wob, mz=dz+sz*wob;
      const ml=Math.hypot(mx,mz)||1;
      api.move(mx/ml*spd*dt, mz/ml*spd*dt, sprint);

      /* --- 开火决策 --- */
      this.thinkT-=dt;
      if(this.thinkT<=0){
        this.thinkT=U.rand(0.1,0.22);
        this.considerShot(me, api);
      }
      /* --- 侦测器:信息不足时主动去"问一句" --- */
      if(api.detectorReady && Math.random()<dt*0.6*c.detectorUse){
        const shot=this.brain.bestShot(RULE_HIT_EDGE);
        // 把握不足以开枪时,才值得花侦测器换情报
        if(shot.mass < c.fireGate*1.5 || api.time-this.lastShotAt>8){
          const tgt=this.brain.sample(1.0);
          api.throwDetector(tgt.x,tgt.z);
        }
      }
    }

    /* 开火决策:只有当"这一枪的命中概率"够高才扣扳机。
       这既是最优策略,也是这个游戏的核心张力 ——
       开枪会暴露自己,所以必须权衡:值不值得为这个把握赌一次暴露。*/
    considerShot(me, api){
      if(!api.canFire) return;
      if(this.reactT>0) return;
      const c=this.cfg;
      const shot=this.brain.bestShot(RULE_HIT_EDGE);
      // 饥饿机制:太久没开枪,门槛逐步放低(避免双方僵死对耗)
      const dry=api.time-this.lastShotAt;
      const starve=U.clamp((dry-7)/9, 0, 1);
      const gate=c.fireGate*(1-starve*0.72);
      if(shot.mass < gate) return;

      // 落点:在最优点上加一点手抖(难度越低抖得越厉害)
      const jitter=c.aimNoise*(1.25-U.clamp(shot.mass*2.2,0,1)*0.6);
      let tx=shot.x+U.rand(-jitter,jitter);
      let tz=shot.z+U.rand(-jitter,jitter);
      // 预判提前量:朝对手最近的移动方向补一点
      if(this.lastTrailDir && c.predictLead>0){
        tx+=this.lastTrailDir[0]*c.predictLead*U.rand(0.2,1.0);
        tz+=this.lastTrailDir[1]*c.predictLead*U.rand(0.2,1.0);
      }
      tx=U.clamp(tx,-WORLD.W/2+0.3,WORLD.W/2-0.3);
      tz=U.clamp(tz,-WORLD.D/2+0.3,WORLD.D/2-0.3);
      api.fire(tx,tz);
      this.lastShotAt=api.time;
      // 打完就换位置 —— 它知道自己刚刚暴露了
      if(Math.random()<c.moveAfterShot){
        this.goal=this.safeSpot(me);
        this.commitGoalT=U.rand(1.3,2.2);
      }
    }

    /* 选择移动目标:综合"离对方最可能瞄的地方远" + "掩体" + "别老待一个地方" */
    chooseGoal(me){
      const c=this.cfg;
      let best=null, bestScore=-1e9;
      for(let i=0;i<26;i++){
        const x=U.rand(-WORLD.W/2+1.1, WORLD.W/2-1.1);
        const z=U.rand(-WORLD.D/2+1.1, WORLD.D/2-1.1);
        if(COLL.coverAt(x,z)) continue;
        let s=0;
        // 远离自己最近开火的位置(那是暴露点)
        for(const sh of this.recentShots){
          const d=U.dist(x,z, sh.x,sh.z);
          s += U.clamp(d*1.4,0,9) * Math.max(0,1-sh.t/9);
        }
        // 危险时:远离当前位置越远越好
        const dme=U.dist(x,z,me.x,me.z);
        s += this.dangerT>0 ? U.clamp(dme,0,8)*1.7 : -Math.abs(dme-4.2)*0.5;
        // 靠近掩体加分(藏在箱子边)
        let coverBonus=0;
        for(const o of WORLD.layout){
          if(o.type==='prop') continue;
          const d=U.dist(x,z,o.x,o.z);
          if(d<2.0) coverBonus+=(2.0-d)*1.5;
        }
        s+=coverBonus;
        // 别贴墙角(容易被扫)
        const edge=Math.min(WORLD.W/2-Math.abs(x), WORLD.D/2-Math.abs(z));
        s += U.clamp(edge,0,2.5)*0.7;
        // 随机性,避免完全可预测
        s += U.rand(0,3.2)*(1.3-c.repositionRate*0.5);
        if(s>bestScore){ bestScore=s; best={x,z}; }
      }
      return best || {x:U.rand(-6,6), z:U.rand(-5,5)};
    }
    safeSpot(me){
      // 打完枪后的紧急转移:朝远处的掩体后面
      let best=null,bs=-1e9;
      for(let i=0;i<18;i++){
        const a=Math.random()*U.TAU, r=U.rand(3.0,7.5);
        let x=U.clamp(me.x+Math.cos(a)*r,-WORLD.W/2+1,WORLD.W/2-1);
        let z=U.clamp(me.z+Math.sin(a)*r,-WORLD.D/2+1,WORLD.D/2-1);
        if(COLL.coverAt(x,z)) continue;
        let s=U.dist(x,z,me.x,me.z);
        for(const o of WORLD.layout){ if(o.type!=='prop'&&U.dist(x,z,o.x,o.z)<1.9) s+=2.4; }
        s+=U.rand(0,2);
        if(s>bs){bs=s;best={x,z};}
      }
      return best||this.chooseGoal(me);
    }
    /* 记录玩家移动方向(用于预判) */
    noteTrailDir(dx,dz){
      const l=Math.hypot(dx,dz);
      if(l>0.05) this.lastTrailDir=[dx/l,dz/l];
    }
    /* 调试:导出信念热力(可用于开发观察) */
    beliefPeak(){ return this.brain.peak(); }
  }

  return { Agent, PRESETS, GX, GZ };
})();
