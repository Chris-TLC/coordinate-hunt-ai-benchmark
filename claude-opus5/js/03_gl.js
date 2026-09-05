'use strict';
/* ============ 坐标猎场 · WebGL 微引擎 ============
   · 多贴图批次(不透明 / 镂空 / 加色 / 混合)
   · 顶点法线 + 半球环境光 + 主光 + 巨幕反射光
   · 公告板精灵、地面贴花、程序化生成的全部贴图
*/
const M4 = {
  ident(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  persp(fovy,asp,near,far){
    const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return new Float32Array([f/asp,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(ex,ey,ez, tx,ty,tz){
    // z 轴 = 视线反方向
    let zx=ex-tx, zy=ey-ty, zz=ez-tz;
    let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    // x 轴 = up × z   (up = 0,1,0)
    let xx = 1*zz - 0*zy;
    let xy = 0*zx - 0*zz;
    let xz = 0*zy - 1*zx;
    l=Math.hypot(xx,xy,xz);
    if(l<1e-6){ xx=1; xy=0; xz=0; } else { xx/=l; xy/=l; xz/=l; }
    // y 轴 = z × x
    const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx*ex+xy*ey+xz*ez), -(yx*ex+yy*ey+yz*ez), -(zx*ex+zy*ey+zz*ez), 1
    ]);
  },
  mul(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++){
      const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
      o[c*4  ]=a[0]*b0+a[4]*b1+a[8 ]*b2+a[12]*b3;
      o[c*4+1]=a[1]*b0+a[5]*b1+a[9 ]*b2+a[13]*b3;
      o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
      o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
    }
    return o;
  }
};

const GL = (() => {
  const cnv=document.getElementById('gl3d');
  const gl=cnv.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance',
    // 仅开发调试时保留缓冲以便截图,正常游玩关闭以获得最佳性能
    preserveDrawingBuffer: location.search.indexOf('dev')>=0});
  if(!gl){
    document.body.innerHTML='<div style="padding:60px;color:#cfd6e4;font:16px/1.9 -apple-system,sans-serif">'+
      '当前浏览器不支持 WebGL,无法运行《坐标猎场》。<br>请使用最新版 Chrome、Safari 或 Edge 打开。</div>';
    throw new Error('WebGL unavailable');
  }

  /* ---------------- 着色器 ---------------- */
  const VS=`
  attribute vec3 aPos; attribute vec2 aUV; attribute vec3 aNrm; attribute vec4 aCol;
  uniform mat4 uMVP;
  varying vec2 vUV; varying vec3 vN; varying vec3 vW; varying vec4 vC;
  void main(){ gl_Position=uMVP*vec4(aPos,1.0); vUV=aUV; vN=aNrm; vW=aPos; vC=aCol; }`;

  const FS_LIT=`
  precision highp float;
  varying vec2 vUV; varying vec3 vN; varying vec3 vW; varying vec4 vC;
  uniform sampler2D uTx;
  uniform vec3 uSky, uGnd, uLdir, uLcol, uScrCol;
  uniform float uScrZ, uScrPow, uHurt, uCut, uFogK;
  uniform vec3 uEye;
  void main(){
    vec4 t=texture2D(uTx,vUV);
    if(uCut>0.5 && t.a<0.5) discard;
    vec3 n=normalize(vN);
    vec3 amb = mix(uGnd,uSky, n.y*0.5+0.5);
    float d  = max(dot(n, normalize(uLdir)),0.0);
    vec3 lit = amb + uLcol*d;

    // 天花灯阵:三排灯在地面投下柔和光池
    float pool = 0.0;
    for(int i=-1;i<=1;i++){
      float lz = float(i)*4.6;
      for(int j=-1;j<=1;j++){
        float lx = float(j)*5.2;
        float r = length(vec2(vW.x-lx, vW.z-lz));
        pool += exp(-r*r*0.030) * (1.0 - vW.y*0.11);
      }
    }
    lit += vec3(0.46,0.455,0.435) * clamp(pool,0.0,1.7) * max(n.y,0.20);

    // 巨幕投射的冷光:靠近幕墙 + 面朝幕墙 才吃到
    float dz  = clamp(1.0 - (vW.z - uScrZ)/10.0, 0.0, 1.0);
    float face= max(-n.z, 0.0)*0.72 + 0.28;
    lit += uScrCol * dz*dz * face * uScrPow * 0.60;

    // 接触阴影:贴地处压暗,给一点体积感
    lit *= 1.0 - 0.20*clamp(1.0-vW.y*0.7,0.0,1.0)*max(n.y,0.0);

    vec3 col = t.rgb*lit*vC.rgb;
    col = mix(col, vec3(dot(col,vec3(0.4,0.35,0.25)))*vec3(1.7,0.30,0.24), uHurt);
    float fd = length(vW-uEye);
    col = mix(col, vec3(0.045,0.058,0.082), clamp(fd*uFogK,0.0,0.48));
    gl_FragColor=vec4(col, t.a*vC.a);
  }`;

  const FS_FLAT=`
  precision highp float;
  varying vec2 vUV; varying vec4 vC; varying vec3 vW;
  uniform sampler2D uTx; uniform float uHurt; uniform vec3 uEye; uniform float uFogK;
  void main(){
    vec4 t=texture2D(uTx,vUV);
    vec3 col=t.rgb*vC.rgb;
    col = mix(col, vec3(dot(col,vec3(0.4,0.35,0.25)))*vec3(1.5,0.35,0.3), uHurt*0.55);
    gl_FragColor=vec4(col, t.a*vC.a);
  }`;

  function compile(type,src){
    const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.error('shader:',gl.getShaderInfoLog(s),src);
    return s;
  }
  function program(fs){
    const p=gl.createProgram();
    gl.attachShader(p,compile(gl.VERTEX_SHADER,VS));
    gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));
    gl.bindAttribLocation(p,0,'aPos'); gl.bindAttribLocation(p,1,'aUV');
    gl.bindAttribLocation(p,2,'aNrm'); gl.bindAttribLocation(p,3,'aCol');
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) console.error('link:',gl.getProgramInfoLog(p));
    const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
    for(let i=0;i<n;i++){ const nm=gl.getActiveUniform(p,i).name; u[nm]=gl.getUniformLocation(p,nm); }
    return {p,u};
  }
  const P_LIT=program(FS_LIT), P_FLAT=program(FS_FLAT);

  /* ---------------- 纹理 ---------------- */
  const isPOT=v=>(v&(v-1))===0;
  function texFromCanvas(c,{repeat=false,mip=true,linear=true}={}){
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    const pot=isPOT(c.width)&&isPOT(c.height);
    if(pot&&mip){
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    }else{
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);
    }
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
    const wrap=(repeat&&pot)?gl.REPEAT:gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
    return {tex:t, w:c.width, h:c.height, src:c};
  }
  function texUpdate(handle,c){
    gl.bindTexture(gl.TEXTURE_2D,handle.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
  }

  /* ---------------- 批次 ----------------
     顶点格式: px py pz | u v | nx ny nz | r g b a  => 12 floats */
  const STRIDE=12*4;
  class Batch{
    constructor(tex,mode){ this.tex=tex; this.mode=mode||'opaque'; this.v=[]; this.buf=null; this.n=0; this.dirty=true; }
    clear(){ this.v.length=0; this.dirty=true; }
    /* 四边形(逆时针) */
    quad(a,b,c,d, u0,v0,u1,v1, nx,ny,nz, col){
      const C=col||[1,1,1,1];
      const P=(p,u,v)=>{ this.v.push(p[0],p[1],p[2], u,v, nx,ny,nz, C[0],C[1],C[2],C[3]); };
      P(a,u0,v0); P(b,u1,v0); P(c,u1,v1);
      P(a,u0,v0); P(c,u1,v1); P(d,u0,v1);
      this.dirty=true;
    }
    /* 轴对齐盒:cx,cy,cz 中心,sx,sy,sz 尺寸,ts 纹理密度(每米重复数) */
    box(cx,cy,cz,sx,sy,sz,ts,col,skip){
      const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
      const A=[x0,y0,z1],B=[x1,y0,z1],C=[x1,y1,z1],D=[x0,y1,z1];
      const E=[x1,y0,z0],F=[x0,y0,z0],G=[x0,y1,z0],H=[x1,y1,z0];
      const S=skip||{};
      if(!S.pz) this.quad(A,B,C,D, 0,0, sx*ts, sy*ts, 0,0,1, col);
      if(!S.nz) this.quad(E,F,G,H, 0,0, sx*ts, sy*ts, 0,0,-1, col);
      if(!S.px) this.quad(B,E,H,C, 0,0, sz*ts, sy*ts, 1,0,0, col);
      if(!S.nx) this.quad(F,A,D,G, 0,0, sz*ts, sy*ts, -1,0,0, col);
      if(!S.py) this.quad(D,C,H,G, 0,0, sx*ts, sz*ts, 0,1,0, col);
      if(!S.ny) this.quad(F,E,B,A, 0,0, sx*ts, sz*ts, 0,-1,0, col);
    }
    /* 水平面片(贴地贴花 / 光斑) */
    ground(x,z,size,y,col,rot){
      const h=size/2, c=Math.cos(rot||0), s=Math.sin(rot||0);
      const P=(dx,dz)=>[x+dx*c-dz*s, y, z+dx*s+dz*c];
      this.quad(P(-h,-h),P(h,-h),P(h,h),P(-h,h), 0,0,1,1, 0,1,0, col);
    }
    /* 面向摄像机的公告板 */
    billboard(x,y,z,w,h,right,up,col,u0,v0,u1,v1,anchorBottom){
      const yo=anchorBottom?h/2:0;
      const rx=right[0]*w/2, ry=right[1]*w/2, rz=right[2]*w/2;
      const ux=up[0]*h/2, uy=up[1]*h/2, uz=up[2]*h/2;
      const cx=x, cy=y+yo, cz=z;
      const A=[cx-rx-ux, cy-ry-uy, cz-rz-uz];
      const B=[cx+rx-ux, cy+ry-uy, cz+rz-uz];
      const C=[cx+rx+ux, cy+ry+uy, cz+rz+uz];
      const D=[cx-rx+ux, cy-ry+uy, cz-rz+uz];
      this.quad(A,B,C,D, u0===undefined?0:u0, v0===undefined?0:v0,
                        u1===undefined?1:u1, v1===undefined?1:v1, 0,0,1, col);
    }
    /* 竖直交叉片(植物) */
    cross(x,y,z,w,h,col,rot){
      const r=rot||0;
      for(const a of [r, r+Math.PI/2]){
        const dx=Math.cos(a)*w/2, dz=Math.sin(a)*w/2;
        const A=[x-dx,y,z-dz],B=[x+dx,y,z+dz],C=[x+dx,y+h,z+dz],D=[x-dx,y+h,z-dz];
        const nx=Math.cos(a+Math.PI/2), nz=Math.sin(a+Math.PI/2);
        this.quad(A,B,C,D, 0,0,1,1, nx,0.35,nz, col);
      }
    }
    upload(){
      if(!this.buf) this.buf=gl.createBuffer();
      if(this.dirty){
        gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.v), this.stream?gl.STREAM_DRAW:gl.STATIC_DRAW);
        this.n=this.v.length/12; this.dirty=false;
      }
    }
  }

  /* ---------------- 视口 ---------------- */
  let W=1,H=1,DPR=1;
  function resize(){
    DPR=Math.min(window.devicePixelRatio||1, 2);
    W=cnv.width =Math.max(2,Math.floor(innerWidth*DPR));
    H=cnv.height=Math.max(2,Math.floor(innerHeight*DPR));
    cnv.style.width=innerWidth+'px'; cnv.style.height=innerHeight+'px';
    gl.viewport(0,0,W,H);
  }
  resize(); addEventListener('resize',resize);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.clearColor(0.020,0.028,0.042,1);

  /* ---------------- 绘制 ---------------- */
  const env={ sky:[1.18,1.24,1.38], gnd:[0.52,0.56,0.66],
              ldir:[0.32,0.90,0.28], lcol:[0.70,0.71,0.78],
              scr:[0.28,0.62,1.05], scrPow:1.0, hurt:0, fogK:0.0032, scrZ:-7.5 };

  function bindAttribs(){
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,STRIDE,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,STRIDE,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,STRIDE,20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,STRIDE,32);
  }
  function setUniforms(prog,mvp,eye){
    const u=prog.u;
    gl.uniformMatrix4fv(u.uMVP,false,mvp);
    if(u.uSky)   gl.uniform3fv(u.uSky,env.sky);
    if(u.uGnd)   gl.uniform3fv(u.uGnd,env.gnd);
    if(u.uLdir)  gl.uniform3fv(u.uLdir,env.ldir);
    if(u.uLcol)  gl.uniform3fv(u.uLcol,env.lcol);
    if(u.uScrCol)gl.uniform3fv(u.uScrCol,env.scr);
    if(u.uScrZ)  gl.uniform1f(u.uScrZ,env.scrZ);
    if(u.uScrPow)gl.uniform1f(u.uScrPow,env.scrPow);
    if(u.uHurt)  gl.uniform1f(u.uHurt,env.hurt);
    if(u.uFogK)  gl.uniform1f(u.uFogK,env.fogK);
    if(u.uEye)   gl.uniform3fv(u.uEye,eye);
  }
  function drawBatch(b,prog,mvp,eye){
    if(!b.v.length) return;
    b.upload();
    if(!b.n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER,b.buf);
    bindAttribs();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,b.tex.tex);
    gl.uniform1i(prog.u.uTx,0);
    if(prog.u.uCut) gl.uniform1f(prog.u.uCut, b.mode==='cutout'?1:0);
    gl.drawArrays(gl.TRIANGLES,0,b.n);
  }

  function render(cam, groups){
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const proj=M4.persp(cam.fov, W/H, 0.04, 90);
    const view=M4.lookAt(cam.x,cam.y,cam.z, cam.tx,cam.ty,cam.tz);
    const mvp=M4.mul(proj,view);
    const eye=[cam.x,cam.y,cam.z];

    /* 1. 不透明 + 镂空 (受光) */
    gl.useProgram(P_LIT.p); setUniforms(P_LIT,mvp,eye);
    gl.disable(gl.BLEND); gl.depthMask(true);
    for(const b of groups.opaque) drawBatch(b,P_LIT,mvp,eye);
    for(const b of groups.cutout) drawBatch(b,P_LIT,mvp,eye);

    /* 2. 无光混合(贴花、屏幕自发光面) */
    gl.useProgram(P_FLAT.p); setUniforms(P_FLAT,mvp,eye);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for(const b of groups.alpha) drawBatch(b,P_FLAT,mvp,eye);

    /* 3. 加色(光晕、火花、光柱) */
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.disable(gl.CULL_FACE);
    for(const b of groups.add) drawBatch(b,P_FLAT,mvp,eye);
    gl.enable(gl.CULL_FACE);

    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  return { gl, cnv, Batch, texFromCanvas, texUpdate, render, resize, env,
           __flat:P_FLAT, __lit:P_LIT, STRIDE,
           W:()=>W, H:()=>H, DPR:()=>DPR };
})();
