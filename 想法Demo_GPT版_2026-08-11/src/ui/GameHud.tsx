import { Crosshair, Pause, Radar, Zap } from 'lucide-react'
import { GAME_CONFIG } from '../game/config'
import type { HudSnapshot } from '../game/types'
import { HealthBar } from './HealthBar'

type GameHudProps = {
  hud: HudSnapshot
  onPause: () => void
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function GameHud({ hud, onPause }: GameHudProps) {
  const cooldownRatio = Math.min(1, Math.max(0, 1 - hud.fireCooldown / GAME_CONFIG.weapon.cooldown))
  const coordinate = hud.aimPosition
    ? `${hud.aimPosition.x.toFixed(1)} / ${hud.aimPosition.z.toFixed(1)}`
    : '-- / --'

  return (
    <div className="hud-layer">
      <header className="hud-topbar">
        <div className="combatant combatant--player">
          <span className="combatant-label">YOU</span>
          <HealthBar hp={hud.playerHp} />
        </div>
        <div className="round-status">
          <span className="score">{hud.playerScore}</span>
          <div>
            <span className="round-label">ROUND {String(hud.round).padStart(2, '0')}</span>
            <time>{formatTime(hud.timeRemaining)}</time>
          </div>
          <span className="score">{hud.aiScore}</span>
        </div>
        <div className="combatant combatant--ai">
          <HealthBar hp={hud.aiHp} align="right" />
          <span className="combatant-label">AI</span>
        </div>
        <button
          type="button"
          className="icon-button hud-pause"
          onClick={onPause}
          aria-label="暂停"
          title="暂停"
        >
          <Pause size={18} />
        </button>
      </header>

      <div className={hud.aimValid ? 'crosshair is-valid' : 'crosshair'} aria-hidden="true">
        <span />
        <span />
        <i />
      </div>

      <div className="hud-bottom">
        <div className="coordinate-readout">
          <Crosshair size={17} />
          <span>XZ</span>
          <strong>{coordinate}</strong>
        </div>
        <div className="ability-status">
          {hud.speedBoostRemaining > 0 ? (
            <div className="status-signal is-boosted">
              <Zap size={17} fill="currentColor" />
              <span>6.5 M/S</span>
            </div>
          ) : null}
          <div className={hud.scanAvailable ? 'radar-state is-ready' : 'radar-state'}>
            <Radar size={19} />
            <span>{hud.scanAvailable ? 'READY' : 'SPENT'}</span>
          </div>
          <div className={hud.fireCooldown <= 0 ? 'cooldown is-ready' : 'cooldown'}>
            <span className="cooldown-track">
              <i style={{ transform: `scaleX(${cooldownRatio})` }} />
            </span>
            <strong>{hud.fireCooldown <= 0 ? 'ARMED' : `${hud.fireCooldown.toFixed(1)} S`}</strong>
          </div>
        </div>
      </div>

      {hud.exposureWarning ? <div className="edge-warning edge-warning--exposure">SIGNAL EXPOSED</div> : null}
      {hud.aiScanning ? <div className="scan-warning" aria-hidden="true" /> : null}
    </div>
  )
}
