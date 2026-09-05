'use strict';
/* ================= 地图:网格、碰撞、声影 ================= */

const MapGrid = {
  gw: 16, gh: 15,
  wall: new Uint8Array(16 * 15),
  obs: [],

  init() {
    this.wall.fill(0);
    this.obs = MAPDEF.obstacles.map(o => ({
      gx: o.gx, gz: o.gz, w: o.w, h: o.h,
      x0: o.gx - 8, x1: o.gx + o.w - 8, z0: o.gz, z1: o.gz + o.h,
    }));
    for (const o of MAPDEF.obstacles)
      for (let gx = o.gx; gx < o.gx + o.w; gx++)
        for (let gz = o.gz; gz < o.gz + o.h; gz++)
          this.wall[gz * 16 + gx] = 1;
  },

  isObs(gx, gz) {
    if (gx < 0 || gx >= 16 || gz < 0 || gz >= 15) return false;
    return this.wall[gz * 16 + gx] === 1;
  },

  /* 圆 vs 障碍物 + 边界,返回修正后的位置(滑动) */
  collide(x, z, r) {
    let px = x, pz = z;
    for (const o of this.obs) {
      const nx = clamp(px, o.x0 - r, o.x1 + r);
      const nz = clamp(pz, o.z0 - r, o.z1 + r);
      if (nx === px && nz === pz) continue;
      const dx = px - nx, dz = pz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = r - d;
        px = nx + (dx / d) * push;
        pz = nz + (dz / d) * push;
      }
    }
    px = clamp(px, -8 + r, 8 - r);
    pz = clamp(pz, r, 15 - r);
    return { x: px, z: pz };
  },

  /* 是否处于障碍物的"声影"(障碍物位于它与巨幕之间 → 脚步声更轻) */
  muffled(x, z) {
    for (const o of this.obs)
      if (x > o.x0 - 0.05 && x < o.x1 + 0.05 && z > o.z1) return true;
    return false;
  },

  /* 该点是否在障碍物内 */
  insideObs(x, z) {
    for (const o of this.obs)
      if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return true;
    return false;
  },

  /* 随机取一个可站立点 */
  randomFree(margin, rngFn) {
    const R = rngFn || RNG;
    for (let i = 0; i < 16; i++) {
      const x = -8 + margin + R() * (16 - margin * 2);
      const z = margin + R() * (15 - margin * 2);
      if (!this.insideObs(x, z)) return { x, z };
    }
    return { x: 0, z: 13.5 };
  },
};

MapGrid.init();
