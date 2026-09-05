'use strict';
/* ================= 渲染:射线投射 3D + 蓝图巨幕 ================= */

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.mapCv = document.createElement('canvas');
    this.mapCv.width = C.MAP_W;
    this.mapCv.height = C.MAP_H;
    this.map = this.mapCv.getContext('2d');
    this.W = 0; this.H = 0;
    this.scale = 1;
    this.frameT = 16.6;
    this.dust = [];
    for (let i = 0; i < 55; i++)
      this.dust.push({ x: rnd(-7.5, 7.5), z: rnd(0.5, 14.5), y: rnd(0.6, 3.6), ph: rnd(0, TAU), sp: rnd(0.2, 0.7) });
    this.scanPat = null;
    this.vig = null;
    this.time = 0;
  }

  resize(cssW, cssH, dpr) {
    const s = clamp(dpr, 1, 1.75) * this.scale;
    this.W = Math.max(320, Math.floor(cssW * s));
    this.H = Math.max(240, Math.floor(cssH * s));
    this.cv.width = this.W;
    this.cv.height = this.H;
    this.vig = null;
    this.scanPat = null;
  }

  patScanlines() {
    if (this.scanPat) return this.scanPat;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 4, 2);
    this.scanPat = this.ctx.createPattern(c, 'repeat');
    return this.scanPat;
  }

  vignette() {
    if (this.vig) return this.vig;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 30, 64, 64, 90);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    this.vig = this.ctx.createPattern(c, 'no-repeat');
    return this.vig;
  }

  /* ---------- 3D 点投影 ---------- */
  project(st, x, y, z) {
    const cam = st.cam;
    const fwdX = Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
    const rX = Math.cos(cam.yaw), rZ = Math.sin(cam.yaw);
    const relX = x - cam.x, relZ = z - cam.z;
    const depth = relX * fwdX + relZ * fwdZ;
    if (depth < 0.12) return null;
    const f = (this.H * 0.5) / Math.tan(this.vfov() / 2);
    const lat = relX * rX + relZ * rZ;
    const sx = this.W / 2 + (lat / depth) * f;
    const sy = this.H / 2 + ((cam.y - y) / depth) * f + Math.tan(cam.pitch) * f;
    return { x: sx, y: sy, depth };
  }

  vfov() {
    const hf = C.FOV;
    return 2 * Math.atan(Math.tan(hf / 2) * (this.H / this.W));
  }

  /* ---------- 蓝图巨幕 ---------- */
  drawMap(st) {
    const g = this.map, W = C.MAP_W, H = C.MAP_H;
    g.clearRect(0, 0, W, H);
    /* 底色 */
    let bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c1830');
    bg.addColorStop(0.5, '#11254a');
    bg.addColorStop(1, '#0b1730');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    /* 磷光辉光 */
    const ph = g.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 1.1);
    ph.addColorStop(0, 'rgba(120,205,255,0.13)');
    ph.addColorStop(1, 'rgba(120,205,255,0)');
    g.fillStyle = ph;
    g.fillRect(0, 0, W, H);

    /* 网格 */
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(100,185,255,0.14)';
    g.beginPath();
    for (let x = 0; x <= 16; x++) {
      const px = x / 16 * W;
      g.moveTo(px, 0); g.lineTo(px, H);
    }
    for (let z = 0; z <= 15; z++) {
      const py = z / 15 * H;
      g.moveTo(0, py); g.lineTo(W, py);
    }
    g.stroke();
    g.strokeStyle = 'rgba(110,200,255,0.26)';
    g.beginPath();
    for (let x = 0; x <= 16; x += 5) { const px = x / 16 * W; g.moveTo(px, 0); g.lineTo(px, H); }
    for (let z = 0; z <= 15; z += 5) { const py = z / 15 * H; g.moveTo(0, py); g.lineTo(W, py); }
    g.stroke();

    /* 房间轮廓 */
    g.strokeStyle = 'rgba(150,225,255,0.9)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.strokeStyle = 'rgba(110,195,255,0.35)';
    g.lineWidth = 1;
    g.strokeRect(5, 5, W - 10, H - 10);

    /* 底部隔断墙(共享巨幕墙) */
    g.fillStyle = 'rgba(160,235,255,0.22)';
    g.fillRect(0, H - 6, W, 6);
    g.strokeStyle = 'rgba(180,240,255,0.95)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, H - 6.5); g.lineTo(W, H - 6.5); g.stroke();

    /* 障碍物 */
    MapGrid.obs.forEach((o, i) => {
      const x0 = mapPX(o.x0), x1 = mapPX(o.x1), y0 = mapPY(o.z0), y1 = mapPY(o.z1);
      g.fillStyle = 'rgba(80,160,240,0.24)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(140,215,255,0.75)';
      g.lineWidth = 1;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.save();
      g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
      g.strokeStyle = 'rgba(140,215,255,0.28)';
      g.beginPath();
      for (let d = -40; d < 60; d += 8) {
        g.moveTo(x0 + d, y1); g.lineTo(x1 + d, y0);
      }
      g.stroke();
      g.restore();
      drawText(g, 'OBJ-' + (i + 1), (x0 + x1) / 2, (y0 + y1) / 2, 9, 'rgba(170,220,255,0.65)');
    });

    /* 尺寸标注 */
    g.strokeStyle = 'rgba(140,205,255,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(10, 8); g.lineTo(W - 10, 8);
    g.moveTo(10, 5); g.lineTo(10, 11); g.moveTo(W - 10, 5); g.lineTo(W - 10, 11);
    g.moveTo(W - 8, 10); g.lineTo(W - 8, H - 10);
    g.moveTo(W - 11, 10); g.lineTo(W - 5, 10); g.moveTo(W - 11, H - 10); g.lineTo(W - 5, H - 10);
    g.stroke();
    drawText(g, '16.00 m', W / 2, 20, 11, 'rgba(170,220,255,0.7)');
    g.save();
    g.translate(W - 18, H / 2); g.rotate(-Math.PI / 2);
    drawText(g, '15.00 m', 0, 0, 11, 'rgba(170,220,255,0.7)');
    g.restore();

    /* 标签 */
    drawText(g, 'LIVE FEED · 敌区 ROOM-B', 10, H - 16, 11, 'rgba(150,235,255,0.9)', 'left');
    drawText(g, 'S-07 观测场', W - 10, 18, 10, 'rgba(150,215,255,0.65)', 'right');
    if (st && st.timeLeft !== undefined) {
      const t = fmtTime(st.timeLeft);
      const urgent = st.timeLeft <= 30;
      drawText(g, 'T-' + t, W - 10, H - 16, 13, urgent ? 'rgba(255,110,100,0.95)' : 'rgba(120,220,255,0.85)', 'right');
    }

    /* 倒计时开机态 */
    if (st && st.state === 'countdown') {
      g.fillStyle = 'rgba(2,5,10,0.72)';
      g.fillRect(0, 0, W, H);
      const p = 1 - clamp(st.countT / C.COUNTDOWN, 0, 1);
      g.strokeStyle = 'rgba(120,220,255,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, H * 0.55); g.lineTo(W * p, H * 0.55);
      g.stroke();
      drawText(g, 'LINKING ROOM-B', W / 2, H * 0.42, 15, 'rgba(120,220,255,0.9)');
      drawText(g, '同步中…', W / 2, H * 0.62, 12, 'rgba(120,220,255,0.55)');
    }

    if (!st) return;

    /* ---- 事件绘制 ---- */
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const ev of st.mapEvents) {
      const a = clamp(ev.t / ev.life, 0, 1);
      const x = mapPX(ev.x), y = mapPY(ev.z);
      switch (ev.kind) {
        case 'trail': {
          const dx = (ev.dx || 0) * 60, dz = (ev.dz || 0) * 25.6;
          g.strokeStyle = 'rgba(150,225,255,' + (0.34 * a * (ev.alpha || 0.5)).toFixed(3) + ')';
          g.lineWidth = 3.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x - dx, y - dz);
          g.lineTo(x + dx, y + dz);
          g.stroke();
          break;
        }
        case 'ripple': {
          g.strokeStyle = 'rgba(150,220,255,' + (0.22 * a * (ev.alpha || 0.15)).toFixed(3) + ')';
          g.lineWidth = 1.2;
          const rr = 60 * (1.4 - a * 1.2);
          g.beginPath(); g.ellipse(x, y, rr, rr * 0.43, 0, 0, TAU); g.stroke();
          break;
        }
        case 'scan': {
          const r = C.SCAN_R * (1 - a);
          g.strokeStyle = 'rgba(120,235,255,' + (0.55 * a).toFixed(3) + ')';
          g.lineWidth = 2;
          g.beginPath(); g.ellipse(x, y, r * 60, r * 25.6, 0, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(120,235,255,' + (0.08 * a).toFixed(3) + ')';
          g.beginPath(); g.ellipse(x, y, r * 60, r * 25.6, 0, 0, TAU); g.fill();
          break;
        }
        case 'reveal': {
          const pulse = 0.6 + 0.4 * Math.sin(this.time * 9);
          const col = ev.global ? '255,200,90' : '255,90,80';
          g.fillStyle = 'rgba(' + col + ',' + (0.85 * a * pulse).toFixed(3) + ')';
          g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(' + col + ',' + (0.6 * a).toFixed(3) + ')';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, y, 12 + 5 * pulse, 0, TAU); g.stroke();
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            const ang = k * Math.PI / 2 + Math.PI / 4;
            g.moveTo(x + Math.cos(ang) * 20, y + Math.sin(ang) * 20 * 0.43);
            g.lineTo(x + Math.cos(ang) * 28, y + Math.sin(ang) * 28 * 0.43);
          }
          g.stroke();
          break;
        }
        case 'shot': {
          /* 光束:从巨幕边缘打进 */
          const bA = clamp(1 - (C.BEAM_LIFE - Math.max(0, ev.t - (ev.life - C.BEAM_LIFE))) / C.BEAM_LIFE, 0, 1);
          if (bA > 0) {
            const grd = g.createLinearGradient(x, 0, x, y);
            grd.addColorStop(0, 'rgba(220,245,255,' + (0.9 * bA).toFixed(3) + ')');
            grd.addColorStop(1, 'rgba(140,220,255,' + (0.25 * bA).toFixed(3) + ')');
            g.strokeStyle = grd;
            g.lineWidth = 3;
            g.beginPath(); g.moveTo(x, 2); g.lineTo(x, y); g.stroke();
          }
          /* 落点闪光 */
          const cA = clamp(a * 2, 0, 1);
          const col = ev.hit ? '255,90,70' : '180,230,255';
          const rg = g.createRadialGradient(x, y, 0, x, y, 26 * (1.6 - a));
          rg.addColorStop(0, 'rgba(' + col + ',' + (0.85 * cA).toFixed(3) + ')');
          rg.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = rg;
          g.beginPath(); g.arc(x, y, 26 * (1.6 - a), 0, TAU); g.fill();
          g.strokeStyle = 'rgba(' + col + ',' + (0.5 * cA).toFixed(3) + ')';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, y, 7 + 10 * (1 - a), 0, TAU); g.stroke();
          if (ev.hit) {
            g.fillStyle = 'rgba(255,90,70,' + (0.9 * cA).toFixed(3) + ')';
            g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
          }
          break;
        }
      }
    }

    /* 漂浮文字 */
    for (const f of st.feed) {
      const a = clamp(f.t / f.life, 0, 1);
      const x = mapPX(f.x), y = mapPY(f.z) - 10 - (1 - a) * 14;
      drawText(g, f.text, x, y, 12, f.color, 'center', a, '"PingFang SC","Hiragino Sans GB",sans-serif');
    }

    /* 瞄准标记 */
    if (st.aim && st.aim.valid) {
      const x = mapPX(st.aim.mx), y = mapPY(st.aim.mz);
      g.strokeStyle = 'rgba(140,240,255,0.75)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 7, 0, TAU); g.stroke();
      g.beginPath();
      g.moveTo(x - 12, y); g.lineTo(x - 4, y);
      g.moveTo(x + 4, y); g.lineTo(x + 12, y);
      g.moveTo(x, y - 12 * 0.43); g.lineTo(x, y - 4 * 0.43);
      g.moveTo(x, y + 4 * 0.43); g.lineTo(x, y + 12 * 0.43);
      g.stroke();
    }

    /* 全域扫描扫掠 */
    if (st.globalSweepT > 0) {
      const p = 1 - st.globalSweepT / C.ENDGAME.sweep;
      const sy = p * H;
      const grd = g.createLinearGradient(0, sy - 30, 0, sy + 30);
      grd.addColorStop(0, 'rgba(255,210,110,0)');
      grd.addColorStop(0.5, 'rgba(255,210,110,0.28)');
      grd.addColorStop(1, 'rgba(255,210,110,0)');
      g.fillStyle = grd;
      g.fillRect(0, sy - 30, W, 60);
      g.strokeStyle = 'rgba(255,220,140,0.8)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke();
    }
    g.restore();

    /* 外框 + 扫描线 + 暗角 + 噪点 */
    g.strokeStyle = 'rgba(40,70,100,1)';
    g.lineWidth = 8;
    g.strokeRect(0, 0, W, H);
    g.strokeStyle = 'rgba(150,220,255,0.35)';
    g.lineWidth = 1;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let i = 0; i < H; i += 4) g.fillRect(0, i, W, 1);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    if (RNG() < 0.05) {
      g.fillStyle = 'rgba(160,220,255,0.05)';
      g.fillRect(0, RNG() * H, W, 1);
    }
  }

  /* ---------- 主渲染 ---------- */
  render(st) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const cam = st.cam;
    this.time += st.dt || 0.016;

    /* 巨幕蓝图 */
    this.drawMap(st);

    const f = (H * 0.5) / Math.tan(this.vfov() / 2);
    const cy = H / 2;
    const pitchPx = Math.tan(cam.pitch) * f;

    /* 天顶与地面 */
    let ceil = ctx.createLinearGradient(0, 0, 0, cy + pitchPx);
    ceil.addColorStop(0, '#04060a');
    ceil.addColorStop(1, '#0b1018');
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, W, Math.max(0, cy + pitchPx));
    let floor = ctx.createLinearGradient(0, cy + pitchPx, 0, H);
    floor.addColorStop(0, '#131922');
    floor.addColorStop(0.25, '#0d1117');
    floor.addColorStop(1, '#04060a');
    ctx.fillStyle = floor;
    ctx.fillRect(0, cy + pitchPx, W, H - (cy + pitchPx));

    /* 地面网格 */
    ctx.strokeStyle = 'rgba(120,190,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -7; gx <= 7; gx++) {
      let started = false;
      for (let z = 0; z <= 15; z += 0.5) {
        const p = this.project(st, gx, 0, z);
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    for (let gz = 1; gz <= 14; gz++) {
      let started = false;
      for (let x = -8; x <= 8; x += 0.5) {
        const p = this.project(st, x, 0, gz);
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();

    /* 射线投射墙体 */
    const camGX = cam.x + 8;

    for (let i = 0; i < W; i++) {
      const rayA = cam.yaw - C.FOV / 2 + C.FOV * (i / W);
      const rayX = Math.sin(rayA), rayZ = -Math.cos(rayA);
      let mapX = Math.floor(camGX), mapZ = Math.floor(cam.z);
      const ddx = Math.abs(1 / rayX), ddz = Math.abs(1 / rayZ);
      let stepX, stepZ, sideX, sideZ;
      if (rayX < 0) { stepX = -1; sideX = (camGX - mapX) * ddx; }
      else { stepX = 1; sideX = (mapX + 1 - camGX) * ddx; }
      if (rayZ < 0) { stepZ = -1; sideZ = (cam.z - mapZ) * ddz; }
      else { stepZ = 1; sideZ = (mapZ + 1 - cam.z) * ddz; }
      let side = 0, type = 0, hx = 0, hz = 0, t = 0;
      for (let s = 0; s < 80; s++) {
        if (sideX < sideZ) { sideX += ddx; mapX += stepX; side = 0; }
        else { sideZ += ddz; mapZ += stepZ; side = 1; }
        t = side === 1 ? sideZ - ddz : sideX - ddx;
        hx = cam.x + t * rayX;
        hz = cam.z + t * rayZ;
        if (mapZ < 0) { type = 1; break; }                      // 巨幕墙
        if (mapZ >= 15 || mapX < 0 || mapX >= 16) { type = 2; break; }  // 混凝土墙
        if (MapGrid.isObs(mapX, mapZ)) { type = 3; break; }      // 障碍物
      }
      const perp = t * Math.cos(rayA - cam.yaw);
      const fogK = clamp(1.35 - perp * 0.055, 0.2, 1);
      let sk = type === 1 ? 0 : clamp(1 - hz / 16, 0, 1);
      sk = sk * sk * 0.85;   // 屏幕光:平方衰减,更柔和
      const wallH = type === 1 ? C.SCREEN_H : (type === 3 ? 2.3 : C.WALL_H);
      const floorY = cy + ((cam.y - 0) * f) / perp + pitchPx;
      const topY = floorY - (wallH * f) / perp;

      if (type === 1) {
        /* 巨幕:采样蓝图 */
        const u = clamp((hx + 8) / 16, 0, 1);
        const sx = clamp(Math.floor(u * (C.MAP_W - 1)), 0, C.MAP_W - 1);
        const bezTop = cy + ((cam.y - C.SCREEN_Y0) * f) / perp + pitchPx;
        const panelTop = bezTop - ((C.SCREEN_H - C.SCREEN_Y0) * f) / perp;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgb(' + (26 * fogK | 0) + ',' + (29 * fogK | 0) + ',' + (38 * fogK | 0) + ')';
        ctx.fillRect(i, bezTop, 1, floorY - bezTop);
        ctx.fillStyle = 'rgba(120,220,255,' + (0.55 * fogK).toFixed(3) + ')';
        ctx.fillRect(i, bezTop - 1, 1, 2);
        ctx.globalAlpha = clamp(fogK * 1.15, 0, 1);
        ctx.drawImage(this.mapCv, sx, 0, 1, C.MAP_H, i, panelTop, 1, bezTop - panelTop);
        ctx.globalAlpha = 1;
      } else {
        let r, g2, b;
        if (type === 3) {
          r = 48; g2 = 54; b = 66;
        } else {
          r = 64; g2 = 72; b = 86;
          r += 78 * sk; g2 += 95 * sk; b += 112 * sk;
        }
        const h = hash2(mapX, mapZ) * 0.22 + 0.88;
        ctx.fillStyle = 'rgb(' + ((r * h * fogK) | 0) + ',' + ((g2 * h * fogK) | 0) + ',' + ((b * h * fogK) | 0) + ')';
        ctx.fillRect(i, topY, 1, floorY - topY);
        /* 障碍物警示带 */
        if (type === 3) {
          const bandH = (0.2 * f) / perp;
          if ((((hx + hz) * 6) | 0) % 2 === 0) {
            ctx.fillStyle = 'rgba(184,150,60,' + fogK.toFixed(3) + ')';
          } else {
            ctx.fillStyle = 'rgba(20,22,26,' + fogK.toFixed(3) + ')';
          }
          ctx.fillRect(i, topY, 1, Math.min(bandH, floorY - topY));
          ctx.fillStyle = 'rgba(140,200,255,' + (0.14 * fogK).toFixed(3) + ')';
          ctx.fillRect(i, topY + Math.min(bandH, floorY - topY), 1, 1);
        }
      }
    }

    /* 顶部压暗 */
    const topShade = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    topShade.addColorStop(0, 'rgba(0,0,0,0.34)');
    topShade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, W, H * 0.55);

    /* 3D 特效(玩家房间) */
    this.drawFx3d(ctx, st, f, cy, pitchPx);

    /* 巨幕边缘闪(敌方开火位置) */
    if (st.edgeFlash && st.edgeFlash.t > 0) {
      const p = this.project(st, st.edgeFlash.u * 16 - 8, C.SCREEN_Y0 + 0.05, 0.08);
      if (p) {
        const a = clamp(st.edgeFlash.t / 0.55, 0, 1);
        const grd = ctx.createLinearGradient(p.x - 26, 0, p.x + 26, 0);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.5, st.edgeFlash.color === '#ff5040' ? 'rgba(255,80,64,' + (0.85 * a).toFixed(3) + ')' : 'rgba(180,230,255,' + (0.7 * a).toFixed(3) + ')');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(p.x - 26, p.y - 4, 52, 10);
      }
    }

    /* 尘埃 */
    ctx.fillStyle = 'rgba(150,210,255,0.5)';
    for (const d of this.dust) {
      const tw = 0.06 + 0.05 * Math.sin(this.time * 1.4 + d.ph);
      const p = this.project(st, d.x, d.y, d.z);
      if (!p) continue;
      const a = clamp(0.16 - p.depth * 0.008, 0, 0.14) * (0.5 + 0.5 * Math.sin(this.time * 2.1 + d.ph * 3));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    /* 枪械视图 */
    this.drawGun(ctx, st);

    /* 受击方向指示 */
    if (st.lastHitAt && st.lastHitAt.t > 0 && st.redFlash > 0.4) {
      const p = this.project(st, st.lastHitAt.x, 1.2, st.lastHitAt.z);
      if (p) {
        const ang = Math.atan2(p.y - cy, p.x - W / 2);
        const ex = W / 2 + Math.cos(ang) * (W * 0.42);
        const ey = cy + Math.sin(ang) * (H * 0.42);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,70,60,' + (st.redFlash * 0.85).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-4, -8); ctx.lineTo(-1, 0); ctx.lineTo(-4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    /* 准星 */
    this.drawCrosshair(ctx, st);

    /* 屏幕空间覆盖层 */
    if (st.redFlash > 0) {
      const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
      rg.addColorStop(0, 'rgba(255,30,20,0)');
      rg.addColorStop(1, 'rgba(255,30,20,' + (st.redFlash * 0.6).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,40,30,' + (st.redFlash * 0.14).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (st.confirmFlash > 0) {
      ctx.fillStyle = 'rgba(140,240,255,' + (st.confirmFlash * 0.1).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    /* 扫描线 */
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = this.patScanlines();
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    /* 暗角 */
    ctx.fillStyle = this.vignette();
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawFx3d(ctx, st, f, cy, pitchPx) {
    for (const ev of st.fx3d) {
      const a = clamp(ev.t / ev.life, 0, 1);
      if (ev.kind === 'pulse') {
        const r = C.SCAN_R * (1 - a) + 0.3;
        const pts = [];
        for (let k = 0; k <= 26; k++) {
          const ang = k / 26 * TAU;
          pts.push(this.project(st, ev.x + Math.cos(ang) * r, 0.05, ev.z + Math.sin(ang) * r));
        }
        ctx.strokeStyle = 'rgba(120,235,255,' + (0.5 * a).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      } else if (ev.kind === 'incoming') {
        const p0 = this.project(st, ev.x, 0, ev.z);
        const p1 = this.project(st, ev.x, 3.2, ev.z);
        if (p0 && p1) {
          const col = ev.hit ? '255,80,64' : '200,240,255';
          ctx.strokeStyle = 'rgba(' + col + ',' + (0.9 * a).toFixed(3) + ')';
          ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          const rg = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, 30);
          rg.addColorStop(0, 'rgba(' + col + ',' + (0.7 * a).toFixed(3) + ')');
          rg.addColorStop(1, 'rgba(' + col + ',0)');
          ctx.fillStyle = rg;
          ctx.fillRect(p0.x - 30, p0.y - 30, 60, 60);
        }
      } else if (ev.kind === 'mark') {
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
        const pts = [];
        for (let k = 0; k <= 22; k++) {
          const ang = k / 22 * TAU;
          pts.push(this.project(st, ev.x + Math.cos(ang) * 0.8, 0.06, ev.z + Math.sin(ang) * 0.8));
        }
        ctx.strokeStyle = 'rgba(255,200,90,' + (0.75 * a * pulse).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        const p0 = this.project(st, ev.x, 0, ev.z);
        const p1 = this.project(st, ev.x, 2.8, ev.z);
        if (p0 && p1) {
          ctx.strokeStyle = 'rgba(255,200,90,' + (0.35 * a * pulse).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
      }
    }
  }

  drawGun(ctx, st) {
    const W = this.W, H = this.H;
    const p = st.player;
    const ready = 1 - clamp(p.gunCd / C.GUN_CD, 0, 1);
    const bobX = Math.sin(st.bob * 2) * 5;
    const bobY = Math.abs(Math.cos(st.bob)) * 5;
    const swX = clamp(st.sway, -1, 1) * 12;
    const rec = p.recoil;
    const gx = W * 0.62 + swX + bobX;
    const gy = H - 26 - bobY * 0.7 + rec * 22;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(-0.06 + rec * 0.05 + swX * 0.002);
    ctx.scale(clamp(H / 800, 0.7, 1.4), clamp(H / 800, 0.7, 1.4));
    /* 枪身 */
    ctx.fillStyle = '#14181f';
    ctx.strokeStyle = '#2c3644';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-130, 26); ctx.lineTo(-96, -8); ctx.lineTo(-60, -16);
    ctx.lineTo(30, -22); ctx.lineTo(96, -14); ctx.lineTo(140, 8);
    ctx.lineTo(118, 34); ctx.lineTo(40, 26); ctx.lineTo(-60, 44); ctx.closePath();
    ctx.fill(); ctx.stroke();
    /* 枪管 */
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(88, -20, 78, 12);
    ctx.fillRect(88, -2, 60, 8);
    ctx.strokeStyle = '#2c3644';
    ctx.strokeRect(88, -20, 78, 12);
    /* 能量核心 */
    const glow = ready;
    ctx.fillStyle = 'rgba(110,235,255,' + (0.35 + 0.6 * glow).toFixed(3) + ')';
    ctx.fillRect(6, -14, 62, 8);
    ctx.fillStyle = 'rgba(110,235,255,' + (0.25 + 0.5 * glow).toFixed(3) + ')';
    ctx.fillRect(20, -30, 26, 8);
    /* 细节 */
    ctx.strokeStyle = 'rgba(140,220,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-96, -8); ctx.lineTo(-40, -14);
    ctx.moveTo(-30, 30); ctx.lineTo(40, 20);
    ctx.stroke();
    /* 枪口闪光 */
    if (rec > 0.62) {
      const a = (rec - 0.62) / 0.38;
      ctx.save();
      ctx.translate(166, -14);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
      rg.addColorStop(0, 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')');
      rg.addColorStop(0.4, 'rgba(140,240,255,' + (0.6 * a).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(140,240,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * a).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2 + 0.3;
        ctx.moveTo(Math.cos(ang) * 6, Math.sin(ang) * 6);
        ctx.lineTo(Math.cos(ang) * (18 + a * 16), Math.sin(ang) * (18 + a * 16));
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawCrosshair(ctx, st) {
    const W = this.W, H = this.H;
    const x = W / 2, y = H / 2;
    const on = st.aim && st.aim.valid;
    const col = on ? '140,240,255' : '220,230,240';
    const a = on ? 0.95 : 0.45;
    ctx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2;
      ctx.moveTo(x + Math.cos(ang) * 13, y + Math.sin(ang) * 13);
      ctx.lineTo(x + Math.cos(ang) * 19, y + Math.sin(ang) * 19);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, TAU);
    ctx.fill();
    /* 侦测就绪 */
    if (st.player.scanReady && on) {
      ctx.fillStyle = 'rgba(140,240,255,0.9)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('◈ 侦测就绪', x, y + 26);
    }
  }
}
