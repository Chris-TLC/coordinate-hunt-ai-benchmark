'use strict';
/* ============ 坐标猎场 · 3D 场景 & 特效 ============ */
const SCENE = (() => {
  /* ---------- 贴图集 ---------- */
  const T = {};
  function initTextures(){
    T.floor = GL.texFromCanvas(TEX.floor(), {repeat:true});
    T.wall  = GL.texFromCanvas(TEX.wall(),  {repeat:true});
    T.ceil  = GL.texFromCanvas(TEX.ceil(),  {repeat:true});
    T.crate = GL.texFromCanvas(TEX.crate(), {repeat:true});
    T.panel = GL.texFromCanvas(TEX.panel(), {repeat:true});
    T.frame = GL.texFromCanvas(TEX.screen(),{repeat:true});
    T.rack  = GL.texFromCanvas(TEX.rack(3),  {repeat:false});
    T.drum  = GL.texFromCanvas(TEX.drum(17), {repeat:false});
    T.glowC = GL.texFromCanvas(TEX.glow('#7fd7ff'));
    T.glowW = GL.texFromCanvas(TEX.glow('#ffffff'));
    T.glowR = GL.texFromCanvas(TEX.glow('#ff7a5a'));
    T.glowG = GL.texFromCanvas(TEX.glow('#6effc4'));
    T.dot   = GL.texFromCanvas(TEX.dot());
    T.plan  = GL.texFromCanvas(PLAN.draw(null), {repeat:false, mip:false});
    T.gun   = GL.texFromCanvas(TEX.gunSkin(), {repeat:false});
  }

  /* ---------- 房间几何(静态批次) ----------
     巨幕 = 一整面墙(-Z 墙)。贴图 2560×1024,几何按同比例铺满墙宽。
     贴图内部:中央是 16:15 的作战平面图,两翼是实时数据面板。 */
  const B = {};
  const SCREEN_Z = -WORLD.D/2 + 0.05;
  const SCR_W  = WORLD.W - 0.5;                 // 几乎占满整面墙(梦里的"一整块巨大的屏幕")
  const SCR_H  = SCR_W * PLAN.PH / PLAN.PW;     // 按贴图 2560×1024 比例 → 约 6.2m
  const SCR_Y0 = 0.16;                          // 底边贴近地面,像一面落地的墙
  /* 地图子区域在屏幕上的实际几何位置(米) */
  const MAP_X0 = -SCR_W/2 + PLAN.MX/PLAN.PW*SCR_W;
  const MAP_W  = PLAN.IW/PLAN.PW*SCR_W;
  const MAP_Y0 = SCR_Y0 + (1 - (PLAN.MY+PLAN.IH)/PLAN.PH)*SCR_H;
  const MAP_H  = PLAN.IH/PLAN.PH*SCR_H;

  function buildStatic(){
    B.room   = new GL.Batch(T.wall,  'opaque');
    B.floor  = new GL.Batch(T.floor, 'opaque');
    B.ceil   = new GL.Batch(T.ceil,  'opaque');
    B.crate  = new GL.Batch(T.crate, 'opaque');
    B.panelB = new GL.Batch(T.panel, 'opaque');
    B.frame  = new GL.Batch(T.frame, 'opaque');
    B.rack   = new GL.Batch(T.rack, 'cutout');
    B.drum   = new GL.Batch(T.drum, 'cutout');

    const W=WORLD.W, D=WORLD.D, H=WORLD.H;
    const TS=1.05;  // 墙面贴图密度:约 1m 一块板(512 贴图 → 4 个 128 子格)
    /* 地板 */
    B.floor.quad([-W/2,0,D/2],[W/2,0,D/2],[W/2,0,-D/2],[-W/2,0,-D/2],
                 0,0, W*0.55, D*0.55, 0,1,0, [1,1,1,1]);
    /* 天花 */
    B.ceil.quad([-W/2,H,-D/2],[W/2,H,-D/2],[W/2,H,D/2],[-W/2,H,D/2],
                 0,0, W*0.35, D*0.35, 0,-1,0, [0.85,0.88,0.95,1]);
    /* 四面墙(内表面) */
    const wc=[1,1,1,1];
    // 后墙 (+Z)
    B.room.quad([W/2,0,D/2],[-W/2,0,D/2],[-W/2,H,D/2],[W/2,H,D/2], 0,0, W*TS,H*TS, 0,0,-1, wc);
    // 左墙 (-X)
    B.room.quad([-W/2,0,D/2],[-W/2,0,-D/2],[-W/2,H,-D/2],[-W/2,H,D/2], 0,0, D*TS,H*TS, 1,0,0, wc);
    // 右墙 (+X)
    B.room.quad([W/2,0,-D/2],[W/2,0,D/2],[W/2,H,D/2],[W/2,H,-D/2], 0,0, D*TS,H*TS, -1,0,0, wc);
    // 前墙 (-Z):巨幕以外的部分(上/下/左/右四条边)
    const z=-D/2, sx0=-SCR_W/2, sx1=SCR_W/2, sy0=SCR_Y0, sy1=SCR_Y0+SCR_H;
    const fq=(x0,y0,x1,y1)=>{
      if(x1-x0<=0.001||y1-y0<=0.001) return;
      B.room.quad([x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],
        0,0,(x1-x0)*TS,(y1-y0)*TS, 0,0,1, wc);
    };
    fq(-W/2,0,   W/2, sy0);      // 下条(基座)
    fq(-W/2,sy1, W/2, H);        // 上条
    fq(-W/2,sy0, sx0, sy1);      // 左条
    fq(sx1, sy0, W/2, sy1);      // 右条

    /* 巨幕外框(有厚度的金属框) */
    const fr=0.15, fz=z+0.02;
    const frameCol=[0.62,0.70,0.84,1];
    const fb=(cx,cy,sx,sy)=>B.frame.quad(
      [cx-sx/2,cy-sy/2,fz],[cx+sx/2,cy-sy/2,fz],[cx+sx/2,cy+sy/2,fz],[cx-sx/2,cy+sy/2,fz],
      0,0,Math.max(sx,0.1)*0.6,Math.max(sy,0.1)*0.6, 0,0,1, frameCol);
    fb(0, sy0-fr/2, SCR_W+fr*2, fr);
    fb(0, sy1+fr/2, SCR_W+fr*2, fr);
    fb(sx0-fr/2, (sy0+sy1)/2, fr, SCR_H+fr*2);
    fb(sx1+fr/2, (sy0+sy1)/2, fr, SCR_H+fr*2);

    /* 巨幕落地基座:一道浅台阶,标示"不要贴到幕上" */
    B.crate.box(0, 0.075, z+0.52, W-0.4, 0.15, 1.0, 0.5, [0.74,0.78,0.88,1], {ny:true, nz:true});

    /* ---- 后墙:封死的气密门 + 壁挂控制台 ----
       强化梦里的封闭感:这个房间没有出口,你只能待在里面。*/
    {
      const bz=D/2-0.06;
      const doorW=3.4, doorH=3.6;
      // 门框凹陷
      B.frame.quad([ doorW/2+0.28, 0, bz],[-doorW/2-0.28, 0, bz],
                   [-doorW/2-0.28, doorH+0.28, bz],[ doorW/2+0.28, doorH+0.28, bz],
                   0,0, 2.4, 2.4, 0,0,-1, [0.52,0.57,0.68,1]);
      // 门扇(左右对开,中间一道缝)
      for(const sgn of [-1,1]){
        B.panelB.quad([sgn>0? doorW/2:0.035, 0, bz-0.02],[sgn>0? 0.035:-doorW/2, 0, bz-0.02],
                      [sgn>0? 0.035:-doorW/2, doorH, bz-0.02],[sgn>0? doorW/2:0.035, doorH, bz-0.02],
                      0,0, 1.7, 3.4, 0,0,-1, [0.80,0.84,0.94,1]);
      }
      // 门上警示灯带(红色,表示锁死)
      B.trimRed = B.trimRed || new GL.Batch(T.frame,'opaque');
      B.trimRed.quad([ doorW/2+0.28, doorH+0.30, bz-0.01],[-doorW/2-0.28, doorH+0.30, bz-0.01],
                     [-doorW/2-0.28, doorH+0.44, bz-0.01],[ doorW/2+0.28, doorH+0.44, bz-0.01],
                     0,0, 3, 0.2, 0,0,-1, [2.2,0.55,0.42,1]);
      // 两侧壁挂控制台
      for(const sgn of [-1,1]){
        const cx=sgn*6.4;
        B.panelB.box(cx, 1.05, D/2-0.34, 2.6, 0.14, 0.62, 0.8, [0.80,0.84,0.92,1], {pz:true});
        B.frame.quad([cx-1.2, 1.14, D/2-0.66],[cx+1.2, 1.14, D/2-0.66],
                     [cx+1.2, 1.90, D/2-0.66],[cx-1.2, 1.90, D/2-0.66],
                     0,0, 1.6, 0.9, 0,0,-1, [1.15,1.30,1.55,1]);
      }
    }

    /* 障碍物 */
    for(const o of WORLD.layout){
      if(o.type==='prop'){
        // 设备:高的用机柜,矮的用器材桶。交叉片 → 从任意角度都有体积
        if(o.h>1.2) B.rack.cross(o.x, 0, o.z, 1.05, o.h, [1,1,1,1], hash2(o.z,o.x)*3);
        else        B.drum.cross(o.x, 0, o.z, 0.92, o.h, [1,1,1,1], hash2(o.z,o.x)*3);
        continue;
      }
      if(o.type==='pillar'){
        B.panelB.box(o.x, o.h/2, o.z, o.sx, o.h, o.sz, 0.55, [0.86,0.90,0.98,1], {py:true,ny:true});
        // 柱顶灯带
        B.frame.quad([o.x-o.sx/2,o.h-0.12,o.z+o.sz/2+0.005],[o.x+o.sx/2,o.h-0.12,o.z+o.sz/2+0.005],
                     [o.x+o.sx/2,o.h-0.02,o.z+o.sz/2+0.005],[o.x-o.sx/2,o.h-0.02,o.z+o.sz/2+0.005],
                     0,0,1,0.2, 0,0,1, [1.4,1.1,0.6,1]);
        continue;
      }
      if(o.type==='panel'){
        B.panelB.box(o.x, o.h/2, o.z, o.sx, o.h, o.sz, 0.55, [1,1,1,1], {ny:true});
        continue;
      }
      // 箱子:堆叠感
      B.crate.box(o.x, o.h/2, o.z, o.sx, o.h, o.sz, 0.85, [1,1,1,1], {ny:true});
      if(o.h>1.3 && hash2(o.x,o.z)>0.55){
        const s2=o.sx*0.55;
        B.crate.box(o.x+ (hash2(o.z,o.x)-0.5)*0.25, o.h+s2/2, o.z+(hash2(o.x*3,o.z)-0.5)*0.25,
                    s2, s2, s2, 1.2, [0.92,0.95,1,1], {ny:true});
      }
    }

    /* 天花灯具:3×3 阵列,与着色器里的光池位置一致 */
    B.lamp = new GL.Batch(T.frame,'opaque');
    B.lampGlow = new GL.Batch(T.glowW,'add');
    for(let i=-1;i<=1;i++){
      for(let j=-1;j<=1;j++){
        const lx=j*5.2, lz=i*4.6;
        // 灯槽外框(挂在天花板下方)
        B.lamp.box(lx, WORLD.H-0.10, lz, 2.5, 0.18, 0.42, 0.7, [0.60,0.66,0.78,1], {py:true});
        // 发光面
        B.lamp.quad([lx-1.15, WORLD.H-0.20, lz+0.17],[lx+1.15, WORLD.H-0.20, lz+0.17],
                    [lx+1.15, WORLD.H-0.20, lz-0.17],[lx-1.15, WORLD.H-0.20, lz-0.17],
                    0,0,1.2,0.2, 0,-1,0, [2.6,2.5,2.3,1]);
      }
    }

    /* 墙脚灯带 */
    B.trim = new GL.Batch(T.frame,'opaque');
    const trimCol=[1.25,1.05,0.62,1];
    const tq=(a,b,c,d)=>B.trim.quad(a,b,c,d,0,0,4,0.12,0,1,0,trimCol);
    // 沿三面墙脚
    tq([-W/2+0.02,0.055,D/2-0.02],[W/2-0.02,0.055,D/2-0.02],[W/2-0.02,0.055,D/2-0.14],[-W/2+0.02,0.055,D/2-0.14]);
    tq([-W/2+0.14,0.055,-D/2+0.02],[-W/2+0.14,0.055,D/2-0.02],[-W/2+0.02,0.055,D/2-0.02],[-W/2+0.02,0.055,-D/2+0.02]);
    tq([W/2-0.02,0.055,-D/2+0.02],[W/2-0.02,0.055,D/2-0.02],[W/2-0.14,0.055,D/2-0.02],[W/2-0.14,0.055,-D/2+0.02]);
  }

  /* ---------- 巨幕平面(动态贴图,铺满整面墙) ---------- */
  let planBatch=null;
  function buildScreenQuad(){
    planBatch=new GL.Batch(T.plan,'alpha');
    planBatch.quad(
      [-SCR_W/2, SCR_Y0,       SCREEN_Z],
      [ SCR_W/2, SCR_Y0,       SCREEN_Z],
      [ SCR_W/2, SCR_Y0+SCR_H, SCREEN_Z],
      [-SCR_W/2, SCR_Y0+SCR_H, SCREEN_Z],
      0,0,1,1, 0,0,1, [1,1,1,1]);
    planBatch.upload();
  }

  /* ---------- 屏幕射线求交 ----------
     返回 UV(整块屏幕)与命中的对面房间坐标(仅当落在中央地图区内有效) */
  function raycastScreen(ex,ey,ez, dx,dy,dz){
    if(dz>=-1e-6) return null;                     // 背对巨幕
    const t=(SCREEN_Z-ez)/dz;
    if(t<=0) return null;
    const hx=ex+dx*t, hy=ey+dy*t;
    const u=(hx+SCR_W/2)/SCR_W;
    const v=(hy-SCR_Y0)/SCR_H;
    return {u,v,t, x:hx,y:hy, onScreen: u>=0&&u<=1&&v>=0&&v<=1};
  }

  /* ---------- 粒子系统 ---------- */
  const PMAX=420;
  const P={x:new Float32Array(PMAX),y:new Float32Array(PMAX),z:new Float32Array(PMAX),
           vx:new Float32Array(PMAX),vy:new Float32Array(PMAX),vz:new Float32Array(PMAX),
           life:new Float32Array(PMAX),max:new Float32Array(PMAX),
           size:new Float32Array(PMAX),kind:new Uint8Array(PMAX),
           r:new Float32Array(PMAX),g:new Float32Array(PMAX),b:new Float32Array(PMAX)};
  let pn=0;
  function emit(x,y,z,vx,vy,vz,life,size,kind,col){
    let i = pn<PMAX ? pn++ : (Math.random()*PMAX)|0;
    P.x[i]=x;P.y[i]=y;P.z[i]=z; P.vx[i]=vx;P.vy[i]=vy;P.vz[i]=vz;
    P.life[i]=life; P.max[i]=life; P.size[i]=size; P.kind[i]=kind;
    P.r[i]=col[0];P.g[i]=col[1];P.b[i]=col[2];
  }
  function burstSparks(x,y,z,n,col,spd){
    for(let i=0;i<n;i++){
      const a=Math.random()*U.TAU, e=Math.random()*1.4-0.1;
      const s=spd*(0.4+Math.random()*0.9);
      emit(x,y,z, Math.cos(a)*Math.cos(e)*s, Math.sin(e)*s+0.7, Math.sin(a)*Math.cos(e)*s,
           0.3+Math.random()*0.5, 0.03+Math.random()*0.05, 1, col);
    }
  }
  function smokePuff(x,y,z,n){
    for(let i=0;i<n;i++){
      emit(x+U.rand(-0.1,0.1), y+U.rand(-0.05,0.1), z+U.rand(-0.1,0.1),
           U.rand(-0.25,0.25), U.rand(0.15,0.5), U.rand(-0.25,0.25),
           0.6+Math.random()*0.7, 0.16+Math.random()*0.2, 2, [0.55,0.62,0.72]);
    }
  }
  function updateParticles(dt){
    for(let i=0;i<pn;i++){
      if(P.life[i]<=0) continue;
      P.life[i]-=dt;
      if(P.kind[i]===1){ P.vy[i]-=9.4*dt; }              // 火花受重力
      else { P.vy[i]+=0.25*dt; P.vx[i]*=0.965; P.vz[i]*=0.965; } // 烟上浮
      P.x[i]+=P.vx[i]*dt; P.y[i]+=P.vy[i]*dt; P.z[i]+=P.vz[i]*dt;
      if(P.y[i]<0.02 && P.kind[i]===1){ P.y[i]=0.02; P.vy[i]*=-0.35; P.vx[i]*=0.6; P.vz[i]*=0.6; }
    }
  }

  /* ---------- 弹道 & 屏幕命中光斑 ---------- */
  const tracers=[];     // 玩家射向巨幕的弹道
  const screenBlips=[]; // 巨幕表面命中光斑
  const roomFx=[];      // 房间内的立体光效(敌方弹着 / 侦测器)
  function addTracer(ax,ay,az,bx,by,bz,col){ tracers.push({ax,ay,az,bx,by,bz,t:0,life:0.11,col:col||[1.6,1.3,0.7]}); }
  function addBlip(x,y,col,size){ screenBlips.push({x,y,t:0,life:0.85,col:col||[1,0.8,0.45],size:size||0.9}); }
  function addRoomFx(x,z,type,rad){ roomFx.push({x,z,t:0,life:type==='scan'?1.6:1.1,type,rad:rad||1}); }

  /* ---------- 动态批次(每帧重建) ---------- */
  let DB={};
  function initDyn(){
    DB.add   = new GL.Batch(T.glowW,'add');    DB.add.stream=true;
    DB.addC  = new GL.Batch(T.glowC,'add');    DB.addC.stream=true;
    DB.addR  = new GL.Batch(T.glowR,'add');    DB.addR.stream=true;
    DB.addG  = new GL.Batch(T.glowG,'add');    DB.addG.stream=true;
    DB.dot   = new GL.Batch(T.dot,'add');      DB.dot.stream=true;
    DB.gun   = new GL.Batch(T.gun,'cutout');   DB.gun.stream=true;
  }

  /* 对面房间某点 → 巨幕表面几何坐标(用于在幕上打光斑) */
  function world2screen(wx,wz){
    const pu = PLAN.wx2px(wx)/PLAN.PW;
    const pv = 1 - PLAN.wz2py(wz)/PLAN.PH;
    return { x:(pu-0.5)*SCR_W, y: SCR_Y0 + pv*SCR_H };
  }
  /* 巨幕 UV → 对面房间世界坐标(仅中央地图区有效) */
  function screenUV2world(u,v){
    return PLAN.uv2world(u,v);
  }

  return { T, B, DB, initTextures, buildStatic, buildScreenQuad, initDyn,
           get planBatch(){return planBatch;},
           SCREEN_Z, SCR_W, SCR_H, SCR_Y0, MAP_W, MAP_H,
           raycastScreen, world2screen, screenUV2world,
           P, get pn(){return pn;}, emit, burstSparks, smokePuff, updateParticles,
           tracers, screenBlips, roomFx, addTracer, addBlip, addRoomFx };
})();
