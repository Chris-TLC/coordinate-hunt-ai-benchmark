import { createTacticalScreen } from './game/screen.js';
import { createRoomScene, OBSTACLES } from './game/scene.js';
import { InputController } from './game/input.js';
import { AudioSystem } from './game/audio.js';
import { UI } from './ui.js';
import { Game } from './game/game.js';

const canvas = document.querySelector('#game-canvas');
const error = document.querySelector('#boot-error');

try {
  const screen = createTacticalScreen(OBSTACLES);
  const scene = createRoomScene(canvas, screen);
  const input = new InputController(canvas);
  const audio = new AudioSystem();
  const ui = new UI();
  const game = new Game({ input, scene, screen, ui, audio, obstacles: OBSTACLES });

  canvas.addEventListener('click', () => {
    if (game.phase === 'running' && !input.locked) input.requestLock();
  });

  ui.startButton.addEventListener('click', () => {
    game.start();
    input.requestLock();
  });
  ui.resumeButton.addEventListener('click', () => input.requestLock());
  ui.restartButton.addEventListener('click', () => {
    game.start();
    input.requestLock();
  });
  ui.pauseRestartButton.addEventListener('click', () => {
    game.start();
    input.requestLock();
  });
  input.onLockChange = (locked) => {
    if (!locked && game.phase === 'running') game.pause();
    if (locked && game.phase === 'paused') game.resume();
  };

  let previous = performance.now();
  rendererLoop(previous);
  function rendererLoop(timestamp) {
    const dt = Math.min(0.05, (timestamp - previous) / 1000);
    previous = timestamp;
    game.update(dt);
    scene.render();
    requestAnimationFrame(rendererLoop);
  }
} catch (cause) {
  console.error(cause);
  error.textContent = `启动失败：${cause instanceof Error ? cause.message : String(cause)}`;
  error.classList.remove('is-hidden');
}
