import test from 'node:test';
import assert from 'node:assert/strict';

const geometry = await import('../src/game/geometry.js').catch(() => ({}));
const inference = await import('../src/game/inference.js').catch(() => ({}));

test('screen coordinates round-trip through the 16 by 15 meter arena', () => {
  assert.equal(typeof geometry.uvToArena, 'function');
  assert.equal(typeof geometry.arenaToMap, 'function');
  const point = geometry.uvToArena(0.75, 0.2);
  assert.deepEqual(point, { x: 4, z: 4.5 });
  const mapped = geometry.arenaToMap(point.x, point.z);
  assert.ok(Math.abs(mapped.u - 0.75) < 1e-9);
  assert.ok(Math.abs(mapped.v - 0.2) < 1e-9);
});

test('mapped shots hit only inside the configured radius', () => {
  assert.equal(typeof geometry.shotHits, 'function');
  assert.equal(geometry.shotHits({ x: 1, z: 1 }, { x: 1.7, z: 1.2 }, 0.8), true);
  assert.equal(geometry.shotHits({ x: 1, z: 1 }, { x: 1.9, z: 1 }, 0.8), false);
});

test('movement remains inside the room and outside solid obstacles', () => {
  assert.equal(typeof geometry.moveWithCollisions, 'function');
  const obstacles = [{ x: 0, z: 0, halfX: 1, halfZ: 1 }];
  assert.deepEqual(
    geometry.moveWithCollisions({ x: 7.6, z: 6 }, { x: 2, z: 0 }, 0.32, obstacles),
    { x: 7.68, z: 6 },
  );
  assert.deepEqual(
    geometry.moveWithCollisions({ x: -1.5, z: 0 }, { x: 1, z: 0 }, 0.7, obstacles),
    { x: -1.5, z: 0 },
  );
});

test('clue confidence decays and target estimation favors fresh precise evidence', () => {
  assert.equal(typeof inference.clueStrength, 'function');
  assert.equal(typeof inference.estimateTarget, 'function');
  assert.ok(inference.clueStrength({ createdAt: 8, ttl: 4, confidence: 1 }, 9) > 0.7);
  assert.equal(inference.clueStrength({ createdAt: 2, ttl: 4, confidence: 1 }, 7), 0);
  const target = inference.estimateTarget([
    { x: -5, z: -5, createdAt: 7, ttl: 7, confidence: 0.2 },
    { x: 3, z: 2, createdAt: 9.8, ttl: 4, confidence: 1 },
  ], 10);
  assert.ok(target.x > 2);
  assert.ok(target.z > 1);
  assert.ok(target.confidence > 0.5);
});
