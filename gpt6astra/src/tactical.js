(function (root) {
  'use strict';
  const { OBSTACLES, worldToMap, mapToWorld, clamp } = root.Blindspot;
  const MAP = Object.freeze({ x: 550, y: 83, width: 676, height: 634 });

  class TacticalDisplay {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1792;
      this.canvas.height = 768;
      this.context = this.canvas.getContext('2d');
      this.base = document.createElement('canvas');
      this.base.width = 1792;
      this.base.height = 768;
      this.drawBase();
      this.lastUpdate = -1;
    }

    point(x, z) {
      const normalized = worldToMap(x, z);
      return { x: MAP.x + normalized.u * MAP.width, y: MAP.y + normalized.v * MAP.height };
    }

    target(u, v) {
      const screenX = u * this.canvas.width;
      const screenY = v * this.canvas.height;
      if (screenX < MAP.x || screenX > MAP.x + MAP.width || screenY < MAP.y || screenY > MAP.y + MAP.height) return null;
      return mapToWorld((screenX - MAP.x) / MAP.width, (screenY - MAP.y) / MAP.height);
    }

    text(context, text, x, y, size = 16, color = '#6c948c', font = 'monospace') {
      context.fillStyle = color;
      context.font = `${size}px ${font}`;
      context.fillText(text, x, y);
    }

    drawBase() {
      const context = this.base.getContext('2d');
      context.fillStyle = '#152f2c';
      context.fillRect(0, 0, 1792, 768);
      const wash = context.createRadialGradient(890, 390, 80, 890, 390, 1040);
      wash.addColorStop(0, '#284b42');
      wash.addColorStop(1, '#152b29');
      context.fillStyle = wash;
      context.fillRect(0, 0, 1792, 768);
      context.strokeStyle = '#71998a45';
      context.lineWidth = 1;
      context.strokeRect(24.5, 24.5, 1743, 719);
      context.beginPath();
      context.moveTo(480, 25); context.lineTo(480, 743);
      context.moveTo(1292, 25); context.lineTo(1292, 743);
      context.stroke();
      this.text(context, 'B / 02', 68, 155, 94, '#b3c9b1', '"Helvetica Neue", sans-serif');
      this.text(context, 'REMOTE CHAMBER', 72, 204, 21, '#b9cdbb');
      this.text(context, '镜像房间 · 对方区域', 72, 246, 22, '#80a394', 'sans-serif');
      context.fillStyle = '#779f8b55'; context.fillRect(72, 283, 328, 1);
      this.text(context, 'SURFACE AREA', 72, 326, 14);
      this.text(context, '16 × 15 m', 72, 364, 28, '#bdd1bc');
      this.text(context, 'VISUAL CONTACT', 72, 426, 14);
      this.text(context, 'UNAVAILABLE', 72, 460, 23, '#b1c1aa');
      this.text(context, '没有人影。只有回声。', 72, 520, 20, '#87a792', 'sans-serif');
      this.text(context, 'ACOUSTIC SIGNAL', 72, 603, 14);
      this.text(context, 'SPACE TRANSFER / ACTIVE', 72, 710, 13, '#719082');
      this.text(context, '声纹图谱', 1344, 104, 28, '#c7d4bd', 'sans-serif');
      this.text(context, 'ECHO TOPOGRAPHY', 1344, 136, 14);
      const legend = [['#dbae75', '枪声残影', 'FIRE / HIGH CONFIDENCE'], ['#a9bc9e', '脚步轨迹', 'STEP / LOW CONFIDENCE'], ['#7bcbb1', '侦测波纹', 'SCAN / LOCAL CONTACT']];
      legend.forEach((entry, index) => {
        const height = 218 + index * 108;
        context.fillStyle = entry[0]; context.globalAlpha = 0.26;
        context.beginPath(); context.arc(1357, height - 7, 13, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 1; context.strokeStyle = entry[0];
        context.beginPath(); context.arc(1357, height - 7, 5, 0, Math.PI * 2); context.stroke();
        this.text(context, entry[1], 1388, height, 21, '#b8c8b0', 'sans-serif');
        this.text(context, entry[2], 1388, height + 28, 11);
      });
      context.fillStyle = '#779f8b44'; context.fillRect(1344, 510, 367, 1);
      this.text(context, '瞄准地图，子弹落在对面。', 1344, 550, 18, '#aac0a8', 'sans-serif');
      this.text(context, '开枪，也会留下你的回声。', 1344, 583, 18, '#88a08c', 'sans-serif');
      this.text(context, 'NO DIRECT LINE OF SIGHT', 1344, 710, 12);
      context.fillStyle = '#6d987d16'; context.fillRect(MAP.x, MAP.y, MAP.width, MAP.height);
      context.strokeStyle = '#8daf9440';
      for (let column = 0; column <= 16; column++) {
        const x = MAP.x + column / 16 * MAP.width;
        context.lineWidth = column % 4 === 0 ? 1.5 : 0.6;
        context.beginPath(); context.moveTo(x, MAP.y); context.lineTo(x, MAP.y + MAP.height); context.stroke();
      }
      for (let row = 0; row <= 15; row++) {
        const y = MAP.y + row / 15 * MAP.height;
        context.lineWidth = row % 5 === 0 ? 1.5 : 0.6;
        context.beginPath(); context.moveTo(MAP.x, y); context.lineTo(MAP.x + MAP.width, y); context.stroke();
      }
      context.strokeStyle = '#b9cca991'; context.lineWidth = 3;
      context.strokeRect(MAP.x, MAP.y, MAP.width, MAP.height);
      context.strokeStyle = '#b9cca944'; context.lineWidth = 1;
      context.strokeRect(MAP.x - 8, MAP.y - 8, MAP.width + 16, MAP.height + 16);
      for (const block of OBSTACLES) {
        const origin = this.point(block.x - block.width / 2, block.z - block.depth / 2);
        const width = block.width / 16 * MAP.width;
        const height = block.depth / 15 * MAP.height;
        context.fillStyle = '#8bad8130'; context.fillRect(origin.x, origin.y, width, height);
        context.strokeStyle = '#b8c99a9c'; context.lineWidth = 1.5; context.strokeRect(origin.x, origin.y, width, height);
        context.save(); context.beginPath(); context.rect(origin.x, origin.y, width, height); context.clip();
        context.strokeStyle = '#93ab7940'; context.lineWidth = 1;
        for (let stripe = -height; stripe < width; stripe += 9) {
          context.beginPath(); context.moveTo(origin.x + stripe, origin.y + height); context.lineTo(origin.x + stripe + height, origin.y); context.stroke();
        }
        context.restore();
        this.text(context, block.label, origin.x + width / 2 - 9, origin.y + height / 2 + 6, 17, '#c0cba6');
      }
      context.textAlign = 'center';
      for (let index = 0; index < 4; index++) this.text(context, ['A', 'B', 'C', 'D'][index], MAP.x + MAP.width * (index + 0.5) / 4, 57, 15, '#a8b99a');
      this.text(context, '16 m', MAP.x + MAP.width / 2, 748, 12);
      context.textAlign = 'left';
      for (let index = 0; index < 3; index++) this.text(context, String(index + 1).padStart(2, '0'), MAP.x - 42, MAP.y + MAP.height * (index + 0.5) / 3 + 5, 14, '#a8b99a');
      context.fillStyle = '#b7d5af'; context.fillRect(MAP.x + MAP.width * 0.15, MAP.y - 2, MAP.width * 0.7, 4);
      this.text(context, 'SCREEN', MAP.x + MAP.width / 2 - 23, MAP.y + 20, 10, '#a3b494');
      for (let row = 0; row < 768; row += 3) { context.fillStyle = '#0000000c'; context.fillRect(0, row, 1792, 1); }
    }

    draw(model, target, time, demo = false) {
      const context = this.context;
      context.clearRect(0, 0, 1792, 768);
      context.drawImage(this.base, 0, 0);
      const visible = model ? model.visibleTo('player') : { traces: [], scans: [], impacts: [], outgoing: [] };
      const traces = demo ? [
        { x: Math.sin(time * 0.23) * 4, z: 5.3 + Math.cos(time * 0.34), born: time - 0.8, life: 3.2, dx: 1.6, dz: 0.7, type: 'step', strength: 0.8 },
        { x: -4.7, z: 11, born: time - (time % 5), life: 4.4, dx: 0, dz: 0, type: 'shot', strength: 1 }
      ] : visible.traces;
      context.save(); context.beginPath(); context.rect(MAP.x + 2, MAP.y + 2, MAP.width - 4, MAP.height - 4); context.clip();
      const scanline = MAP.y + (time * 32 % MAP.height);
      const sweep = context.createLinearGradient(0, scanline - 65, 0, scanline);
      sweep.addColorStop(0, '#abcaa400'); sweep.addColorStop(1, '#abcaa40b');
      context.fillStyle = sweep; context.fillRect(MAP.x, scanline - 65, MAP.width, 65);
      context.fillStyle = '#b9d2ad16'; context.fillRect(MAP.x, scanline, MAP.width, 1);
      for (const scan of visible.scans) {
        const center = this.point(scan.x, scan.z);
        const radius = scan.radius / 16 * MAP.width;
        const phase = (time - scan.born) % 1.2 / 1.2;
        const gradient = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
        gradient.addColorStop(0, '#6bcbae04'); gradient.addColorStop(0.8, '#6bcbae18'); gradient.addColorStop(1, '#6bcbae00');
        context.fillStyle = gradient; context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.fill();
        context.strokeStyle = '#8bd6b5b0'; context.lineWidth = 1.5; context.setLineDash([4, 5]);
        context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
        context.strokeStyle = `rgba(161,227,188,${(1 - phase) * 0.65})`;
        context.beginPath(); context.arc(center.x, center.y, radius * phase, 0, Math.PI * 2); context.stroke();
        this.text(context, scan.occupied === null ? '扫描中' : scan.occupied ? '检测到移动' : '暂无声纹 · 空', center.x - 35, center.y + radius + 21, 13, '#b9ddbb', 'sans-serif');
      }
      for (const trace of traces) {
        const age = time - trace.born;
        if (age < 0 || age >= trace.life) continue;
        const fade = Math.pow(1 - age / trace.life, 1.4) * trace.strength;
        const center = this.point(trace.x, trace.z);
        const radius = trace.type === 'shot' ? 43 + age * 6 : trace.type === 'scan' ? 19 : 28;
        const color = trace.type === 'shot' ? '239,177,107' : trace.type === 'scan' ? '145,230,186' : '205,220,166';
        const bloom = context.createRadialGradient(center.x, center.y, 2, center.x, center.y, radius);
        bloom.addColorStop(0, `rgba(${color},${fade * 0.57})`);
        bloom.addColorStop(0.36, `rgba(${color},${fade * 0.24})`);
        bloom.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = bloom; context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.fill();
        if (trace.dx || trace.dz) {
          const tail = this.point(trace.x - trace.dx, trace.z - trace.dz);
          const line = context.createLinearGradient(tail.x, tail.y, center.x, center.y);
          line.addColorStop(0, `rgba(${color},0)`); line.addColorStop(1, `rgba(${color},${fade * 0.5})`);
          context.strokeStyle = line; context.lineWidth = 7; context.lineCap = 'round';
          context.beginPath(); context.moveTo(tail.x, tail.y); context.quadraticCurveTo((tail.x + center.x) / 2 + 5, (tail.y + center.y) / 2, center.x, center.y); context.stroke();
          context.lineCap = 'butt';
        }
        if (trace.type === 'shot') {
          context.strokeStyle = `rgba(${color},${fade * 0.48})`; context.lineWidth = 1;
          context.beginPath(); context.arc(center.x, center.y, 16 + age * 10, 0, Math.PI * 2); context.stroke();
          this.text(context, '声源', center.x + 22, center.y - 16, 11, `rgba(${color},${fade})`, 'sans-serif');
        }
      }
      for (const shot of visible.outgoing) {
        const center = this.point(shot.x, shot.z);
        const progress = clamp((time - shot.born) / 0.52, 0, 1);
        context.strokeStyle = '#e3e3b7'; context.lineWidth = 1.3;
        context.beginPath(); context.arc(center.x, center.y, 5 + (1 - progress) * 28, 0, Math.PI * 2); context.stroke();
        context.beginPath(); context.moveTo(center.x - 6, center.y); context.lineTo(center.x + 6, center.y); context.moveTo(center.x, center.y - 6); context.lineTo(center.x, center.y + 6); context.stroke();
      }
      for (const impact of visible.impacts) {
        const age = time - impact.born;
        const center = this.point(impact.x, impact.z);
        context.globalAlpha = Math.max(0, 1 - age / 1.5);
        context.strokeStyle = impact.damage ? '#f1c787' : '#acb89e'; context.lineWidth = impact.damage ? 2 : 1;
        context.beginPath(); context.arc(center.x, center.y, 12 + age * 25, 0, Math.PI * 2); context.stroke();
        if (impact.damage) this.text(context, `−${impact.damage}`, center.x + 17, center.y - 15 - age * 12, 24, '#f2c990');
        else this.text(context, impact.blocked ? '掩体' : '未命中', center.x + 14, center.y - 13, 12, '#adbc9e', 'sans-serif');
        context.globalAlpha = 1;
      }
      if (target && !demo) {
        const center = this.point(target.x, target.z);
        context.strokeStyle = '#e0e7c48c'; context.lineWidth = 1;
        context.setLineDash([3, 6]);
        context.beginPath(); context.moveTo(center.x, MAP.y); context.lineTo(center.x, MAP.y + MAP.height); context.moveTo(MAP.x, center.y); context.lineTo(MAP.x + MAP.width, center.y); context.stroke(); context.setLineDash([]);
        context.strokeStyle = '#e4e9c9'; context.beginPath(); context.arc(center.x, center.y, 12, 0, Math.PI * 2); context.stroke();
      }
      context.restore();
      const strength = traces.reduce((sum, trace) => sum + Math.max(0, 1 - (time - trace.born) / trace.life), 0);
      context.strokeStyle = '#adc6a2'; context.lineWidth = 1;
      context.beginPath();
      for (let index = 0; index < 160; index++) {
        const amplitude = 3 + Math.min(strength, 4) * 5;
        const height = Math.sin(index * 0.42 + time * 4) * Math.sin(index * 0.14 - time * 2) * amplitude;
        if (index === 0) context.moveTo(72, 646 + height); else context.lineTo(72 + index * 2.05, 646 + height);
      }
      context.stroke();
      context.fillStyle = strength > 0.3 ? '#b5d49d' : '#638376'; context.beginPath(); context.arc(1687, 663, 5, 0, Math.PI * 2); context.fill();
      this.text(context, strength > 0.3 ? 'SIGNAL DETECTED' : 'LISTENING…', 1344, 670, 16, '#a7c096');
      this.lastUpdate = time;
      return this.canvas;
    }
  }

  root.Blindspot.TacticalDisplay = TacticalDisplay;
  root.Blindspot.MAP = MAP;
})(window);
