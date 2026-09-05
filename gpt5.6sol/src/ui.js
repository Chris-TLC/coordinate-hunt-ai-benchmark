const $ = (selector) => document.querySelector(selector);

export class UI {
  constructor() {
    this.intro = $('#intro');
    this.hud = $('#hud');
    this.pause = $('#pause');
    this.result = $('#result');
    this.startButton = $('#start-button');
    this.resumeButton = $('#resume-button');
    this.restartButton = $('#restart-button');
    this.pauseRestartButton = $('#restart-button-pause');
    this.playerHealth = $('#player-health');
    this.playerHealthText = $('#player-health-text');
    this.enemyHealth = $('#enemy-health');
    this.enemyHealthText = $('#enemy-health-text');
    this.timer = $('#timer');
    this.clock = $('.round-clock');
    this.crosshair = $('#crosshair');
    this.aimLabel = $('#aim-label');
    this.eventMessage = $('#event-message');
    this.exposure = $('#exposure');
    this.scanWarning = $('#scan-warning');
    this.movementState = $('#movement-state');
    this.hint = $('#hint');
    this.ammo = $('#ammo');
    this.weaponState = $('#weapon-state');
    this.scannerCount = $('#scanner-count');
    this.damage = $('#damage-vignette');
    this.nearMiss = $('#near-miss');
    this.flash = $('#flash');
    this.messageTimer = 0;
    this.renderAmmo(5);
  }

  showGame() { this.intro.classList.add('is-hidden'); this.pause.classList.add('is-hidden'); this.result.classList.add('is-hidden'); this.hud.classList.remove('is-hidden'); }
  showPause() { this.pause.classList.remove('is-hidden'); }
  hidePause() { this.pause.classList.add('is-hidden'); }

  setVitals(player, enemy) {
    this.playerHealth.style.width = `${Math.max(0, player)}%`;
    this.enemyHealth.style.width = `${Math.max(0, enemy)}%`;
    this.playerHealthText.textContent = Math.ceil(Math.max(0, player));
    this.enemyHealthText.textContent = Math.ceil(Math.max(0, enemy));
    this.playerHealth.style.background = player <= 34 ? '#ff5d52' : '';
  }

  setTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    this.timer.textContent = `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
    this.clock.classList.toggle('is-urgent', safe <= 20);
  }

  setAim(mapped, ready = true) {
    this.crosshair.classList.toggle('is-mapped', Boolean(mapped && ready));
    this.crosshair.classList.toggle('is-blocked', Boolean(mapped && !ready));
    this.aimLabel.textContent = mapped ? (ready ? '坐标已映射' : '映射器未就绪') : '寻找巨幕';
  }

  pulseCrosshair() {
    this.crosshair.classList.add('is-firing');
    setTimeout(() => this.crosshair.classList.remove('is-firing'), 100);
  }

  renderAmmo(count) {
    this.ammo.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
      const bar = document.createElement('i');
      if (index >= count) bar.className = 'is-empty';
      return bar;
    }));
  }

  setWeapon(ammo, state) {
    this.renderAmmo(ammo);
    this.weaponState.textContent = state;
  }

  setScanners(count) { this.scannerCount.textContent = count; }

  setMovement(speedState) {
    this.movementState.className = 'movement-state';
    if (speedState === 'walk') this.movementState.classList.add('is-moving');
    if (speedState === 'sprint') this.movementState.classList.add('is-loud');
    const copy = { still: '静止 · 无痕迹', walk: '移动 · 微弱痕迹', sprint: '疾跑 · 强烈暴露' };
    this.movementState.querySelector('span').textContent = copy[speedState];
  }

  message(text, tone = 'normal', duration = 1.45) {
    clearTimeout(this.messageTimer);
    this.eventMessage.textContent = text;
    this.eventMessage.className = `event-message is-visible${tone === 'hit' ? ' is-hit' : ''}`;
    this.messageTimer = setTimeout(() => this.eventMessage.className = 'event-message', duration * 1000);
  }

  showExposure(duration = 1.7) {
    this.exposure.classList.add('is-visible');
    setTimeout(() => this.exposure.classList.remove('is-visible'), duration * 1000);
  }

  showScanWarning(duration = 2) {
    this.scanWarning.classList.add('is-visible');
    setTimeout(() => this.scanWarning.classList.remove('is-visible'), duration * 1000);
  }

  damagePulse() {
    this.damage.classList.add('is-active');
    setTimeout(() => this.damage.classList.remove('is-active'), 180);
  }

  nearMissPulse() {
    this.nearMiss.classList.remove('is-active');
    requestAnimationFrame(() => this.nearMiss.classList.add('is-active'));
    setTimeout(() => this.nearMiss.classList.remove('is-active'), 180);
  }

  flashPulse() {
    this.flash.classList.add('is-active');
    setTimeout(() => this.flash.classList.remove('is-active'), 70);
  }

  fadeHint() { this.hint.style.opacity = '0'; }

  showResult(outcome, stats) {
    this.hud.classList.add('is-hidden');
    this.pause.classList.add('is-hidden');
    const content = {
      win: ['坐标锁定', '猎杀完成', '你比对手更早读懂了房间。'],
      lose: ['信号中断', '你被锁定', '对手从你的痕迹里找到了坐标。'],
      draw: ['时间归零', '协议平局', '双方都没能完全确认最后的位置。'],
    }[outcome];
    $('#result-kicker').textContent = content[0];
    $('#result-title').textContent = content[1];
    $('#result-detail').textContent = content[2];
    $('#stat-hits').textContent = stats.hits;
    $('#stat-shots').textContent = stats.shots;
    $('#stat-accuracy').textContent = `${stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0}%`;
    $('#stat-health').textContent = Math.ceil(Math.max(0, stats.health));
    this.result.classList.remove('is-hidden');
  }
}
