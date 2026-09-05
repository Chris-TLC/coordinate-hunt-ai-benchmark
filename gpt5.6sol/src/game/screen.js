import * as THREE from 'three';
import { ARENA_DEPTH, ARENA_WIDTH, arenaToMap, uvToArena } from './geometry.js';
import { clueStrength } from './inference.js';

const WIDTH = 1400;
const HEIGHT = 600;
const MAP = { x: 414, y: 28, width: 572, height: 536 };

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function mapPixel(position) {
  const normalized = arenaToMap(position.x, position.z);
  return {
    x: MAP.x + (normalized.u * MAP.width),
    y: MAP.y + ((1 - normalized.v) * MAP.height),
  };
}

export function createTacticalScreen(obstacles) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const clues = [];
  const impacts = [];
  const scans = [];
  let status = '等待对向信号';
  let lastDraw = -1;

  function drawGrid(time) {
    ctx.fillStyle = '#06100f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const sweep = ((time * 48) % (HEIGHT + 120)) - 60;
    const sweepGradient = ctx.createLinearGradient(0, sweep - 70, 0, sweep + 70);
    sweepGradient.addColorStop(0, 'rgba(81, 212, 191, 0)');
    sweepGradient.addColorStop(0.5, 'rgba(81, 212, 191, 0.035)');
    sweepGradient.addColorStop(1, 'rgba(81, 212, 191, 0)');
    ctx.fillStyle = sweepGradient;
    ctx.fillRect(0, sweep - 70, WIDTH, 140);

    ctx.strokeStyle = 'rgba(145, 219, 205, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 30; x < WIDTH; x += 42) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
    for (let y = 12; y < HEIGHT; y += 42) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
    }
  }

  function drawSidePanels(time) {
    ctx.fillStyle = '#82a29d';
    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('对向空间 / LIVE', 48, 58);
    ctx.fillStyle = '#3f5b57';
    ctx.font = '12px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('ROOM 02', 48, 87);
    ctx.fillText(`${ARENA_WIDTH.toFixed(1)} × ${ARENA_DEPTH.toFixed(1)} M`, 48, 106);

    ctx.strokeStyle = 'rgba(139, 207, 194, 0.26)';
    ctx.beginPath(); ctx.moveTo(48, 132); ctx.lineTo(340, 132); ctx.stroke();
    for (let i = 0; i < 24; i += 1) {
      const value = 9 + (Math.sin((time * 3.1) + (i * 0.71)) * 7) + (Math.sin(i * 2.31) * 4);
      ctx.fillStyle = i % 6 === 0 ? '#a8e8dc' : '#31524d';
      ctx.fillRect(48 + (i * 12), 190 - value, 5, value);
    }
    ctx.fillStyle = '#3f5b57';
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('环境声学', 48, 215);

    ctx.fillStyle = '#82a29d';
    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('线索可信度', 1050, 58);
    ctx.fillStyle = '#405c57';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('脚步', 1050, 100); ctx.fillText('疾跑', 1050, 134); ctx.fillText('开火', 1050, 168); ctx.fillText('侦测', 1050, 202);
    const widths = [88, 132, 192, 238];
    widths.forEach((width, index) => {
      ctx.fillStyle = index > 1 ? 'rgba(255, 171, 116, 0.55)' : 'rgba(126, 221, 203, 0.44)';
      ctx.fillRect(1110, 92 + (index * 34), width, 5);
    });
    ctx.strokeStyle = 'rgba(139, 207, 194, 0.26)';
    ctx.beginPath(); ctx.moveTo(1050, 242); ctx.lineTo(1350, 242); ctx.stroke();
    ctx.fillStyle = '#63807a';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(status, 1050, 276);

    ctx.fillStyle = '#2f4b47';
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('不要相信旧轨迹', 1050, 520);
    ctx.fillText('SHOT MAPS TO FLOOR COORDINATE', 1050, 542);
  }

  function drawMapBase() {
    ctx.fillStyle = 'rgba(3, 12, 12, 0.92)';
    roundedRect(ctx, MAP.x, MAP.y, MAP.width, MAP.height, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(169, 232, 220, 0.64)';
    ctx.lineWidth = 2;
    ctx.strokeRect(MAP.x, MAP.y, MAP.width, MAP.height);

    ctx.strokeStyle = 'rgba(117, 189, 175, 0.12)';
    ctx.lineWidth = 1;
    for (let meter = 1; meter < ARENA_WIDTH; meter += 1) {
      const x = MAP.x + ((meter / ARENA_WIDTH) * MAP.width);
      ctx.beginPath(); ctx.moveTo(x, MAP.y); ctx.lineTo(x, MAP.y + MAP.height); ctx.stroke();
    }
    for (let meter = 1; meter < ARENA_DEPTH; meter += 1) {
      const y = MAP.y + ((meter / ARENA_DEPTH) * MAP.height);
      ctx.beginPath(); ctx.moveTo(MAP.x, y); ctx.lineTo(MAP.x + MAP.width, y); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(123, 192, 179, 0.14)';
    ctx.strokeStyle = 'rgba(160, 220, 208, 0.36)';
    obstacles.forEach((obstacle) => {
      const start = mapPixel({ x: obstacle.x - obstacle.halfX, z: obstacle.z - obstacle.halfZ });
      const end = mapPixel({ x: obstacle.x + obstacle.halfX, z: obstacle.z + obstacle.halfZ });
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      for (let line = -height; line < width; line += 12) {
        ctx.beginPath();
        ctx.moveTo(x + Math.max(0, line), y + Math.max(0, -line));
        ctx.lineTo(x + Math.min(width, line + height), y + Math.min(height, height + line));
        ctx.stroke();
      }
    });

    ctx.fillStyle = 'rgba(238, 255, 250, 0.38)';
    ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('N / FRONT WALL', MAP.x + 8, MAP.y + 14);
    ctx.fillText('16 M', MAP.x + (MAP.width / 2) - 14, MAP.y + MAP.height + 18);
    ctx.save();
    ctx.translate(MAP.x - 13, MAP.y + (MAP.height / 2) + 14);
    ctx.rotate(-Math.PI / 2); ctx.fillText('15 M', 0, 0); ctx.restore();
  }

  function drawScans(now) {
    scans.forEach((scan) => {
      const progress = Math.min(1, (now - scan.createdAt) / scan.ttl);
      const center = mapPixel(scan);
      const radius = (scan.radius / ARENA_WIDTH) * MAP.width;
      ctx.save();
      ctx.strokeStyle = `rgba(94, 224, 202, ${0.66 * (1 - (progress * 0.55))})`;
      ctx.fillStyle = `rgba(94, 224, 202, ${0.045 * (1 - progress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(center.x, center.y, radius * ((progress * 0.85) + 0.1), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
  }

  function drawClues(now) {
    const active = clues.filter((clue) => clueStrength(clue, now) > 0);
    active.forEach((clue) => {
      const strength = clueStrength(clue, now);
      const point = mapPixel(clue);
      ctx.save();
      if (clue.type === 'scan' || clue.type === 'trail') {
        const radius = clue.type === 'scan' ? 7 : 11;
        ctx.strokeStyle = clue.type === 'scan'
          ? `rgba(190, 255, 239, ${strength})`
          : `rgba(255, 166, 108, ${strength * 0.68})`;
        ctx.lineWidth = clue.type === 'scan' ? 2.5 : 1.5;
        if (clue.previous) {
          const previous = mapPixel(clue.previous);
          ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
        }
        ctx.shadowColor = clue.type === 'scan' ? '#a8e8dc' : '#ff8f58';
        ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.stroke();
      } else if (clue.type === 'shot') {
        ctx.strokeStyle = `rgba(255, 171, 116, ${strength})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff8c4f'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(point.x, point.y, 6 + ((1 - strength) * 32), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(point.x - 9, point.y); ctx.lineTo(point.x + 9, point.y); ctx.moveTo(point.x, point.y - 9); ctx.lineTo(point.x, point.y + 9); ctx.stroke();
      } else {
        const radius = 12 + ((1 - strength) * 21);
        const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        glow.addColorStop(0, `rgba(137, 235, 215, ${strength * 0.42})`);
        glow.addColorStop(0.45, `rgba(86, 195, 177, ${strength * 0.19})`);
        glow.addColorStop(1, 'rgba(86, 195, 177, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawImpacts(now) {
    impacts.forEach((impact) => {
      const age = now - impact.createdAt;
      if (age < 0 || age > impact.ttl) return;
      const progress = age / impact.ttl;
      const point = mapPixel(impact);
      const color = impact.hit ? '255, 224, 174' : '167, 228, 216';
      ctx.save();
      ctx.strokeStyle = `rgba(${color}, ${1 - progress})`;
      ctx.lineWidth = impact.hit ? 4 : 2;
      ctx.shadowColor = impact.hit ? '#ffad72' : '#91e8d6';
      ctx.shadowBlur = impact.hit ? 28 : 12;
      ctx.beginPath(); ctx.arc(point.x, point.y, 5 + (progress * 34), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
  }

  function update(now) {
    if (now - lastDraw < (1 / 30)) return;
    lastDraw = now;
    drawGrid(now);
    drawSidePanels(now);
    drawMapBase();
    drawScans(now);
    drawClues(now);
    drawImpacts(now);
    clues.splice(0, clues.length, ...clues.filter((clue) => clueStrength(clue, now) > 0));
    scans.splice(0, scans.length, ...scans.filter((scan) => now - scan.createdAt < scan.ttl));
    impacts.splice(0, impacts.length, ...impacts.filter((impact) => now - impact.createdAt < impact.ttl));
    texture.needsUpdate = true;
  }

  function screenUvToArena(uv) {
    const canvasX = uv.x * WIDTH;
    const canvasY = (1 - uv.y) * HEIGHT;
    if (canvasX < MAP.x || canvasX > MAP.x + MAP.width || canvasY < MAP.y || canvasY > MAP.y + MAP.height) return null;
    const localU = (canvasX - MAP.x) / MAP.width;
    const localV = 1 - ((canvasY - MAP.y) / MAP.height);
    return uvToArena(localU, localV);
  }

  return {
    texture,
    update,
    screenUvToArena,
    addClue(clue) { clues.push(clue); },
    addImpact(position, hit, now) { impacts.push({ ...position, hit, createdAt: now, ttl: hit ? 1.1 : 0.62 }); },
    addScan(position, radius, now, ttl = 5) { scans.push({ ...position, radius, createdAt: now, ttl }); },
    setStatus(value) { status = value; },
    reset() { clues.length = 0; impacts.length = 0; scans.length = 0; status = '等待对向信号'; },
  };
}
