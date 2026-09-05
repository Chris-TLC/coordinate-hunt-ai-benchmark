'use strict';
/* ============ 坐标猎场 · 程序化贴图生成器(Canvas,零素材) ============ */
const TEX = (() => {
  function make(w,h,fn){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const g=c.getContext('2d'); fn(g,w,h);
    return c;
  }
  /* 通用噪点 */
  function grain(g,w,h,n,alpha){ for(let i=0;i<n;i++){ g.fillStyle=`rgba(${Math.random()<0.5?255:0},${Math.random()<0.5?255:0},${Math.random()*80|0},${alpha})`; g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);} }

  /* 房间地板:深灰蓝金属格栅 */
  function floor(){
    return make(512,512,(g,w,h)=>{
      const gr=g.createLinearGradient(0,0,w,h);
      gr.addColorStop(0,'#20242e'); gr.addColorStop(0.5,'#1a1e27'); gr.addColorStop(1,'#232733');
      g.fillStyle=gr; g.fillRect(0,0,w,h);
      const cell=64;
      for(let x=0;x<w;x+=cell){
        for(let y=0;y<h;y+=cell){
          const v=hash2(x,y);
          g.fillStyle=`rgba(${30+v*16|0},${36+v*18|0},${48+v*22|0},0.55)`;
          g.fillRect(x+1,y+1,cell-2,cell-2);
          g.strokeStyle='rgba(10,12,18,0.85)'; g.lineWidth=2;
          g.strokeRect(x+0.5,y+0.5,cell,cell);
          g.strokeStyle='rgba(90,104,130,0.10)';
          g.strokeRect(x+2.5,y+2.5,cell-4,cell-4);
          if(hash2(x*7,y*3)>0.86){ g.fillStyle='rgba(120,150,190,0.06)'; g.fillRect(x+8,y+8,cell-16,cell-16); }
        }
      }
      grain(g,w,h,900,0.05);
    });
  }
  /* 墙面:暗色声学吸音板 + 结构分缝 */
  function wall(){
    return make(512,512,(g,w,h)=>{
      g.fillStyle='#20252f'; g.fillRect(0,0,w,h);
      // 主板块 4×4
      const cell=128;
      for(let x=0;x<w;x+=cell){
        for(let y=0;y<h;y+=cell){
          const v=hash2(x+y*3,x-y);
          g.fillStyle=`rgb(${34+v*10|0},${39+v*11|0},${50+v*13|0})`;
          g.fillRect(x+2,y+2,cell-4,cell-4);
          // 吸音打孔纹理
          g.fillStyle='rgba(12,15,21,0.5)';
          for(let px=x+14;px<x+cell-12;px+=11){
            for(let py=y+14;py<y+cell-12;py+=11){
              g.fillRect(px,py,3,3);
            }
          }
          // 板边高光
          g.strokeStyle='rgba(150,180,225,0.06)'; g.lineWidth=1.5;
          g.strokeRect(x+2.5,y+2.5,cell-5,cell-5);
          // 分缝阴影
          g.strokeStyle='rgba(6,8,12,0.75)'; g.lineWidth=3;
          g.strokeRect(x+0.5,y+0.5,cell,cell);
        }
      }
      // 竖向结构肋
      for(let x=0;x<w;x+=cell*2){
        g.fillStyle='rgba(58,68,86,0.85)'; g.fillRect(x-3,0,7,h);
        g.fillStyle='rgba(150,180,225,0.07)'; g.fillRect(x-3,0,2,h);
        g.fillStyle='rgba(0,0,0,0.4)'; g.fillRect(x+2,0,2,h);
      }
      // 零星污渍
      for(let i=0;i<16;i++){
        g.fillStyle=`rgba(${Math.random()<0.5?255:0},${Math.random()<0.5?255:0},${Math.random()*60|0},0.028)`;
        g.fillRect(Math.random()*w,Math.random()*h,U.rand(24,110),U.rand(6,24));
      }
      grain(g,w,h,600,0.045);
    });
  }
  /* 天花板 */
  function ceil(){
    return make(512,512,(g,w,h)=>{
      g.fillStyle='#12151d'; g.fillRect(0,0,w,h);
      for(let x=0;x<w;x+=86){
        for(let y=0;y<h;y+=86){
          g.fillStyle=`rgba(${26+(hash2(x,y)*9|0)},${30+(hash2(y,x)*10|0)},${40+(hash2(x*3,y)*11|0)},1)`;
          g.fillRect(x+2,y+2,82,82);
        }
      }
      g.strokeStyle='rgba(0,0,0,0.6)';g.lineWidth=1.5;
      for(let x=0;x<=w;x+=86){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
      for(let y=0;y<=h;y+=86){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
      // 天花灯槽
      g.fillStyle='#2a3142'; g.fillRect(w/2-160,h/2-110,320,220);
      g.strokeStyle='#0c0f16'; g.lineWidth=6; g.strokeRect(w/2-160,h/2-110,320,220);
      grain(g,w,h,600,0.05);
    });
  }
  /* 巨幕玻璃:整墙,深色,带轻微渐变泛光 */
  function screen(){
    return make(1024,512,(g,w,h)=>{
      const gr=g.createLinearGradient(0,0,0,h);
      gr.addColorStop(0,'#0a1120'); gr.addColorStop(0.5,'#0c1526'); gr.addColorStop(1,'#0a1120');
      g.fillStyle=gr; g.fillRect(0,0,w,h);
      const rg=g.createRadialGradient(w/2,h/2,40,w/2,h/2,w*0.7);
      rg.addColorStop(0,'rgba(60,110,180,0.10)'); rg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=rg; g.fillRect(0,0,w,h);
      for(let i=0;i<40;i++){
        g.fillStyle=`rgba(${Math.random()<0.6?160:70},${170+(Math.random()*60|0)},255,${0.02+Math.random()*0.03})`;
        g.fillRect(Math.random()*w,Math.random()*h,U.rand(10,120),U.rand(1,3));
      }
      // 中缝
      g.strokeStyle='rgba(0,0,0,0.75)'; g.lineWidth=3;
      g.beginPath(); g.moveTo(w/2,0); g.lineTo(w/2,h); g.stroke();
      g.fillStyle='rgba(160,200,255,0.05)'; g.fillRect(0,0,3,h); g.fillRect(w-3,0,3,h);
      grain(g,w,h,500,0.04);
    });
  }
  /* 设备机柜(竖立的服务器/电控柜,交叉片渲染) */
  function rack(seed){
    return make(256,320,(g,w,h)=>{
      g.clearRect(0,0,w,h);
      const cx=w/2, bw=104, x0=cx-bw/2;
      const top=48, bot=316;
      // 柜体
      const bg=g.createLinearGradient(x0,0,x0+bw,0);
      bg.addColorStop(0,'#232a36'); bg.addColorStop(0.35,'#39424f');
      bg.addColorStop(0.7,'#2c3441'); bg.addColorStop(1,'#1c222c');
      g.fillStyle=bg; g.fillRect(x0,top,bw,bot-top);
      // 底座
      g.fillStyle='#141920'; g.fillRect(x0-6,bot-10,bw+12,12);
      // 顶盖
      g.fillStyle='#454f5e'; g.fillRect(x0-4,top-8,bw+8,10);
      // 面板层
      const rows=9;
      for(let i=0;i<rows;i++){
        const y=top+14+i*((bot-top-24)/rows);
        const v=hash2(seed+i*7, i*3);
        g.fillStyle='#171c25'; g.fillRect(x0+8,y,bw-16,16);
        // 指示灯
        for(let k=0;k<4;k++){
          const on=hash2(seed+i*13,k*5)>0.42;
          g.fillStyle= on ? (hash2(k,i)>0.7?'rgba(255,180,90,0.9)':'rgba(110,225,255,0.92)')
                          : 'rgba(70,90,115,0.5)';
          g.fillRect(x0+13+k*9, y+4, 5, 5);
        }
        // 通风格栅
        g.fillStyle='rgba(120,150,190,0.16)';
        for(let k=0;k<7;k++) g.fillRect(x0+56+k*5, y+3, 2.5, 10);
        // 偶尔一个显示条
        if(v>0.72){ g.fillStyle='rgba(110,215,255,0.30)'; g.fillRect(x0+56,y+3,35,10); }
      }
      // 侧面高光
      g.fillStyle='rgba(190,220,255,0.07)'; g.fillRect(x0+2,top,4,bot-top);
      g.fillStyle='rgba(0,0,0,0.35)'; g.fillRect(x0+bw-7,top,6,bot-top);
      // 顶部警示条
      g.fillStyle='rgba(255,175,70,0.5)'; g.fillRect(x0,top+2,bw,3);
    });
  }
  /* 线缆卷 / 器材桶 */
  function drum(seed){
    return make(256,256,(g,w,h)=>{
      g.clearRect(0,0,w,h);
      const cx=w/2, bw=112, x0=cx-bw/2, top=76, bot=246;
      const bg=g.createLinearGradient(x0,0,x0+bw,0);
      bg.addColorStop(0,'#2a3140'); bg.addColorStop(0.4,'#465063');
      bg.addColorStop(1,'#20262f');
      g.fillStyle=bg; g.fillRect(x0,top,bw,bot-top);
      // 顶面椭圆
      g.fillStyle='#4d5869'; g.beginPath(); g.ellipse(cx,top,bw/2,15,0,0,U.TAU); g.fill();
      g.fillStyle='#333c4a'; g.beginPath(); g.ellipse(cx,top,bw/2-9,10,0,0,U.TAU); g.fill();
      // 箍
      for(const y of [top+34, top+78, top+122]){
        g.fillStyle='rgba(20,25,33,0.85)'; g.fillRect(x0,y,bw,9);
        g.fillStyle='rgba(180,205,240,0.10)'; g.fillRect(x0,y,bw,2.5);
      }
      // 警示斜纹
      g.save(); g.beginPath(); g.rect(x0,bot-34,bw,26); g.clip();
      for(let i=-30;i<bw+30;i+=20){
        g.fillStyle= (i/20|0)%2 ? 'rgba(255,175,70,0.55)':'rgba(30,36,46,0.9)';
        g.beginPath(); g.moveTo(x0+i,bot-34); g.lineTo(x0+i+13,bot-34);
        g.lineTo(x0+i-13,bot-8); g.lineTo(x0+i-26,bot-8); g.closePath(); g.fill();
      }
      g.restore();
      g.fillStyle='rgba(0,0,0,0.4)'; g.fillRect(x0+bw-8,top,8,bot-top);
    });
  }
  /* 光斑 sprite */
  function glow(color='#7fd7ff'){
    return make(256,256,(g,w,h)=>{
      const rg=g.createRadialGradient(128,128,0,128,128,128);
      rg.addColorStop(0,'#ffffff'); rg.addColorStop(0.25,color); rg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=rg; g.fillRect(0,0,w,h);
    });
  }
  /* 粒子圆点 */
  function dot(){
    return make(64,64,(g,w,h)=>{
      const rg=g.createRadialGradient(32,32,0,32,32,32);
      rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(0.4,'rgba(255,255,255,0.6)'); rg.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=rg; g.fillRect(0,0,w,h);
    });
  }
  /* 板条箱 */
  function crate(){
    return make(256,256,(g,w,h)=>{
      g.fillStyle='#2e3440'; g.fillRect(0,0,w,h);
      g.strokeStyle='#1a1e27'; g.lineWidth=6; g.strokeRect(3,3,w-6,h-6);
      g.strokeStyle='rgba(255,255,255,0.08)'; g.lineWidth=2; g.strokeRect(10,10,w-20,h-20);
      g.fillStyle='rgba(255,190,80,0.10)'; g.fillRect(0,h/2-7,w,14);
      for(let i=0;i<6;i++){ g.fillStyle='#3a414f'; g.fillRect(14+i*40,14,30,h-28); }
      for(let i=0;i<6;i++){ g.fillStyle='#262b36'; g.fillRect(14+i*40,14,6,h-28); }
      grain(g,w,h,400,0.06);
    });
  }
  /* 隔板(可作掩体的半高墙) */
  function panel(){
    return make(256,256,(g,w,h)=>{
      g.fillStyle='#232b3a'; g.fillRect(0,0,w,h);
      g.strokeStyle='#141a26'; g.lineWidth=4; g.strokeRect(2,2,w-4,h-4);
      for(let y=18;y<h;y+=44){ g.fillStyle='rgba(110,140,190,0.10)'; g.fillRect(8,y,w-16,3); }
      g.fillStyle='rgba(255,170,70,0.14)'; g.fillRect(0,h-20,w,8);
      grain(g,w,h,400,0.06);
    });
  }
  /* 枪械视图模型:第一人称手持侧影。
     画成"枪口朝左"—— 因为它挂在画面右下角,枪口应指向画面中心的准星。 */
  function gunSkin(){
    return make(512,512,(g,w,h)=>{
      g.clearRect(0,0,w,h);
      // 以 x 轴镜像绘制,让所有子部件按"朝右"的直觉写、最终呈现朝左
      g.save(); g.translate(w,0); g.scale(-1,1);

      const mt=(x,y,w2,h2,c1,c2,r)=>{
        const gr=g.createLinearGradient(x,y,x,y+h2);
        gr.addColorStop(0,c1); gr.addColorStop(0.42,c2); gr.addColorStop(1,c1);
        g.fillStyle=gr;
        g.beginPath();
        if(g.roundRect) g.roundRect(x,y,w2,h2,r||3); else g.rect(x,y,w2,h2);
        g.fill();
      };
      // 机身
      mt(60,236,330,74,'#2b3240','#4a5568',7);
      // 上导轨
      mt(96,214,250,26,'#212734','#39414f',4);
      for(let i=0;i<12;i++){ g.fillStyle='#171c26'; g.fillRect(104+i*20,216,7,22); }
      // 枪管 + 消焰器
      mt(384,252,86,40,'#242a36','#3c4453',4);
      mt(462,258,40,28,'#171c26','#2a3140',3);
      g.fillStyle='#0a0d13'; g.beginPath(); g.ellipse(498,272,6,12,0,0,U.TAU); g.fill();
      // 弹匣
      mt(176,306,74,104,'#252b38','#3d4553',5);
      g.fillStyle='#5d90c4'; g.fillRect(184,318,58,6);
      g.fillStyle='rgba(120,220,255,0.65)'; g.fillRect(184,332,58,4);
      g.fillStyle='rgba(120,220,255,0.35)'; g.fillRect(184,344,42,4);
      // 握把
      g.save(); g.translate(120,306); g.rotate(0.22);
      mt(0,0,66,116,'#1e242f','#333b49',7); g.restore();
      // 扳机护圈
      g.strokeStyle='#333b49'; g.lineWidth=9;
      g.beginPath(); g.arc(178,326,26,0.2,Math.PI-0.2); g.stroke();
      // 全息瞄具
      mt(228,178,84,42,'#1c222d','#333c4b',5);
      g.fillStyle='rgba(110,215,255,0.30)'; g.fillRect(238,186,64,26);
      g.strokeStyle='rgba(160,235,255,0.85)'; g.lineWidth=3;
      g.beginPath(); g.arc(270,199,9,0,U.TAU); g.stroke();
      g.fillStyle='rgba(200,245,255,0.95)'; g.fillRect(268,197,5,5);
      // 冷却槽 + 能量条
      for(let i=0;i<5;i++){
        g.fillStyle='#151a23'; g.fillRect(112+i*32,252,18,14);
        g.fillStyle='rgba(120,215,255,0.55)'; g.fillRect(112+i*32,252,18,3);
      }
      // 高光边
      g.strokeStyle='rgba(190,220,255,0.14)'; g.lineWidth=2;
      g.strokeRect(60,236,330,74);
      g.restore();

      // 刻字:在镜像之外画,保证文字方向正常
      g.font='700 15px ui-monospace,Menlo,monospace';
      g.fillStyle='rgba(150,200,240,0.40)';
      g.textAlign='center';
      g.fillText('CH-01  COORD', 250, 292);
    });
  }
  return {floor,wall,ceil,screen,rack,drum,glow,dot,crate,panel,gunSkin};
})();
