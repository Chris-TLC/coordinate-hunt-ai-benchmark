export const ARENA_WIDTH = 16;
export const ARENA_DEPTH = 15;
export const PLAYER_RADIUS = 0.32;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function uvToArena(u, v) {
  return {
    x: (clamp(Number.isFinite(u) ? u : 0.5, 0, 1) - 0.5) * ARENA_WIDTH,
    z: (0.5 - clamp(Number.isFinite(v) ? v : 0.5, 0, 1)) * ARENA_DEPTH,
  };
}

export function arenaToMap(x, z) {
  return {
    u: clamp((x / ARENA_WIDTH) + 0.5, 0, 1),
    v: clamp(0.5 - (z / ARENA_DEPTH), 0, 1),
  };
}

export function shotHits(shot, target, radius = 0.82) {
  if (!shot || !target) return false;
  return Math.hypot(shot.x - target.x, shot.z - target.z) <= radius;
}

function collides(position, radius, obstacle) {
  const nearestX = clamp(position.x, obstacle.x - obstacle.halfX, obstacle.x + obstacle.halfX);
  const nearestZ = clamp(position.z, obstacle.z - obstacle.halfZ, obstacle.z + obstacle.halfZ);
  return Math.hypot(position.x - nearestX, position.z - nearestZ) < radius;
}

export function moveWithCollisions(position, delta, radius = PLAYER_RADIUS, obstacles = []) {
  const limitX = (ARENA_WIDTH / 2) - radius;
  const limitZ = (ARENA_DEPTH / 2) - radius;
  const next = {
    x: clamp(position.x + (Number.isFinite(delta.x) ? delta.x : 0), -limitX, limitX),
    z: clamp(position.z + (Number.isFinite(delta.z) ? delta.z : 0), -limitZ, limitZ),
  };

  const xOnly = { x: next.x, z: position.z };
  const resolvedX = obstacles.some((obstacle) => collides(xOnly, radius, obstacle)) ? position.x : next.x;
  const zOnly = { x: resolvedX, z: next.z };
  const resolvedZ = obstacles.some((obstacle) => collides(zOnly, radius, obstacle)) ? position.z : next.z;

  return { x: resolvedX, z: resolvedZ };
}

export function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = (dx * dx) + (dz * dz);
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = clamp((((point.x - start.x) * dx) + ((point.z - start.z) * dz)) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + (dx * t)), point.z - (start.z + (dz * t)));
}
