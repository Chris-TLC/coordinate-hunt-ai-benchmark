const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');

test('all runtime code is local and never creates a network request', () => {
  const root = resolve(__dirname, '..');
  const sources = readdirSync(resolve(root, 'src')).filter(file => file.endsWith('.js')).map(file => readFileSync(resolve(root, 'src', file), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\s*\(/);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  assert.doesNotMatch(readFileSync(resolve(root, 'styles.css'), 'utf8'), /@import|url\(\s*['"]?https?:/);
});

test('the standalone deliverable has every source embedded and no local dependency', () => {
  const html = readFileSync(resolve(__dirname, '../盲区.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]*\bsrc=|<link[^>]*rel="stylesheet"/);
  for (const name of ['class Duel', 'class RoomRenderer', 'class Soundscape', 'class TacticalDisplay', 'function startRound()']) assert.ok(html.includes(name));
  assert.equal((html.match(/<script>/g) || []).length, 5);
  assert.equal((html.match(/<\/script>/g) || []).length, 5);
});
