const test = require('node:test');
const assert = require('node:assert/strict');
const { Duel, ARENA, OBSTACLES, mapToWorld, worldToMap, SeededRandom, damageAt } = require('../src/simulation.js');

test('the mirrored arena is exactly 16 by 15 metres', () => {
  assert.equal(ARENA.width, 16);
  assert.equal(ARENA.depth, 15);
  assert.deepEqual(mapToWorld(0, 0), { x: -8, z: 0 });
  assert.deepEqual(mapToWorld(1, 1), { x: 8, z: 15 });
  const point = { x: 3.5, z: 9.2 };
  const mapped = worldToMap(point.x, point.z);
  const restored = mapToWorld(mapped.u, mapped.v);
  assert.ok(Math.abs(restored.x - point.x) < 0.00001);
  assert.ok(Math.abs(restored.z - point.z) < 0.00001);
});

test('seeded sessions are deterministic', () => {
  const first = new SeededRandom(42);
  const second = new SeededRandom(42);
  for (let sample = 0; sample < 30; sample++) assert.equal(first.next(), second.next());
});

test('shots consume ammunition and have travel time', () => {
  const duel = new Duel({ seed: 17, ai: false });
  duel.enemy.x = 0;
  duel.enemy.z = 8;
  assert.equal(duel.fire('player', { x: 0, z: 8 }), true);
  assert.equal(duel.player.ammo, 5);
  assert.equal(duel.enemy.hp, 100);
  assert.equal(duel.fire('player', { x: 0, z: 8 }), false);
  duel.step(0.6, {});
  assert.equal(duel.enemy.hp, 66);
  assert.equal(duel.stats.hits, 1);
});

test('an empty shot still reveals the shooter but never a live entity', () => {
  const duel = new Duel({ ai: false });
  duel.fire('player', { x: 7, z: 2 });
  const echo = duel.visibleTo('enemy').traces.find(trace => trace.type === 'shot');
  assert.ok(echo);
  assert.ok(Math.hypot(echo.x - duel.player.x, echo.z - duel.player.z) < 1.3);
  assert.equal(duel.visibleTo('player').enemy, undefined);
  assert.equal(duel.visibleTo('player').position, undefined);
});

test('reload is timed and cannot create extra ammunition', () => {
  const duel = new Duel({ ai: false });
  duel.player.ammo = 2;
  assert.equal(duel.reload('player'), true);
  assert.equal(duel.fire('player', { x: 0, z: 8 }), false);
  duel.step(1.6, {});
  assert.equal(duel.player.ammo, 6);
  assert.equal(duel.reload('player'), false);
});

test('movement remains inside boundaries and outside solid obstacles', () => {
  const duel = new Duel({ ai: false });
  for (let frame = 0; frame < 900; frame++) duel.step(1 / 60, { x: -1, z: 1, sprint: true });
  assert.ok(duel.player.x >= -8 + ARENA.radius);
  assert.ok(duel.player.z <= 15 - ARENA.radius);
  const block = OBSTACLES[0];
  duel.player.x = block.x - block.width / 2 - 0.5;
  duel.player.z = block.z;
  for (let frame = 0; frame < 120; frame++) duel.step(1 / 60, { x: 1, z: 0 });
  assert.ok(duel.player.x <= block.x - block.width / 2 - ARENA.radius + 0.001);
});

test('standing still and quiet movement do not broadcast ordinary footsteps', () => {
  const duel = new Duel({ ai: false });
  duel.step(2, {});
  assert.equal(duel.visibleTo('enemy').traces.length, 0);
  for (let frame = 0; frame < 60; frame++) duel.step(1 / 60, { x: 1, z: 0, quiet: true });
  assert.equal(duel.visibleTo('enemy').traces.length, 0);
});

test('scan reports empty space and only produces tracks inside its radius', () => {
  const duel = new Duel({ ai: false });
  duel.enemy.x = 5;
  duel.enemy.z = 12;
  assert.equal(duel.scan('player', { x: -5, z: 2 }), true);
  duel.step(0.6, {});
  assert.equal(duel.visibleTo('player').scans[0].occupied, false);
  assert.equal(duel.visibleTo('player').traces.length, 0);
  assert.equal(duel.scan('player', { x: 5, z: 12 }), false);
  duel.player.scanCooldown = 0;
  duel.scan('player', { x: 5, z: 12 });
  duel.step(0.6, {});
  assert.ok(duel.visibleTo('player').traces.some(trace => trace.type === 'scan'));
});

test('enemy target decisions cannot read an unobserved player position', () => {
  const first = new Duel({ seed: 4 });
  const second = new Duel({ seed: 4 });
  first.player.x = -7;
  second.player.x = 7;
  assert.deepEqual(first.chooseEnemyTarget(), second.chooseEnemyTarget());
  assert.equal(first.enemyBrain.memory, null);
});

test('a hit triggers a brief escape boost', () => {
  const duel = new Duel({ ai: false });
  duel.fire('enemy', { x: duel.player.x, z: duel.player.z });
  duel.step(0.6, {});
  assert.equal(duel.player.hp, 66);
  assert.ok(duel.player.boost > 0);
});

test('120 seconds resolves by health and tied health is a draw', () => {
  const duel = new Duel({ ai: false });
  duel.enemy.hp = 66;
  duel.step(119.9, {});
  assert.equal(duel.result, null);
  duel.step(0.1, {});
  assert.equal(duel.result.winner, 'player');
  assert.equal(duel.remaining, 0);
  const draw = new Duel({ ai: false });
  draw.step(120, {});
  assert.equal(draw.result.winner, 'draw');
});

test('elimination ends the round and freezes all game actions', () => {
  const duel = new Duel({ ai: false });
  duel.enemy.hp = 34;
  duel.enemy.x = 0;
  duel.enemy.z = 8;
  duel.fire('player', { x: 0, z: 8 });
  duel.step(0.6, {});
  assert.equal(duel.result.winner, 'player');
  const frozenTime = duel.time;
  duel.step(10, { x: 1 });
  assert.equal(duel.time, frozenTime);
  assert.equal(duel.fire('player', { x: 0, z: 8 }), false);
});

test('invalid targets never consume ammunition or leak an extra trace', () => {
  const duel = new Duel({ ai: false });
  for (const target of [null, { x: NaN, z: 2 }, { x: 0, z: Infinity }, { x: -9, z: 4 }, { x: 0, z: 16 }]) {
    assert.equal(duel.fire('player', target), false);
  }
  assert.equal(duel.player.ammo, 6);
  assert.equal(duel.visibleTo('enemy').traces.length, 0);
});

test('a decoy waits before sounding and stays at the abandoned position', () => {
  const duel = new Duel({ ai: false, seed: 25 });
  const oldPosition = { x: duel.player.x, z: duel.player.z };
  assert.equal(duel.decoy('player'), true);
  assert.equal(duel.decoy('player'), false);
  duel.step(1.2, { x: 1, z: 0, quiet: true });
  assert.equal(duel.visibleTo('enemy').traces.length, 0);
  duel.step(0.15, { x: 1, z: 0, quiet: true });
  const trace = duel.visibleTo('enemy').traces[0];
  assert.ok(trace);
  assert.ok(Math.hypot(trace.x - oldPosition.x, trace.z - oldPosition.z) < 1);
  assert.ok(Math.abs(trace.x - duel.player.x) > 1);
});

test('cover blocks impact damage and the near miss ring has reduced damage', () => {
  const block = OBSTACLES[0];
  assert.equal(damageAt({ x: block.x, z: block.z }, { x: block.x, z: block.z + 0.7 }), 0);
  assert.equal(damageAt({ x: 0, z: 8 }, { x: 0.6, z: 8 }), 34);
  assert.equal(damageAt({ x: 0, z: 8 }, { x: 1.1, z: 8 }), 18);
  assert.equal(damageAt({ x: 0, z: 8 }, { x: 1.5, z: 8 }), 0);
  assert.equal(damageAt({ x: block.x, z: block.z - 0.57 }, { x: block.x, z: block.z + 0.57 }), 0);
});

test('diagonal movement is normalized and sprint trades stealth for speed', () => {
  const straight = new Duel({ ai: false });
  const diagonal = new Duel({ ai: false });
  straight.step(0.3, { x: 1, z: 0 });
  diagonal.step(0.3, { x: 1, z: -1 });
  assert.ok(Math.abs(straight.stats.distance - diagonal.stats.distance) < 0.001);
  const sprint = new Duel({ ai: false });
  sprint.step(0.35, { x: 1, z: 0, sprint: true });
  assert.ok(sprint.stats.distance > straight.stats.distance);
  assert.ok(sprint.visibleTo('enemy').traces.some(trace => trace.strength > 0.9));
});

test('enemy memory receives a shot only after the configured reaction delay', () => {
  const duel = new Duel({ seed: 12 });
  duel.fire('player', { x: 7, z: 2 });
  duel.step(0.2, {});
  assert.equal(duel.enemyBrain.memory, null);
  duel.step(0.35, {});
  assert.equal(duel.enemyBrain.memory.type, 'shot');
  assert.ok(Math.hypot(duel.enemyBrain.memory.x - duel.player.x, duel.enemyBrain.memory.z - duel.player.z) < 1);
});

test('scans and echoes expire without retaining permanent wallhack information', () => {
  const duel = new Duel({ ai: false });
  duel.scan('player', { x: duel.enemy.x, z: duel.enemy.z });
  duel.step(0.5, {});
  assert.ok(duel.visibleTo('player').traces.length > 0);
  duel.step(7, {});
  assert.equal(duel.visibleTo('player').traces.length, 0);
  assert.equal(duel.visibleTo('player').scans.length, 0);
});

test('full AI simulations complete with finite positions across all difficulties', () => {
  for (const difficulty of ['lucid', 'standard', 'nightmare']) {
    for (let seed = 1; seed <= 8; seed++) {
      const duel = new Duel({ difficulty, seed });
      duel.step(120, {});
      assert.ok(duel.result);
      for (const side of ['player', 'enemy']) {
        assert.ok(Number.isFinite(duel[side].x) && Number.isFinite(duel[side].z));
        assert.ok(duel[side].hp >= 0 && duel[side].hp <= 100);
        assert.ok(duel[side].ammo >= 0 && duel[side].ammo <= 6);
      }
    }
  }
});
