(function () {
  'use strict';
  const { Duel, RoomRenderer, TacticalDisplay, Soundscape, OBSTACLES, clamp, pointInObstacle } = window.Blindspot;
  const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]')).map(element => [element.id, element]));
  const storage = {
    read(key, fallback) { try { const value = localStorage.getItem(key); return value ? { ...fallback, ...JSON.parse(value) } : fallback; } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  const preferences = storage.read('blindspot.preferences.v1', { difficulty: 'standard', sensitivity: 1, volume: 0.55, muted: false, inputMode: 'locked', quality: 'high', reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
  const record = storage.read('blindspot.record.v1', { played: 0, wins: 0, bestAccuracy: 0 });
  const sound = new Soundscape();
  const display = new TacticalDisplay();
  let renderer;
  try { renderer = new RoomRenderer(elements.world, display); }
  catch (error) {
    console.error('Blindspot renderer initialization failed:', error);
    elements['error-modal'].classList.remove('hidden');
    elements['retry-button'].addEventListener('click', () => location.reload());
    elements['start-button'].disabled = true;
    return;
  }

  let state = 'menu';
  let duel = null;
  let yaw = 0;
  let pitch = 0.168;
  let recoil = 0;
  let damageFlash = 0;
  let hitFlash = 0;
  let scanFlash = 0;
  let shake = 0;
  let zoom = 0;
  let bob = 0;
  let trigger = false;
  let rightDown = false;
  let pointerFallback = false;
  let wasLocked = false;
  let requestLockPending = false;
  let pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  let aimTarget = null;
  let scanArmed = false;
  let toastUntil = 0;
  let menuTime = 0;
  let lastTime = performance.now();
  let lastHud = 0;
  let lastMap = -1;
  let settingsFrom = 'menu';
  let focusBeforeModal = null;
  let firstHintStage = 0;
  let movedAfterShot = 0;
  let lastHeartbeat = 0;
  let lastCountdown = 31;
  const keys = new Set();
  const freePointer = () => preferences.inputMode === 'free' || pointerFallback;
  const running = () => state === 'playing';
  const show = id => elements[id].classList.remove('hidden');
  const hide = id => elements[id].classList.add('hidden');
  const text = (id, value) => { if (elements[id].textContent !== String(value)) elements[id].textContent = value; };
  const timeLabel = seconds => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
  const modalIds = ['pause-modal', 'settings-modal', 'howto-modal', 'result-modal'];

  for (let index = 0; index < 10; index++) elements['health-segments'].append(document.createElement('i'));
  for (let index = 0; index < 6; index++) elements['ammo-pips'].append(document.createElement('i'));

  function setState(nextState) {
    state = nextState;
    document.body.dataset.state = state;
    trigger = false; rightDown = false; keys.clear();
    scanArmed = false; elements['scan-button'].classList.remove('armed');
    elements.world.dataset.state = state;
  }

  function hideModals() { modalIds.forEach(hide); }
  function releasePointer() { if (document.pointerLockElement) document.exitPointerLock(); document.body.classList.remove('pointer-locked'); }
  function updateInputMode() {
    document.body.classList.toggle('free-pointer', freePointer() && running());
    text('look-control', freePointer() ? '右键拖动 转向' : '鼠标 转向');
    elements['aim-control'].innerHTML = freePointer() ? '<kbd>F</kbd> 精瞄' : '<kbd>右键</kbd> 精瞄';
  }

  function fallbackPointer() {
    requestLockPending = false;
    if (!running()) return;
    pointerFallback = true;
    pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    updateInputMode();
    notify('已启用触控板模式：鼠标瞄准 · 右键拖动转向 · F 精瞄', 6);
  }

  function capturePointer() {
    updateInputMode();
    if (freePointer()) return;
    if (!elements.world.requestPointerLock) { fallbackPointer(); return; }
    requestLockPending = true;
    try {
      const request = elements.world.requestPointerLock();
      if (request && request.catch) request.catch(fallbackPointer);
    } catch { fallbackPointer(); }
  }

  function startRound() {
    hideModals(); hide('menu'); show('hud');
    pointerFallback = false;
    const seed = window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now();
    duel = new Duel({ seed, difficulty: preferences.difficulty });
    yaw = 0; pitch = 0.168; recoil = 0; zoom = 0; bob = 0; damageFlash = 0; shake = 0; hitFlash = 0; scanFlash = 0;
    aimTarget = null; firstHintStage = 0; movedAfterShot = 0; lastCountdown = 31;
    pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    lastTime = performance.now(); lastMap = -1; toastUntil = 0;
    text('toast', ''); text('hit-damage', '');
    elements.toast.classList.remove('visible');
    document.body.classList.remove('low-health');
    setState('playing');
    show('first-hint');
    applySettings(); updateHud();
    sound.start().catch(() => {});
    capturePointer();
    elements.world.focus({ preventScroll: true });
  }

  function pauseRound() {
    if (!running()) return;
    setState('paused'); releasePointer(); sound.pause();
    show('pause-modal'); elements['resume-button'].focus();
  }

  function resumeRound() {
    hideModals(); setState('playing'); lastTime = performance.now();
    sound.start().catch(() => {}); capturePointer(); elements.world.focus({ preventScroll: true });
  }

  function returnToMenu() {
    setState('menu'); releasePointer(); sound.pause(); hideModals(); hide('hud'); show('menu');
    duel = null; lastMap = -1;
    document.body.classList.remove('low-health', 'free-pointer');
    elements['damage-overlay'].style.opacity = 0; elements['incoming-overlay'].style.opacity = 0; elements['scan-overlay'].style.opacity = 0;
    elements['start-button'].focus();
  }

  function openSettings() {
    focusBeforeModal = document.activeElement;
    settingsFrom = state;
    if (running()) { pauseRound(); settingsFrom = 'paused'; }
    hide('pause-modal'); show('settings-modal'); elements.difficulty.focus();
  }

  function closeSettings() {
    hide('settings-modal'); storage.write('blindspot.preferences.v1', preferences);
    if (settingsFrom === 'paused') { show('pause-modal'); elements['resume-button'].focus(); }
    else if (focusBeforeModal && focusBeforeModal.focus) focusBeforeModal.focus();
  }

  function showHowto() { focusBeforeModal = document.activeElement; show('howto-modal'); elements['howto-play'].focus(); }
  function hideHowto() { hide('howto-modal'); if (focusBeforeModal) focusBeforeModal.focus(); }

  function applySettings() {
    preferences.sensitivity = clamp(Number(preferences.sensitivity) || 1, 0.4, 2);
    preferences.volume = clamp(Number(preferences.volume) || 0, 0, 1);
    sound.setVolume(preferences.volume); sound.setMuted(preferences.muted);
    elements['sound-toggle'].classList.toggle('muted', preferences.muted);
    elements['sound-toggle'].setAttribute('aria-pressed', String(preferences.muted));
    elements['sound-toggle'].setAttribute('aria-label', preferences.muted ? '打开声音' : '关闭声音');
    elements['sound-toggle'].title = preferences.muted ? '打开声音（M）' : '静音（M）';
    renderer.quality = preferences.quality; renderer.resize();
    document.body.classList.toggle('reduce-motion', preferences.reduceMotion);
    elements.difficulty.value = preferences.difficulty;
    elements.sensitivity.value = preferences.sensitivity;
    elements.volume.value = preferences.volume;
    elements['input-mode'].value = preferences.inputMode;
    elements.quality.value = preferences.quality;
    elements['reduce-motion'].checked = preferences.reduceMotion;
    text('sensitivity-value', preferences.sensitivity.toFixed(2)); text('volume-value', `${Math.round(preferences.volume * 100)}%`);
    updateInputMode();
  }

  function toggleSound() { preferences.muted = !preferences.muted; applySettings(); storage.write('blindspot.preferences.v1', preferences); }
  function notify(message, duration = 2.7, danger = false) {
    text('toast', message); elements.toast.classList.add('visible'); elements.toast.classList.toggle('danger', danger);
    toastUntil = (duel ? duel.time : menuTime) + duration;
  }

  function shoot() {
    if (!running()) return;
    aimTarget = renderer.aim(freePointer() ? pointer.x / innerWidth * 2 - 1 : 0, freePointer() ? 1 - pointer.y / innerHeight * 2 : 0);
    if (!aimTarget) { if (duel.player.fireCooldown === 0) { notify('瞄准巨幕中央的地图，子弹才能抵达对面。', 2.1); duel.player.fireCooldown = 0.35; } return; }
    if (duel.player.reloadTime > 0) return;
    if (duel.player.ammo === 0) { sound.empty(); duel.reload('player'); return; }
    if (duel.fire('player', aimTarget)) {
      if (firstHintStage === 0) { firstHintStage = 1; movedAfterShot = duel.stats.distance; }
    }
  }

  function scan() {
    if (!running()) return;
    aimTarget = renderer.aim(freePointer() ? pointer.x / innerWidth * 2 - 1 : 0, freePointer() ? 1 - pointer.y / innerHeight * 2 : 0);
    if (duel.player.scanCooldown > 0) { notify(`侦测器充能中 · ${Math.ceil(duel.player.scanCooldown)} 秒`, 1.5); return; }
    if (!aimTarget) { notify('先瞄准地图上的一片区域，再按 E 侦测。', 2.2); return; }
    if (duel.scan('player', aimTarget) && firstHintStage === 2) firstHintStage = 3;
    scanArmed = false; elements['scan-button'].classList.remove('armed');
  }

  function selectScan() {
    if (!running()) return;
    if (!freePointer()) { scan(); return; }
    if (duel.player.scanCooldown > 0) { notify(`侦测器充能中 · ${Math.ceil(duel.player.scanCooldown)} 秒`, 1.5); return; }
    scanArmed = !scanArmed;
    elements['scan-button'].classList.toggle('armed', scanArmed);
    notify(scanArmed ? '侦测已选定 · 点击地图投放。再次点击技能可取消。' : '已取消侦测瞄准。', 3);
    elements.world.focus({ preventScroll: true });
  }

  function decoy() {
    if (!running()) return;
    if (!duel.decoy('player')) notify(`伪声装置充能中 · ${Math.ceil(duel.player.decoyCooldown)} 秒`, 1.5);
  }

  function stereoPan(x, z) {
    const deltaX = x - duel.player.x, deltaZ = z - duel.player.z;
    return clamp((deltaX * Math.cos(yaw) + deltaZ * Math.sin(yaw)) / Math.max(2, Math.hypot(deltaX, deltaZ)), -0.85, 0.85);
  }

  function processEvents() {
    for (const event of duel.drainEvents()) {
      if (event.type === 'fire') {
        if (event.side === 'player') { recoil = 1; sound.fire(); }
        else {
          const distance = Math.hypot(event.target.x - duel.player.x, event.target.z - duel.player.z);
          if (distance < 4.5) sound.warning(stereoPan(event.target.x, event.target.z));
        }
      } else if (event.type === 'impact') {
        if (event.side === 'player') {
          if (event.damage) { hitFlash = 1; text('hit-damage', `−${event.damage}`); sound.hit(); notify(event.damage === 34 ? '确认直击 −34 · 他受伤后会加速，别追着旧残影打。' : '擦伤 −18 · 再预判一步。', 2.5); }
          else if (event.blocked) notify('击中掩体 · 留意障碍之间的通道。', 1.8);
        } else {
          const distance = Math.hypot(event.x - duel.player.x, event.z - duel.player.z);
          if (distance < 5) sound.impact(event.damage, stereoPan(event.x, event.z));
          if (event.damage) { damageFlash = 1; shake = preferences.reduceMotion ? 0.1 : 1; notify(`受到 ${event.damage} 伤害 · 逃生加速已触发，立刻换位！`, 2.4, true); }
          else if (distance < 2.7) notify('擦肩而过。别让他猜中第二次。', 1.9);
        }
      } else if (event.type === 'step') sound.step(event.quiet, event.sprint);
      else if (event.type === 'remote-step') sound.remoteStep(event.x / 8, event.strength);
      else if (event.type === 'reload' && event.side === 'player') sound.reload();
      else if (event.type === 'scan' && event.side === 'player') { sound.scan(); scanFlash = 1; notify('侦测已投放 · 绿色圆圈内有人，才会显出轨迹。', 2.7); }
      else if (event.type === 'scan-pulse' && event.side === 'player' && event.occupied) sound.contact();
      else if (event.type === 'decoy' && event.side === 'player') { sound.decoy(); notify('已留下伪声 · 1.3 秒后发出脚步，现在离开这里。', 3.1); }
      else if (event.type === 'finish') finishRound();
    }
  }

  function finishRound() {
    setState('result'); releasePointer(); document.body.classList.remove('free-pointer'); hide('warning'); hide('first-hint');
    const result = duel.result; const won = result.winner === 'player'; const tied = result.winner === 'draw';
    const accuracy = duel.stats.shots ? Math.round(duel.stats.hits / duel.stats.shots * 100) : 0;
    record.played++; if (won) record.wins++; record.bestAccuracy = Math.max(record.bestAccuracy, accuracy);
    storage.write('blindspot.record.v1', record);
    text('result-title', tied ? '你们，都读懂了沉默。' : won ? '你读懂了他的沉默。' : '他先听见了你。');
    text('result-description', tied ? '两间房间，一样的心跳。这个梦没有输家。' : won ? '对面的声纹消失了。你的梦，还在继续。' : '房间安静下来。但下一次，你会走得更轻。');
    text('result-overline', tied ? 'CONNECTION CLOSED / STALEMATE' : won ? 'CONNECTION CLOSED / YOU SURVIVED' : 'CONNECTION CLOSED / SIGNAL LOST');
    text('result-symbol', tied ? '≋' : won ? '◎' : '◌');
    elements['result-modal'].querySelector('.result-card').classList.toggle('lost', !won && !tied);
    text('result-own-hp', duel.player.hp); text('result-enemy-hp', duel.enemy.hp);
    text('result-reason', result.reason === 'elimination' ? won ? '对手生命归零' : '你的生命归零' : tied ? '120 秒 · 生命持平' : '120 秒 · 生命值判定');
    text('stat-hits', `${accuracy}%`); text('stat-damage', duel.stats.damage); text('stat-dodges', duel.stats.dodges); text('stat-time', timeLabel(Math.ceil(result.duration)));
    const advice = duel.stats.shots === 0 ? '下次试试：瞄准屏幕上的光团前方，左键开枪。先大胆猜一次。' : duel.stats.scans === 0 ? '下次试试 E：用侦测排除一片空区。知道他“不在那里”，也是情报。' : duel.stats.distance < 25 ? '下次试试：每次开枪后横移几步。你的枪声暴露的是旧位置。' : accuracy < 20 ? '残影是过去的位置。沿着拖影的方向，提前一点开枪。' : duel.stats.decoys === 0 ? '下次试试 Q：在老位置留下假脚步，把他的判断引向空处。' : '你已经学会用沉默说谎。试试更深一层的梦境。';
    text('result-tip', advice); text('record-summary', `本地梦境 ${record.played} 局 · 苏醒 ${record.wins} 次 · 最佳命中率 ${record.bestAccuracy}%`);
    show('result-modal'); elements['replay-button'].focus(); sound.finish(won || tied);
    updateHud();
  }

  function drawLocalMap() {
    const context = elements['local-map'].getContext('2d'); const width = 174, height = 138, left = 13, top = 8;
    const point = (x, z) => [left + (x + 8) / 16 * width, top + z / 15 * height];
    context.clearRect(0, 0, 200, 160);
    context.fillStyle = '#12221880'; context.fillRect(left, top, width, height);
    context.strokeStyle = '#9dbb8155'; context.lineWidth = 1; context.strokeRect(left + 0.5, top + 0.5, width, height);
    context.fillStyle = '#afc49133';
    for (const block of OBSTACLES) { const position = point(block.x - block.width / 2, block.z - block.depth / 2); context.fillRect(position[0], position[1], block.width / 16 * width, block.depth / 15 * height); }
    context.fillStyle = '#cbdbad'; context.fillRect(left + 17, top, width - 34, 2);
    const center = point(duel.player.x, duel.player.z);
    context.save(); context.translate(center[0], center[1]); context.rotate(yaw);
    context.fillStyle = '#c9ddb927'; context.beginPath(); context.moveTo(0, 0); context.arc(0, 0, 28, -Math.PI / 2 - 0.57, -Math.PI / 2 + 0.57); context.closePath(); context.fill();
    context.fillStyle = duel.player.audibleTime > 0 ? '#e9bc8d' : '#d8e8bd'; context.beginPath(); context.moveTo(0, -5); context.lineTo(3.6, 4); context.lineTo(0, 2); context.lineTo(-3.6, 4); context.closePath(); context.fill();
    context.restore();
    for (const incoming of duel.visibleTo('player').incoming) { const position = point(incoming.x, incoming.z); context.strokeStyle = '#e9a272'; context.beginPath(); context.arc(position[0], position[1], 8, 0, Math.PI * 2); context.stroke(); }
  }

  function updateHud() {
    if (!duel) return;
    const player = duel.player;
    text('clock', timeLabel(Math.ceil(duel.remaining))); text('player-hp', player.hp); text('enemy-hp', duel.enemy.hp);
    elements['own-top-bar'].style.width = `${player.hp}%`; elements['enemy-top-bar'].style.width = `${duel.enemy.hp}%`;
    elements.clock.parentElement.classList.toggle('urgent', duel.remaining <= 30);
    document.body.classList.toggle('low-health', player.hp <= 34);
    Array.from(elements['health-segments'].children).forEach((segment, index) => segment.classList.toggle('empty', index >= Math.ceil(player.hp / 10)));
    text('ammo-value', String(player.ammo).padStart(2, '0'));
    Array.from(elements['ammo-pips'].children).forEach((segment, index) => segment.classList.toggle('empty', index >= player.ammo));
    elements['reload-label'].innerHTML = player.reloadTime > 0 ? `<span>${player.reloadTime.toFixed(1)}s</span> 装填中` : '<kbd>R</kbd> 换弹';
    const loud = player.audibleTime > 0;
    elements.exposure.classList.toggle('loud', loud);
    text('exposure-label', loud ? '已留下声纹' : player.quiet && player.moving ? '静步 · 隐匿中' : player.moving ? '走动中' : '保持安静');
    text('exposure-level', loud ? 'SIGNAL EXPOSED' : 'LOW SIGNAL');
    elements['boost-label'].classList.toggle('hidden', player.boost <= 0);
    text('scan-status', player.scanCooldown > 0 ? `${Math.ceil(player.scanCooldown)}s · 充能中` : '就绪 · 瞄准地图释放');
    text('decoy-status', player.decoyCooldown > 0 ? `${Math.ceil(player.decoyCooldown)}s · 充能中` : '就绪 · 原地留下诱饵');
    elements['scan-button'].classList.toggle('cooling', player.scanCooldown > 0); elements['decoy-button'].classList.toggle('cooling', player.decoyCooldown > 0);
    elements['scan-button'].setAttribute('aria-disabled', String(player.scanCooldown > 0)); elements['decoy-button'].setAttribute('aria-disabled', String(player.decoyCooldown > 0));
    elements['scan-cooldown'].style.width = `${(1 - player.scanCooldown / 14) * 100}%`; elements['decoy-cooldown'].style.width = `${(1 - player.decoyCooldown / 20) * 100}%`;
    const hasSignal = duel.visibleTo('player').traces.some(trace => duel.time - trace.born < trace.life * 0.75);
    text('field-note', hasSignal ? '捕获到对方声纹' : '安静也是一种信号');
    text('match-phase', duel.remaining <= 30 ? '梦境即将结束' : hasSignal ? '声纹已捕获' : '寻找声源');
    text('coordinates', `X ${player.x.toFixed(1)} · Z ${player.z.toFixed(1)}`);
    elements['match-objective'].style.opacity = duel.time < 12 ? '0.8' : '0.3';
    const toastShowing = duel.time < toastUntil;
    elements.toast.classList.toggle('visible', toastShowing);
    if (firstHintStage === 1 && duel.stats.distance - movedAfterShot > 2.5) firstHintStage = 2;
    if (firstHintStage >= 3 || duel.time > (record.played ? 13 : 34) || toastShowing || !running()) hide('first-hint');
    else {
      show('first-hint');
      const hint = firstHintStage === 0 ? ['01 / 03', '找到巨幕上的<span>模糊残影</span>，左键开枪。', freePointer() ? 'WASD 移动 · 右键拖动转向 · F 精瞄' : 'WASD 移动 · 鼠标转向 · 右键精瞄'] : firstHintStage === 1 ? ['02 / 03', '枪声暴露了你。<span>现在，换一个位置。</span>', 'WASD 移动 · Shift 疾跑 · C 静步'] : ['03 / 03', '瞄准一片区域，按 <span>E</span> 释放侦测。', '绿色波纹只揭示范围内的轨迹 · 不显示敌人'];
      elements['first-hint'].querySelector('.hint-step').textContent = hint[0];
      elements['first-hint'].querySelector('p').innerHTML = hint[1];
      elements['first-hint'].querySelector('small').textContent = hint[2];
    }
    drawLocalMap();
    elements.world.dataset.time = duel.time.toFixed(2);
    elements.world.dataset.health = String(player.hp);
    elements.world.dataset.enemyHealth = String(duel.enemy.hp);
    elements.world.dataset.ammo = String(player.ammo);
  }

  function updateWarning() {
    const incoming = duel.visibleTo('player').incoming;
    const danger = incoming.find(shot => Math.hypot(shot.x - duel.player.x, shot.z - duel.player.z) < 4);
    elements.warning.classList.toggle('hidden', !danger || !running());
    elements['incoming-overlay'].style.opacity = danger && running() ? 0.5 + Math.sin(duel.time * 40) * 0.2 : 0;
    if (danger) {
      const directionX = danger.x - duel.player.x, directionZ = danger.z - duel.player.z;
      const lateral = directionX * Math.cos(yaw) + directionZ * Math.sin(yaw);
      const forward = directionX * Math.sin(yaw) - directionZ * Math.cos(yaw);
      text('warning-direction', Math.abs(lateral) > Math.abs(forward) ? lateral > 0 ? '→' : '←' : forward > 0 ? '↑' : '↓');
    }
  }

  function tick(now) {
    const delta = Math.min(0.1, Math.max(0.0001, (now - lastTime) / 1000)); lastTime = now;
    if (state === 'menu') menuTime += delta;
    if (running()) {
      if (keys.has('ArrowLeft')) yaw -= delta * 1.15;
      if (keys.has('ArrowRight')) yaw += delta * 1.15;
      if (keys.has('ArrowUp')) pitch = clamp(pitch + delta * 0.9, -1.05, 1.12);
      if (keys.has('ArrowDown')) pitch = clamp(pitch - delta * 0.9, -1.05, 1.12);
      const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      duel.step(delta, { x: horizontal * Math.cos(yaw) + forward * Math.sin(yaw), z: horizontal * Math.sin(yaw) - forward * Math.cos(yaw), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), quiet: keys.has('KeyC') });
      if (trigger && duel.player.fireCooldown <= 0) shoot();
      processEvents();
      if (duel.player.moving) bob += delta * (duel.player.sprint ? 13 : 8.5);
      const currentSecond = Math.ceil(duel.remaining);
      if (currentSecond <= 30 && currentSecond !== lastCountdown) {
        if (currentSecond === 30) notify('剩余 30 秒。时间结束时，生命更多的一方获胜。', 3.8);
        if (currentSecond <= 10 && currentSecond > 0) sound.tone(440, 0.065, 0.04, 'sine', 420);
        lastCountdown = currentSecond;
      }
      if (duel.player.hp <= 34 && duel.time - lastHeartbeat > 1.1) { sound.tone(52, 0.16, 0.1, 'sine', 38); lastHeartbeat = duel.time; }
    }
    const isWorld = state !== 'menu';
    const sceneTime = isWorld && duel ? duel.time : menuTime;
    recoil *= Math.exp(-delta * 13); damageFlash *= Math.exp(-delta * 2.1); hitFlash *= Math.exp(-delta * 5); scanFlash *= Math.exp(-delta * 2); shake *= Math.exp(-delta * 12);
    const desiredZoom = running() && (keys.has('KeyF') || rightDown && !freePointer()) ? 1 : 0;
    zoom += (desiredZoom - zoom) * (1 - Math.exp(-delta * 13));
    const sway = preferences.reduceMotion ? 0 : duel && duel.player.moving && running() ? Math.sin(bob * 2) * 0.018 : 0;
    const scene = isWorld && duel ? {
      eye: [duel.player.x, (duel.player.quiet ? 1.53 : 1.72) + sway, duel.player.z],
      yaw: yaw + Math.sin(now * 0.12) * shake * 0.004,
      pitch: pitch + Math.cos(now * 0.14) * shake * 0.003,
      fov: (65 - zoom * 20) * Math.PI / 180,
      weapon: true, model: duel, recoil, zoom,
      bob: preferences.reduceMotion ? 0 : bob,
      reload: duel.player.reloadTime > 0 ? 1 - duel.player.reloadTime / 1.55 : 0,
      time: sceneTime
    } : {
      eye: [-3.8 + Math.sin(menuTime * 0.1) * 0.14, 2.15, 13.25], yaw: -0.055 + Math.sin(menuTime * 0.09) * 0.009, pitch: 0.135,
      fov: 63 * Math.PI / 180, weapon: false, model: null, time: sceneTime
    };
    renderer.eye = scene.eye; renderer.yaw = scene.yaw; renderer.pitch = scene.pitch; renderer.fov = scene.fov;
    if (running()) {
      const cursorX = freePointer() ? pointer.x / innerWidth * 2 - 1 : 0;
      const cursorY = freePointer() ? 1 - pointer.y / innerHeight * 2 : 0;
      aimTarget = renderer.aim(cursorX, cursorY);
      const crossX = freePointer() ? pointer.x : innerWidth / 2;
      const crossY = freePointer() ? pointer.y : innerHeight / 2;
      for (const id of ['crosshair', 'hit-marker']) { elements[id].style.left = `${crossX}px`; elements[id].style.top = `${crossY}px`; }
      elements['target-label'].style.left = `${clamp(crossX, 100, innerWidth - 100)}px`; elements['target-label'].style.top = `${crossY + 28}px`;
      elements.crosshair.classList.toggle('on-target', !!aimTarget);
      elements.crosshair.classList.toggle('blocked', !!aimTarget && pointInObstacle(aimTarget.x, aimTarget.z));
      elements['target-label'].classList.toggle('off-map', !aimTarget);
      if (aimTarget) {
        const column = ['A', 'B', 'C', 'D'][Math.min(3, Math.floor((aimTarget.x + 8) / 4))];
        const row = Math.min(3, Math.floor(aimTarget.z / 5) + 1);
        text('target-label', `${column}${row} / ${pointInObstacle(aimTarget.x, aimTarget.z) ? '掩体' : '可投射'}`);
      } else text('target-label', Math.cos(yaw) < -0.1 ? '巨幕在身后 · 转身寻找声纹' : '瞄准巨幕中央的地图');
      updateWarning();
    }
    if (lastMap < 0 || sceneTime - lastMap > (preferences.quality === 'low' ? 1 / 20 : 1 / 30) || sceneTime < lastMap) {
      display.draw(isWorld ? duel : null, aimTarget, sceneTime, !isWorld);
      renderer.updateScreen(); lastMap = sceneTime;
    }
    renderer.render(scene);
    elements['damage-overlay'].style.opacity = isWorld ? damageFlash * 0.83 : 0;
    elements['scan-overlay'].style.opacity = isWorld ? scanFlash * 0.5 : 0;
    elements['hit-marker'].style.opacity = hitFlash;
    if (now - lastHud > 90 && isWorld) { updateHud(); lastHud = now; }
    elements.world.dataset.rendered = 'true';
    requestAnimationFrame(tick);
  }

  elements['start-button'].addEventListener('click', startRound);
  elements['replay-button'].addEventListener('click', startRound);
  elements['howto-play'].addEventListener('click', startRound);
  elements['resume-button'].addEventListener('click', resumeRound);
  elements['pause-open'].addEventListener('click', pauseRound);
  elements['settings-open'].addEventListener('click', openSettings);
  elements['pause-settings'].addEventListener('click', openSettings);
  elements['settings-close'].addEventListener('click', closeSettings);
  elements['settings-done'].addEventListener('click', closeSettings);
  elements['sound-toggle'].addEventListener('click', toggleSound);
  elements['return-menu'].addEventListener('click', returnToMenu);
  elements['result-menu'].addEventListener('click', returnToMenu);
  elements['howto-open'].addEventListener('click', showHowto);
  elements['howto-close'].addEventListener('click', hideHowto);
  elements['scan-button'].addEventListener('click', selectScan);
  elements['decoy-button'].addEventListener('click', decoy);
  elements.brand.addEventListener('click', event => { event.preventDefault(); if (running()) pauseRound(); });
  elements['retry-button'].addEventListener('click', () => location.reload());
  elements.difficulty.addEventListener('change', event => { preferences.difficulty = event.target.value; });
  elements.sensitivity.addEventListener('input', event => { preferences.sensitivity = Number(event.target.value); text('sensitivity-value', preferences.sensitivity.toFixed(2)); });
  elements.volume.addEventListener('input', event => { preferences.volume = Number(event.target.value); sound.setVolume(preferences.volume); text('volume-value', `${Math.round(preferences.volume * 100)}%`); });
  elements['input-mode'].addEventListener('change', event => { preferences.inputMode = event.target.value; pointerFallback = false; updateInputMode(); });
  elements.quality.addEventListener('change', event => { preferences.quality = event.target.value; renderer.quality = preferences.quality; renderer.resize(); });
  elements['reduce-motion'].addEventListener('change', event => { preferences.reduceMotion = event.target.checked; document.body.classList.toggle('reduce-motion', preferences.reduceMotion); });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === elements.world;
    document.body.classList.toggle('pointer-locked', locked);
    if (locked) { wasLocked = true; requestLockPending = false; pointerFallback = false; updateInputMode(); }
    else if (wasLocked) { wasLocked = false; if (running()) pauseRound(); }
    else if (requestLockPending) fallbackPointer();
  });
  document.addEventListener('pointerlockerror', fallbackPointer);
  document.addEventListener('mousemove', event => {
    if (!running()) return;
    if (document.pointerLockElement === elements.world || freePointer() && rightDown) {
      const sensitivity = 0.0019 * preferences.sensitivity * (1 - zoom * 0.32);
      yaw += clamp(event.movementX || 0, -160, 160) * sensitivity;
      pitch = clamp(pitch - clamp(event.movementY || 0, -160, 160) * sensitivity, -1.05, 1.12);
    }
    if (freePointer()) pointer = { x: clamp(event.clientX, 0, innerWidth), y: clamp(event.clientY, 0, innerHeight) };
  });
  elements.world.addEventListener('mousedown', event => {
    if (!running()) return;
    event.preventDefault();
    if (event.button === 0) {
      if (!freePointer() && document.pointerLockElement !== elements.world) { capturePointer(); return; }
      if (scanArmed) { scan(); return; }
      trigger = true; shoot();
    }
    if (event.button === 2) rightDown = true;
  });
  document.addEventListener('mouseup', event => { if (event.button === 0) trigger = false; if (event.button === 2) rightDown = false; });
  document.addEventListener('contextmenu', event => { if (running()) event.preventDefault(); });
  document.addEventListener('keydown', event => {
    const modal = modalIds.map(id => elements[id]).find(element => !element.classList.contains('hidden'));
    if (event.code === 'Tab' && modal) {
      const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), select, input'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.code === 'Escape') {
      if (!elements['settings-modal'].classList.contains('hidden')) closeSettings();
      else if (!elements['howto-modal'].classList.contains('hidden')) hideHowto();
      else if (running()) pauseRound();
      return;
    }
    if (event.code === 'KeyM' && !event.repeat && !['INPUT', 'SELECT'].includes(document.activeElement.tagName)) { toggleSound(); return; }
    if (!running()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyQ', 'KeyR', 'KeyF', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyE') scan();
    if (event.code === 'KeyQ') decoy();
    if (event.code === 'KeyR') duel.reload('player');
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); trigger = false; rightDown = false; if (running()) pauseRound(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running()) pauseRound(); });
  window.addEventListener('resize', () => { renderer.resize(); pointer.x = clamp(pointer.x, 0, innerWidth); pointer.y = clamp(pointer.y, 0, innerHeight); });
  elements.world.addEventListener('webglcontextlost', event => {
    event.preventDefault(); if (running()) pauseRound();
    text('error-message', '浏览器暂时回收了图形资源，对局已暂停。重新连接即可重新进入房间。'); show('error-modal');
  });
  elements.world.addEventListener('webglcontextrestored', () => location.reload());
  window.addEventListener('error', event => {
    if (!event.message) return;
    if (running()) pauseRound();
    text('error-message', '梦境连接意外中断。对局已暂停，请重新连接。'); show('error-modal');
  });

  applySettings();
  display.draw(null, null, 0, true); renderer.updateScreen();
  requestAnimationFrame(tick);
})();
