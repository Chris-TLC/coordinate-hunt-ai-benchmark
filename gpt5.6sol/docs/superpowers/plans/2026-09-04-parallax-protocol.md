# Parallax Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete offline browser 1v1 coordinate-hunt game with a 120-second round.

**Architecture:** A deterministic game-rules layer owns coordinate transforms, collisions, hit resolution, clues, and AI estimates. A Three.js runtime owns the first-person room and weapon, while a CanvasTexture is the opponent-map display; DOM overlays own onboarding, HUD, pause, and results.

**Tech Stack:** Vite, JavaScript ES modules, Three.js, Canvas 2D, Web Audio, Node test runner.

## Global Constraints

- Arena dimensions are exactly 16 meters wide by 15 meters deep.
- A round lasts exactly 120 seconds.
- The game is offline, single-player, and playable in a MacBook browser without external media.
- Enemy position is never directly rendered on the map outside a successful scanner trace.

---

### Task 1: Rules and inference

**Files:** `test/game-rules.test.js`, `src/game/geometry.js`, `src/game/inference.js`

**Interfaces:** Produces `uvToArena`, `arenaToMap`, `shotHits`, `moveWithCollisions`, `clueStrength`, and `estimateTarget`.

- [ ] Write tests for coordinate round trips, hit radius, arena bounds, collision, clue decay, and weighted target estimates.
- [ ] Run `npm test` and verify the assertions fail because the exports do not exist.
- [ ] Implement the six pure functions with clamped coordinates and finite-value guards.
- [ ] Run `npm test` and verify all assertions pass.

### Task 2: Playable room and screen

**Files:** `index.html`, `src/main.js`, `src/style.css`, `src/game/scene.js`, `src/game/screen.js`, `src/game/input.js`

**Interfaces:** `createScene()` returns renderer, camera, collision obstacles, screen mesh, weapon, and update/render callbacks. `createTacticalScreen()` returns a CanvasTexture plus clue and effect commands.

- [ ] Build the 16×15×4.6 meter room, obstacles, lights, procedural surfaces, giant front-wall screen, and first-person weapon.
- [ ] Add mouse-lock look, WASD movement, Shift sprint, screen raycasting, left-click fire, Q scanner, and Escape pause.
- [ ] Render the mirrored floor plan and decaying enemy evidence to the screen texture.
- [ ] Verify `npm run build` completes without warnings or missing assets.

### Task 3: Round state and AI

**Files:** `src/game/game.js`, `src/game/ai.js`, `src/game/audio.js`, `src/ui.js`

**Interfaces:** `Game` owns the round state and sends semantic UI/audio events. `OpponentAI` consumes only observed clues and emits movement, scan, and shot decisions.

- [ ] Implement health, five-shot magazines, reloads, recoil, two scanners, 120-second timing, hit acceleration, win conditions, and statistics.
- [ ] Implement AI navigation, obstacle avoidance, clue-weighted aim, uncertainty, common-route probes, reaction delays, and evasive behavior.
- [ ] Synthesize all audio locally and connect event-driven screen, camera, hit, near-miss, and HUD feedback.
- [ ] Add intro, pause, and result overlays with restart flow and contextual one-line prompts.

### Task 4: Verification and tuning

**Files:** all runtime files, `README.md`

**Interfaces:** The browser entry is `/`; production output is `dist/`.

- [ ] Run the complete unit suite and production build.
- [ ] Exercise intro → pointer lock → movement → shooting → scanner → damage → result → restart in a real browser.
- [ ] Capture 1440×900 and 1280×800 screenshots; inspect blank canvas, layout, clipping, map readability, and console logs.
- [ ] Tune AI cadence, evidence visibility, movement speeds, damage, feedback, and responsive HUD from the observed run.
- [ ] Document local play and controls in `README.md`, then repeat tests and build.
