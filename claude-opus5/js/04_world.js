'use strict';
/* ============ 坐标猎场 · 房间世界构建 ============
   两间完全一样的房间:玩家房(SECTOR-A)与对面房(SECTOR-B)。
   W=16m 宽(X)· D=15m 深(Z)· 挑高 6.4m。巨幕占据 -Z 整面墙。
   两间房共享同一份布局数组 —— 梦里的设定:一模一样的空间。
*/

/* ---- 房间尺寸(用户锁定:16m 宽 × 15m 深) ---- */
const ROOM_W = 16, ROOM_D = 15;
const ROOM_H = 6.4;   // 挑高的阶梯教室式空间,让巨幕真正"占满整面墙"

/* 布局槽位:障碍物列表
   type: box(板条箱) | panel(半高隔板) | pillar(承重柱) | prop(设备机柜/器材桶)

   设计约束(重要):巨幕是玩家的全部信息来源。
   因此靠幕一侧的"观幕区"不放任何高于视线的物体 —— 玩家在房间任何位置
   都必须能看见完整的巨幕。高障碍全部压在房间后半部(z > SAFE_Z),
   前半部只放及腰掩体,不挡视线但提供走位参照与落点判定。*/
function genLayout(seed){
  const rng = (()=>{ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
  const R=(a,b)=>a+rng()*(b-a);
  const layout=[];
  const SAFE_Z = 0.7;            // 这条线之前(靠幕侧)不放高物

  /* 后区立柱 ×2:视觉锚点,不遮挡巨幕 */
  for(const [x,z] of [[-5.6, 4.4],[5.6, 4.4]]){
    layout.push({type:'pillar',x,z,sx:1.0,sz:1.0,h:ROOM_H});
  }
  /* 后区高箱:堆叠掩体(1.0~1.4m 见方,高及胸 —— 人的尺度) */
  const nBox=9;
  let guard=0;
  for(let i=0;i<nBox && guard<200;i++){
    guard++;
    const x=R(-13.2,13.2), z=R(SAFE_Z+0.6, 6.2);
    if(tooClose(layout,x,z,2.2)){ i--; continue; }
    const s=R(0.95,1.35);
    layout.push({type:'box',x,z,sx:s,sz:s,h:R(1.25,1.65)});
  }
  /* 前区(观幕区)半高掩体:不挡视线,能当身位参照 */
  const nLow=8;
  for(let i=0;i<nLow && guard<400;i++){
    guard++;
    const x=R(-13.4,13.4), z=R(-6.2, SAFE_Z-0.3);
    if(tooClose(layout,x,z,2.1)){ i--; continue; }
    const s=R(0.85,1.25);
    layout.push({type:'box',x,z,sx:s,sz:s*R(0.8,1.2),h:R(0.62,0.95)});
  }
  /* 长条隔板 ×4:走位分割 */
  const panels=[
    {horiz:true , x:R(-9,-3), z:R(1.6,3.2)},
    {horiz:true , x:R(3,9)  , z:R(1.6,3.2)},
    {horiz:false, x:R(-12,-8), z:R(-3.5,-0.5)},
    {horiz:false, x:R(8,12) , z:R(-3.5,-0.5)},
  ];
  for(const p of panels){
    const len=R(2.6,3.8);
    layout.push({type:'panel', x:p.x, z:p.z,
      sx:p.horiz?len:0.42, sz:p.horiz?0.42:len, h:1.30});
  }
  /* 设备:机柜 / 器材桶 ×7 —— 装饰 + 走位参照 */
  for(let i=0;i<7 && guard<600;i++){
    guard++;
    const x=R(-13.6,13.6), z=R(-6.4,6.4);
    if(tooClose(layout,x,z,1.9)){ i--; continue; }
    layout.push({type:'prop',x,z,sx:0.80,sz:0.80,h:R(0.85,1.75)});
  }
  return layout;
}
const WORLD_H=ROOM_H;
function tooClose(list,x,z,d){
  for(const o of list){ if(U.dist(x,z,o.x,o.z)<d) return true; }
  // 出生点周围留空
  if(U.dist(x,z, 0, 3.6)<2.2) return true;
  if(U.dist(x,z, 0,-3.6)<2.2) return true;
  return false;
}
/* 两间房间共享同一份布局(梦里的设定:一模一样的空间) */
const WORLD = {
  W:ROOM_W, D:ROOM_D, H:ROOM_H,
  seed: 20260904,
  layout: genLayout(20260904),
  playerSpawn:{x:0.0, z:3.6, yaw:0},       // 房间中轴靠后 → 开局正对整块巨幕
  enemySpawn:{x:0.0, z:-3.6, yaw:Math.PI},
  startPos(){ return Object.assign({},this.playerSpawn); },
};

/* —— 碰撞 —— */
const COLL = {
  /* 圆形玩家 vs 障碍盒子 & 墙 */
  resolve(px,pz,r){
    // 墙
    const m=0.25+r;
    if(px< -WORLD.W/2+m) px=-WORLD.W/2+m;
    if(px>  WORLD.W/2-m) px= WORLD.W/2-m;
    if(pz< -WORLD.D/2+m) pz=-WORLD.D/2+m;
    if(pz>  WORLD.D/2-m) pz= WORLD.D/2-m;
    // 障碍
    for(const o of WORLD.layout){
      const hx=o.sx/2+r, hz=o.sz/2+r;
      const dx=px-o.x, dz=pz-o.z;
      if(Math.abs(dx)<hx && Math.abs(dz)<hz){
        const ox=hx-Math.abs(dx), oz=hz-Math.abs(dz);
        if(ox<oz) px=o.x+Math.sign(dx||1)*hx;
        else pz=o.z+Math.sign(dz||1)*hz;
      }
    }
    return [px,pz];
  },
  /* 两点间是否有实体阻挡(供 AI 走位评估用) */
  losClear(ax,az,bx,bz){
    const steps=Math.ceil(U.dist(ax,az,bx,bz)/0.15);
    for(let i=1;i<steps;i++){
      const t=i/steps, x=ax+(bx-ax)*t, z=az+(bz-az)*t;
      for(const o of WORLD.layout){
        if(o.type==='prop') continue;
        if(Math.abs(x-o.x)<o.sx/2 && Math.abs(z-o.z)<o.sz/2) return false;
      }
    }
    return true;
  },
  /* 子弹在地面平面上的终点是否落进掩体(用于弹着点特效) */
  coverAt(x,z){
    for(const o of WORLD.layout){
      if(o.type==='prop') continue;
      if(Math.abs(x-o.x)<o.sx/2 && Math.abs(z-o.z)<o.sz/2) return o;
    }
    return null;
  }
};
