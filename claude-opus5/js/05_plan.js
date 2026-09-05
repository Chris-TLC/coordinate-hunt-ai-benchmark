'use strict';
/* ============ 坐标猎场 · 巨幕 ============
   这是游戏的灵魂。一整面墙就是一块屏幕(2560×1024 动态贴图):
     · 正中央 —— 对面房间的作战平面图,严格保持 16:15 真实比例(要靠它瞄准,不能拉伸)
     · 左右两翼 —— 实时战术数据(战况日志、装备状态、威胁评估)
   屏幕上永远看不到人。只有痕迹:开火光团、移动残痕、侦测扫描、命中回执。
*/
const PLAN = (() => {
  const PW=2560, PH=1024;
  const cnv=document.createElement('canvas'); cnv.width=PW; cnv.height=PH;
  const g=cnv.getContext('2d');

  /* ---- 地图子区域(严格 16:15) ---- */
  const MPAD=54;
  const IH = PH - MPAD*2;                    // 916
  const IW = IH * WORLD.W / WORLD.D;         // 977 —— 真实比例
  const MX = (PW - IW)/2;                    // 地图左上角 x
  const MY = MPAD;                           // 地图左上角 y
  const MPP = IW/WORLD.W;                    // 每米像素

  /* 世界坐标 ↔ 贴图像素 */
  function wx2px(x){ return MX + (x+WORLD.W/2)/WORLD.W*IW; }
  function wz2py(z){ return MY + (z+WORLD.D/2)/WORLD.D*IH; }
  function px2wx(px){ return (px-MX)/IW*WORLD.W - WORLD.W/2; }
  function py2wz(py){ return (py-MY)/IH*WORLD.D - WORLD.D/2; }

  /* ---- 静态底图 ---- */
  let baseCache=null;
  function buildBase(){
    const c=document.createElement('canvas'); c.width=PW; c.height=PH;
    const b=c.getContext('2d');
    /* 整面屏幕底色 */
    const bg=b.createLinearGradient(0,0,PW,PH);
    bg.addColorStop(0,'#040a14'); bg.addColorStop(0.5,'#061020'); bg.addColorStop(1,'#040a16');
    b.fillStyle=bg; b.fillRect(0,0,PW,PH);
    // 全屏极淡网格
    b.strokeStyle='rgba(60,120,190,0.045)'; b.lineWidth=1;
    for(let x=0;x<PW;x+=64){ b.beginPath(); b.moveTo(x,0); b.lineTo(x,PH); b.stroke(); }
    for(let y=0;y<PH;y+=64){ b.beginPath(); b.moveTo(0,y); b.lineTo(PW,y); b.stroke(); }

    /* ======== 中央:作战平面图 ======== */
    // 地图底
    const mg=b.createLinearGradient(MX,MY,MX+IW,MY+IH);
    mg.addColorStop(0,'#06111f'); mg.addColorStop(0.5,'#08182a'); mg.addColorStop(1,'#06101d');
    b.fillStyle=mg; b.fillRect(MX,MY,IW,IH);
    // 细网格 0.5m
    b.strokeStyle='rgba(85,150,220,0.06)'; b.lineWidth=1;
    for(let x=0;x<=WORLD.W;x+=0.5){ const px=wx2px(x-WORLD.W/2); b.beginPath(); b.moveTo(px,MY); b.lineTo(px,MY+IH); b.stroke(); }
    for(let z=0;z<=WORLD.D;z+=0.5){ const py=wz2py(z-WORLD.D/2); b.beginPath(); b.moveTo(MX,py); b.lineTo(MX+IW,py); b.stroke(); }
    // 粗网格 2m
    b.strokeStyle='rgba(100,175,245,0.17)'; b.lineWidth=1.8;
    for(let x=0;x<=WORLD.W;x+=2){ const px=wx2px(x-WORLD.W/2); b.beginPath(); b.moveTo(px,MY); b.lineTo(px,MY+IH); b.stroke(); }
    for(let z=0;z<=WORLD.D;z+=2){ const py=wz2py(z-WORLD.D/2); b.beginPath(); b.moveTo(MX,py); b.lineTo(MX+IW,py); b.stroke(); }
    // 外轮廓
    b.strokeStyle='rgba(160,225,255,0.9)'; b.lineWidth=5; b.strokeRect(MX,MY,IW,IH);
    b.strokeStyle='rgba(110,190,255,0.22)'; b.lineWidth=14; b.strokeRect(MX-5,MY-5,IW+10,IH+10);
    // 四角
    b.strokeStyle='rgba(170,230,255,0.95)'; b.lineWidth=5;
    const CL=40;
    [[MX,MY,1,1],[MX+IW,MY,-1,1],[MX,MY+IH,1,-1],[MX+IW,MY+IH,-1,-1]].forEach(([x,y,sx,sy])=>{
      b.beginPath(); b.moveTo(x+sx*CL,y); b.lineTo(x,y); b.lineTo(x,y+sy*CL); b.stroke();
    });
    // 障碍物投影
    for(const o of WORLD.layout){
      const x=wx2px(o.x-o.sx/2), y=wz2py(o.z-o.sz/2);
      const w=o.sx*MPP, h=o.sz*(IH/WORLD.D);
      if(o.type==='prop'){
        b.fillStyle='rgba(120,175,225,0.15)';
        b.beginPath(); b.arc(x+w/2,y+h/2, w*0.60, 0, U.TAU); b.fill();
        b.strokeStyle='rgba(150,205,255,0.42)'; b.lineWidth=2;
        b.beginPath(); b.arc(x+w/2,y+h/2, w*0.60, 0, U.TAU); b.stroke();
        for(let i=0;i<5;i++){ const a=i/5*U.TAU+0.4;
          b.beginPath(); b.moveTo(x+w/2,y+h/2);
          b.lineTo(x+w/2+Math.cos(a)*w*0.52, y+h/2+Math.sin(a)*w*0.52); b.stroke(); }
        continue;
      }
      if(o.type==='pillar'){
        b.fillStyle='rgba(155,195,245,0.30)'; b.fillRect(x,y,w,h);
        b.strokeStyle='rgba(195,235,255,0.92)'; b.lineWidth=3.5; b.strokeRect(x,y,w,h);
        b.save(); b.beginPath(); b.rect(x,y,w,h); b.clip();
        b.strokeStyle='rgba(205,240,255,0.5)'; b.lineWidth=2.5;
        for(let i=-h;i<w;i+=10){ b.beginPath(); b.moveTo(x+i,y+h); b.lineTo(x+i+h,y); b.stroke(); }
        b.restore();
        continue;
      }
      const half = (o.type==='panel'||o.h<1.4);
      b.fillStyle = half? 'rgba(105,155,210,0.14)' : 'rgba(120,175,230,0.24)';
      b.fillRect(x,y,w,h);
      b.strokeStyle= half? 'rgba(150,205,255,0.5)':'rgba(175,225,255,0.8)';
      b.lineWidth= half?2.5:3.5;
      if(half) b.setLineDash([10,6]);
      b.strokeRect(x,y,w,h);
      b.setLineDash([]);
      if(!half){
        b.strokeStyle='rgba(150,200,250,0.28)'; b.lineWidth=1.6;
        b.beginPath(); b.moveTo(x,y); b.lineTo(x+w,y+h); b.moveTo(x+w,y); b.lineTo(x,y+h); b.stroke();
      }
    }
    // 刻度
    b.font='600 17px ui-monospace,Menlo,monospace';
    b.fillStyle='rgba(120,185,240,0.5)'; b.textAlign='center'; b.textBaseline='middle';
    for(let x=0;x<=WORLD.W;x+=2) b.fillText(String(x), wx2px(x-WORLD.W/2), MY-24);
    b.textAlign='right';
    for(let z=0;z<=WORLD.D;z+=2) b.fillText(String(z), MX-16, wz2py(z-WORLD.D/2));
    // 方位标注
    b.textAlign='center'; b.font='700 19px ui-monospace,Menlo,monospace';
    b.fillStyle='rgba(255,180,84,0.46)';
    b.fillText('▲  他 的 巨 幕  ▲', MX+IW/2, MY+IH+34);
    b.fillStyle='rgba(110,175,235,0.34)';
    b.fillText('▼  他 的 后 墙  ▼', MX+IW/2, MY-44);
    b.font='700 22px ui-monospace,Menlo,monospace';
    b.textAlign='left'; b.fillStyle='rgba(150,215,255,0.6)';
    b.fillText('SECTOR-B', MX+6, MY-44);
    b.textAlign='right'; b.font='600 17px ui-monospace,Menlo,monospace';
    b.fillStyle='rgba(105,160,215,0.45)';
    b.fillText('16.0 × 15.0 m', MX+IW-6, MY-44);

    /* ======== 两翼:面板底纹 ======== */
    const sideW = MX - 78;
    for(const side of [0,1]){
      const sx = side? MX+IW+34 : 44;
      // 面板底
      const pg=b.createLinearGradient(sx,0,sx+sideW,0);
      pg.addColorStop(0,'rgba(10,24,44,0.55)'); pg.addColorStop(0.5,'rgba(12,28,50,0.42)');
      pg.addColorStop(1,'rgba(10,24,44,0.55)');
      b.fillStyle=pg; b.fillRect(sx, MPAD, sideW, IH);
      b.strokeStyle='rgba(70,130,200,0.28)'; b.lineWidth=2;
      b.strokeRect(sx, MPAD, sideW, IH);
      // 角标
      b.strokeStyle='rgba(120,195,255,0.6)'; b.lineWidth=3;
      const L=26;
      [[sx,MPAD,1,1],[sx+sideW,MPAD,-1,1],[sx,MPAD+IH,1,-1],[sx+sideW,MPAD+IH,-1,-1]].forEach(([x,y,ax,ay])=>{
        b.beginPath(); b.moveTo(x+ax*L,y); b.lineTo(x,y); b.lineTo(x,y+ay*L); b.stroke();
      });
    }
    // 屏幕整体扫描纹
    b.fillStyle='rgba(0,0,0,0.10)';
    for(let y=0;y<PH;y+=4) b.fillRect(0,y,PW,1.7);
    return c;
  }

  /* ---- 情报层 ---- */
  const marks=[];
  const MARK={ FLASH:'flash', TRAIL:'trail', IMPACT:'impact', HIT:'hit',
               SCAN:'scan', SCANHIT:'scanhit', PING:'ping', HEAT:'heat' };
  function add(type,x,z,opt){
    marks.push(Object.assign({type,x,z,t:0,life:1},opt||{}));
    if(marks.length>240) marks.splice(0,40);
  }
  function clear(){ marks.length=0; log.length=0; }
  function update(dt){
    for(let i=marks.length-1;i>=0;i--){
      const m=marks[i]; m.t+=dt;
      if(m.t>m.life) marks.splice(i,1);
    }
    for(let i=log.length-1;i>=0;i--){ log[i].t+=dt; }
    while(log.length>7) log.shift();
  }
  /* 屏幕上的战况日志 */
  const log=[];
  function pushLog(text,kind){ log.push({text,kind:kind||'i',t:0}); }

  /* ---- 主绘制 ---- */
  let sweep=0;
  function draw(st){
    if(!baseCache) baseCache=buildBase();
    g.clearRect(0,0,PW,PH);
    g.drawImage(baseCache,0,0);
    sweep=(sweep+0.0030)%1;

    /* 地图区裁剪绘制 */
    g.save();
    g.beginPath(); g.rect(MX-3,MY-3,IW+6,IH+6); g.clip();

    // 扫描线
    const sy=MY + sweep*IH;
    const lg=g.createLinearGradient(0,sy-80,0,sy+14);
    lg.addColorStop(0,'rgba(110,200,255,0)');
    lg.addColorStop(0.75,'rgba(110,200,255,0.05)');
    lg.addColorStop(1,'rgba(160,225,255,0.15)');
    g.fillStyle=lg; g.fillRect(MX,Math.max(MY,sy-80),IW,94);

    drawMarks();

    /* 玩家瞄准 */
    if(st && st.aim) drawReticle(st);
    g.restore();

    /* 两翼面板内容 */
    if(st) drawWings(st);

    /* 屏幕整体泛光 */
    const eg=g.createLinearGradient(0,0,0,PH);
    eg.addColorStop(0,'rgba(80,160,255,0.09)');
    eg.addColorStop(0.5,'rgba(0,0,0,0)');
    eg.addColorStop(1,'rgba(80,160,255,0.06)');
    g.fillStyle=eg; g.fillRect(0,0,PW,PH);
    return cnv;
  }

  function drawMarks(){
    for(const m of marks){
      const k=m.t/m.life, fade=1-k;
      const px=wx2px(m.x), py=wz2py(m.z);
      switch(m.type){

      case MARK.TRAIL:{
        const a=fade*fade*0.44*(m.strong||1);
        const r=(15+k*26)*(m.strong||1);
        const rg=g.createRadialGradient(px,py,0,px,py,r);
        rg.addColorStop(0,`rgba(255,192,108,${a*0.88})`);
        rg.addColorStop(0.45,`rgba(232,152,72,${a*0.34})`);
        rg.addColorStop(1,'rgba(200,120,50,0)');
        g.fillStyle=rg; g.beginPath(); g.arc(px,py,r,0,U.TAU); g.fill();
        if(m.dx!==undefined){
          g.strokeStyle=`rgba(255,198,118,${a*0.52})`;
          g.lineWidth=4*fade+1; g.lineCap='round';
          g.beginPath(); g.moveTo(px,py);
          g.lineTo(px - m.dx*MPP*0.8, py - m.dz*MPP*0.8); g.stroke();
        }
        break;
      }
      case MARK.FLASH:{
        const a=Math.pow(fade,0.7);
        const r=28+k*96;
        const rg=g.createRadialGradient(px,py,0,px,py,r*1.25);
        rg.addColorStop(0,`rgba(255,255,255,${a*0.95})`);
        rg.addColorStop(0.16,`rgba(255,218,145,${a*0.85})`);
        rg.addColorStop(0.45,`rgba(255,124,62,${a*0.36})`);
        rg.addColorStop(1,'rgba(255,80,40,0)');
        g.fillStyle=rg; g.beginPath(); g.arc(px,py,r*1.25,0,U.TAU); g.fill();
        g.strokeStyle=`rgba(255,228,175,${a*0.8})`; g.lineWidth=4.5*fade+1.5;
        g.beginPath(); g.arc(px,py,r,0,U.TAU); g.stroke();
        if(k<0.4){
          const ca=1-k/0.4;
          g.strokeStyle=`rgba(255,246,222,${ca*0.95})`; g.lineWidth=3.5;
          const L=40+k*60;
          g.beginPath();
          g.moveTo(px-L,py); g.lineTo(px+L,py);
          g.moveTo(px,py-L); g.lineTo(px,py+L); g.stroke();
        }
        break;
      }
      case MARK.IMPACT:{
        const a=Math.pow(fade,0.8);
        const r=16+k*64;
        g.strokeStyle=`rgba(130,225,255,${a*0.85})`; g.lineWidth=4.5*fade+1.5;
        g.beginPath(); g.arc(px,py,r,0,U.TAU); g.stroke();
        g.strokeStyle=`rgba(200,245,255,${a*0.48})`; g.lineWidth=1.8;
        g.beginPath(); g.arc(px,py,r*0.55,0,U.TAU); g.stroke();
        const rg=g.createRadialGradient(px,py,0,px,py,26);
        rg.addColorStop(0,`rgba(190,240,255,${a*0.58})`);
        rg.addColorStop(1,'rgba(120,200,255,0)');
        g.fillStyle=rg; g.beginPath(); g.arc(px,py,26,0,U.TAU); g.fill();
        if(k<0.25){
          g.strokeStyle=`rgba(150,230,255,${(1-k/0.25)*0.3})`;
          g.setLineDash([7,7]); g.lineWidth=1.8;
          g.beginPath(); g.arc(px,py,(m.rad||1.1)*MPP,0,U.TAU); g.stroke();
          g.setLineDash([]);
        }
        break;
      }
      case MARK.HIT:{
        const a=Math.pow(fade,0.6);
        const r=22+k*80;
        const rg=g.createRadialGradient(px,py,0,px,py,r);
        rg.addColorStop(0,`rgba(255,255,255,${a})`);
        rg.addColorStop(0.2,`rgba(255,124,94,${a*0.9})`);
        rg.addColorStop(1,'rgba(255,50,40,0)');
        g.fillStyle=rg; g.beginPath(); g.arc(px,py,r,0,U.TAU); g.fill();
        for(let i=0;i<8;i++){
          const ang=i/8*U.TAU+0.3, L=28+k*82;
          g.strokeStyle=`rgba(255,182,152,${a*0.7})`; g.lineWidth=3.5*fade+1;
          g.beginPath();
          g.moveTo(px+Math.cos(ang)*18, py+Math.sin(ang)*18);
          g.lineTo(px+Math.cos(ang)*L, py+Math.sin(ang)*L); g.stroke();
        }
        if(k<0.65){
          g.font='800 34px ui-monospace,Menlo,monospace';
          g.textAlign='center'; g.textBaseline='middle';
          g.fillStyle=`rgba(255,228,218,${(1-k/0.65)*0.95})`;
          g.fillText('命 中', px, py-r-24);
        }
        break;
      }
      case MARK.SCAN:{
        const a=k<0.15? k/0.15 : (k>0.8? (1-k)/0.2 : 1);
        const R=(m.rad||2.6)*MPP;
        g.strokeStyle=`rgba(120,255,215,${a*0.78})`; g.lineWidth=3.2;
        g.setLineDash([14,9]); g.lineDashOffset=-m.t*40;
        g.strokeRect(px-R,py-R,R*2,R*2);
        g.setLineDash([]);
        g.fillStyle=`rgba(90,240,200,${a*0.07})`; g.fillRect(px-R,py-R,R*2,R*2);
        const sc=(m.t*1.9)%1;
        g.strokeStyle=`rgba(150,255,225,${a*0.55})`; g.lineWidth=2.4;
        g.beginPath(); g.moveTo(px-R,py-R+sc*R*2); g.lineTo(px+R,py-R+sc*R*2); g.stroke();
        g.strokeStyle=`rgba(170,255,230,${a})`; g.lineWidth=4;
        const CL=18;
        [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy])=>{
          g.beginPath();
          g.moveTo(px+sx*R-sx*CL, py+sy*R);
          g.lineTo(px+sx*R, py+sy*R);
          g.lineTo(px+sx*R, py+sy*R-sy*CL); g.stroke();
        });
        if(m.result!==undefined && k>0.25){
          g.font='800 28px ui-monospace,Menlo,monospace';
          g.textAlign='center'; g.textBaseline='middle';
          g.fillStyle = m.result? `rgba(255,124,112,${a})` : `rgba(120,235,200,${a*0.85})`;
          g.fillText(m.result?'有 人':'空', px, py-R-22);
        }
        break;
      }
      case MARK.SCANHIT:{
        const a=Math.pow(fade,0.5);
        g.strokeStyle=`rgba(255,112,102,${a*0.9})`; g.lineWidth=5;
        g.lineCap='round'; g.lineJoin='round';
        if(m.path&&m.path.length>1){
          g.beginPath();
          g.moveTo(wx2px(m.path[0][0]), wz2py(m.path[0][1]));
          for(let i=1;i<m.path.length;i++) g.lineTo(wx2px(m.path[i][0]), wz2py(m.path[i][1]));
          g.stroke();
          const last=m.path[m.path.length-1];
          const lx=wx2px(last[0]), ly=wz2py(last[1]);
          const rg=g.createRadialGradient(lx,ly,0,lx,ly,34);
          rg.addColorStop(0,`rgba(255,182,172,${a})`);
          rg.addColorStop(1,'rgba(255,80,70,0)');
          g.fillStyle=rg; g.beginPath(); g.arc(lx,ly,34,0,U.TAU); g.fill();
          g.strokeStyle=`rgba(255,222,212,${a})`; g.lineWidth=3.5;
          g.beginPath(); g.arc(lx,ly, 16+Math.sin(m.t*9)*3.5, 0, U.TAU); g.stroke();
        }
        break;
      }
      case MARK.HEAT:{
        /* 体温显影:一团呼吸着的暗红热斑。他站得越久,越亮越聚焦。 */
        const hv=m.heat||0.5;
        const a=fade*(0.30+hv*0.62);
        const r=(m.rad||1.6)*MPP*U.lerp(1.15,0.62,hv)*(1+Math.sin(m.t*2.6)*0.05);
        const rg=g.createRadialGradient(px,py,0,px,py,r);
        rg.addColorStop(0,   `rgba(255,${150-hv*60|0},${90-hv*50|0},${a*0.85})`);
        rg.addColorStop(0.35,`rgba(228,${105-hv*40|0},60,${a*0.42})`);
        rg.addColorStop(0.7, `rgba(190,70,45,${a*0.16})`);
        rg.addColorStop(1,   'rgba(150,40,30,0)');
        g.fillStyle=rg; g.beginPath(); g.arc(px,py,r,0,U.TAU); g.fill();
        // 高热时出现收敛环 + 读数
        if(hv>0.55){
          const k2=(hv-0.55)/0.45;
          g.strokeStyle=`rgba(255,170,120,${a*k2*0.8})`;
          g.lineWidth=2.2; g.setLineDash([6,7]); g.lineDashOffset=-m.t*22;
          g.beginPath(); g.arc(px,py,r*0.55,0,U.TAU); g.stroke();
          g.setLineDash([]);
          if(hv>0.8){
            g.font='700 17px ui-monospace,Menlo,monospace';
            g.textAlign='center'; g.textBaseline='middle';
            g.fillStyle=`rgba(255,190,150,${a*0.9})`;
            g.fillText('滞留', px, py-r*0.62-14);
          }
        }
        break;
      }
      case MARK.PING:{
        const a=fade*0.5;
        const r=24+k*105;
        g.strokeStyle=`rgba(190,215,240,${a*0.4})`; g.lineWidth=3*fade+1;
        g.setLineDash([4,11]);
        g.beginPath(); g.arc(px,py,r,0,U.TAU); g.stroke();
        g.setLineDash([]);
        break;
      }
      }
    }
  }

  function drawReticle(st){
    const px=wx2px(st.aim.x), py=wz2py(st.aim.z);
    const t=st.time*4;
    const ready=st.ready;
    const col= st.detectorArmed? '110,255,215' : (ready? '150,235,255' : '255,140,110');
    const R=(st.aimRad||1.1)*MPP;
    g.strokeStyle=`rgba(${col},0.95)`; g.lineWidth=3;
    g.beginPath(); g.arc(px,py,R*(1+Math.sin(t)*0.025),0,U.TAU); g.stroke();
    g.strokeStyle=`rgba(${col},0.22)`; g.lineWidth=1.4;
    g.beginPath(); g.arc(px,py,R*1.45,0,U.TAU); g.stroke();
    g.strokeStyle=`rgba(${col},1)`; g.lineWidth=4.5; g.lineCap='round';
    for(let i=0;i<4;i++){
      const a0=i*Math.PI/2-0.42+Math.sin(t*0.7)*0.03;
      g.beginPath(); g.arc(px,py,R+11,a0,a0+0.84); g.stroke();
    }
    g.fillStyle=`rgba(${col},0.95)`;
    g.beginPath(); g.arc(px,py,4,0,U.TAU); g.fill();
    g.strokeStyle=`rgba(${col},0.5)`; g.lineWidth=1.8;
    g.beginPath();
    g.moveTo(px-R*0.45,py); g.lineTo(px-8,py);
    g.moveTo(px+8,py); g.lineTo(px+R*0.45,py);
    g.moveTo(px,py-R*0.45); g.lineTo(px,py-8);
    g.moveTo(px,py+8); g.lineTo(px,py+R*0.45);
    g.stroke();
    // 坐标读数
    g.font='700 20px ui-monospace,Menlo,monospace';
    g.textAlign='left'; g.textBaseline='middle';
    g.fillStyle=`rgba(${col},0.9)`;
    g.fillText(`${(st.aim.x+WORLD.W/2).toFixed(1)} , ${(st.aim.z+WORLD.D/2).toFixed(1)}`, px+R+16, py-R-4);
    if(!ready && !st.detectorArmed){
      g.font='700 17px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(255,150,120,0.9)';
      g.fillText('装填中', px+R+16, py-R+18);
    }
    if(st.detectorArmed){
      const DR=(st.detRad||2.6)*MPP;
      g.strokeStyle='rgba(120,255,215,0.8)'; g.lineWidth=2.6;
      g.setLineDash([13,8]); g.lineDashOffset=-st.time*50;
      g.strokeRect(px-DR,py-DR,DR*2,DR*2);
      g.setLineDash([]);
      g.font='700 18px ui-monospace,Menlo,monospace'; g.textAlign='center';
      g.fillStyle='rgba(150,255,225,0.9)';
      g.fillText('侦测器 · 左键投放', px, py+DR+26);
    }
  }

  /* ======== 两翼实时数据 ======== */
  function drawWings(st){
    const sideW = MX - 78;
    /* --- 左翼:战况日志 --- */
    {
      const sx=44, sy=MPAD;
      g.save();
      g.beginPath(); g.rect(sx,sy,sideW,IH); g.clip();
      g.textAlign='left'; g.textBaseline='alphabetic';
      g.font='700 21px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(140,205,255,0.72)';
      g.fillText('战 况 记 录', sx+22, sy+40);
      g.strokeStyle='rgba(90,160,230,0.34)'; g.lineWidth=1.6;
      g.beginPath(); g.moveTo(sx+20,sy+54); g.lineTo(sx+sideW-20,sy+54); g.stroke();
      let y=sy+92;
      const COL={ hit:'255,150,120', me:'150,235,255', warn:'255,190,110',
                  ok:'120,255,200', i:'130,170,215' };
      for(let i=log.length-1;i>=0;i--){
        const e=log[i];
        const a=U.clamp(1.3-e.t/16,0.16,1);
        g.font='600 17px ui-monospace,Menlo,monospace';
        g.fillStyle=`rgba(${COL[e.kind]||COL.i},${a})`;
        // 自动折行
        const words=e.text;
        const maxw=sideW-44;
        let line='', lines=[];
        for(const ch of words){
          if(g.measureText(line+ch).width>maxw){ lines.push(line); line=ch; }
          else line+=ch;
        }
        lines.push(line);
        for(const L of lines){ g.fillText(L, sx+22, y); y+=23; }
        y+=7;
        if(y>sy+IH-30) break;
      }
      g.restore();
    }
    /* --- 右翼:装备 & 威胁 --- */
    {
      const sx=MX+IW+34, sy=MPAD;
      g.save();
      g.beginPath(); g.rect(sx,sy,sideW,IH); g.clip();
      g.textAlign='left';
      g.font='700 21px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(140,205,255,0.72)';
      g.fillText('系 统 状 态', sx+22, sy+40);
      g.strokeStyle='rgba(90,160,230,0.34)'; g.lineWidth=1.6;
      g.beginPath(); g.moveTo(sx+20,sy+54); g.lineTo(sx+sideW-20,sy+54); g.stroke();

      const bar=(y,label,v,color,txt)=>{
        g.font='600 16px ui-monospace,Menlo,monospace';
        g.fillStyle='rgba(125,170,215,0.66)';
        g.fillText(label, sx+22, y);
        if(txt){ g.textAlign='right'; g.fillStyle=`rgba(${color},0.9)`;
                 g.fillText(txt, sx+sideW-22, y); g.textAlign='left'; }
        const bw=sideW-44, bh=11, by=y+9;
        g.fillStyle='rgba(255,255,255,0.06)'; g.fillRect(sx+22,by,bw,bh);
        g.fillStyle=`rgba(${color},0.85)`; g.fillRect(sx+22,by,Math.max(2,bw*U.clamp(v,0,1)),bh);
        g.strokeStyle='rgba(255,255,255,0.10)'; g.lineWidth=1;
        g.strokeRect(sx+22,by,bw,bh);
        return by+bh+30;
      };
      let y=sy+96;
      y=bar(y,'我方生命', st.hp/100, st.hp<=35?'255,100,84':'110,230,255', String(Math.max(0,st.hp|0)));
      y=bar(y,'目标生命', st.ehp/100, '255,150,110', String(Math.max(0,st.ehp|0)));
      y+=6;
      y=bar(y,'弹匣', st.ammo/st.ammoMax, '255,200,120', `${st.ammo} / ${st.ammoMax}`);
      y=bar(y,'侦测器', st.detK, st.detK>=1?'120,255,215':'110,190,175',
            st.detK>=1?'就绪':`${st.detCd.toFixed(1)}s`);
      y+=14;

      // 命中统计
      g.font='600 16px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(125,170,215,0.66)';
      g.fillText('猜中率', sx+22, y);
      g.textAlign='right';
      g.font='800 30px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(170,230,255,0.9)';
      const acc = st.shots? Math.round(st.hits/st.shots*100):0;
      g.fillText(`${acc}%`, sx+sideW-22, y+8);
      g.textAlign='left';
      g.font='600 15px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(110,155,200,0.6)';
      g.fillText(`${st.hits} 中 / ${st.shots} 发`, sx+22, y+30);
      y+=64;

      // 威胁指示:最近有没有被打
      g.font='600 16px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(125,170,215,0.66)';
      g.fillText('暴露风险', sx+22, y);
      const risk=U.clamp(st.risk,0,1);
      const rw=sideW-44, rby=y+11;
      g.fillStyle='rgba(255,255,255,0.06)'; g.fillRect(sx+22,rby,rw,14);
      const rg2=g.createLinearGradient(sx+22,0,sx+22+rw,0);
      rg2.addColorStop(0,'rgba(110,230,190,0.9)');
      rg2.addColorStop(0.5,'rgba(255,205,110,0.9)');
      rg2.addColorStop(1,'rgba(255,95,80,0.95)');
      g.save();
      g.beginPath(); g.rect(sx+22,rby,Math.max(3,rw*risk),14); g.clip();
      g.fillStyle=rg2; g.fillRect(sx+22,rby,rw,14);
      g.restore();
      g.strokeStyle='rgba(255,255,255,0.12)'; g.lineWidth=1;
      g.strokeRect(sx+22,rby,rw,14);
      g.font='700 15px ui-monospace,Menlo,monospace';
      g.textAlign='right';
      g.fillStyle= risk>0.66?'rgba(255,120,100,0.95)': risk>0.33?'rgba(255,205,120,0.9)':'rgba(120,235,190,0.9)';
      g.fillText(risk>0.66?'他大概知道你在哪': risk>0.33?'你留下了痕迹':'他还在猜', sx+sideW-22, rby+30);
      g.textAlign='left';
      y=rby+58;

      // 倒计时
      const tt=Math.max(0,st.roundT);
      g.font='600 16px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(125,170,215,0.66)';
      g.fillText('剩余时间', sx+22, y);
      g.font='800 42px ui-monospace,Menlo,monospace';
      g.textAlign='right';
      g.fillStyle= tt<=20? `rgba(255,${110+Math.sin(st.time*8)*60|0},90,0.95)`:'rgba(200,235,255,0.9)';
      g.fillText(`${Math.floor(tt/60)}:${String(Math.floor(tt%60)).padStart(2,'0')}`, sx+sideW-22, y+34);
      g.textAlign='left';
      g.restore();
    }
  }

  return { cnv, PW, PH, MX, MY, IW, IH, MPP, MPAD,
           draw, update, add, clear, marks, MARK, pushLog, log,
           wx2px, wz2py, px2wx, py2wz,
           /* 巨幕 UV → 对面房间世界坐标 */
           uv2world(u,v){
             const px=u*PW, py=(1-v)*PH;
             return { x:px2wx(px), z:py2wz(py),
                      inside: px>=MX && px<=MX+IW && py>=MY && py<=MY+IH };
           }};
})();
