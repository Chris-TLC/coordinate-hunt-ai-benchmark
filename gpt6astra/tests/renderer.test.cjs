const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const simulation = require('../src/simulation.js');
const browser = { Blindspot: { ...simulation } };
const sandbox = vm.createContext({ window: browser, Float32Array, Math });
vm.runInContext(readFileSync(resolve(__dirname, '../src/tactical.js'), 'utf8'), sandbox);
vm.runInContext(readFileSync(resolve(__dirname, '../src/renderer.js'), 'utf8'), sandbox);
const { RoomRenderer, TacticalDisplay, cameraBasis, SCREEN, MAP } = browser.Blindspot;

function makeCamera(eye, yaw, pitch) {
  const display = Object.create(TacticalDisplay.prototype);
  display.canvas = { width: 1792, height: 768 };
  const renderer = Object.create(RoomRenderer.prototype);
  Object.assign(renderer, { display, eye, yaw, pitch, fov: 65 * Math.PI / 180, aspect: 16 / 10 });
  return renderer;
}

test('screen ray maps a real point on the billboard into the mirrored room', () => {
  const desired = { x: 4.5, z: 6.2 };
  const coordinates = simulation.worldToMap(desired.x, desired.z);
  const textureX = (MAP.x + MAP.width * coordinates.u) / 1792;
  const textureY = (MAP.y + MAP.height * coordinates.v) / 768;
  const point = [SCREEN.x + textureX * SCREEN.width, SCREEN.bottom + (1 - textureY) * SCREEN.height, SCREEN.z];
  const eye = [-1.2, 1.72, 12];
  const yaw = Math.atan2(point[0] - eye[0], eye[2] - point[2]);
  const pitch = Math.atan2(point[1] - eye[1], Math.hypot(point[0] - eye[0], point[2] - eye[2]));
  const target = makeCamera(eye, yaw, pitch).aim(0, 0);
  assert.ok(Math.abs(target.x - desired.x) < 0.00001);
  assert.ok(Math.abs(target.z - desired.z) < 0.00001);
});

test('looking away or pointing at the screen sidebar cannot hit the remote map', () => {
  assert.equal(makeCamera([0, 1.72, 12], Math.PI, 0).aim(0, 0), null);
  assert.equal(makeCamera([0, 1.72, 12], 0, 1.1).aim(0, 0), null);
  assert.equal(makeCamera([0, 1.72, 12], 0, 0.17).aim(-0.9, 0), null);
});

test('fresh free-pointer coordinates produce fresh shot targets without a frame tick', () => {
  const renderer = makeCamera([0, 1.72, 12], 0, 0.17);
  const first = renderer.aim(-0.1, 0);
  const second = renderer.aim(0.1, 0);
  assert.ok(first && second);
  assert.ok(second.x - first.x > 3);
  assert.ok(Math.abs(second.z - first.z) < 0.0001);
});

test('camera forward, up and right stay orthonormal at steep viewing angles', () => {
  const basis = cameraBasis(2.2, 1.05);
  for (const vector of Object.values(basis)) assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.00001);
  const dot = (first, second) => first.reduce((sum, value, index) => sum + value * second[index], 0);
  assert.ok(Math.abs(dot(basis.forward, basis.up)) < 0.00001);
  assert.ok(Math.abs(dot(basis.forward, basis.right)) < 0.00001);
});
