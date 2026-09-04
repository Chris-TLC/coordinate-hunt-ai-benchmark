import { Crosshair, Pause, Radar, Zap, Eye, Shield } from 'lucide-react'
import { GAME_CONFIG } from '../game/config'
import type { HudSnapshot } from '../game/types'
import { HealthBar } from './HealthBar'

type GameHudProps = { hud: HudSnapshot; onPause: () => void }

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function GameHud({ hud, onPause }: GameHudProps) {
  const cooldownRatio = Math.min(1, Math.max(0, 1 - hud.fireCooldown / GAME_CONFIG.weapon.cooldown))
  const coordinate = hud.aimPosition ? `${hud.aimPosition.x.toFixed(1)} / ${hud.aimPosition.z.toFixed(1)}` : '-- / --'
  const maxHp = hud.maxHp ?? GAME_CONFIG.round.startingHp
  return (
    <div className="hud-layer">
      <header className="hud-topbar">
        <div className="combatant combatant--player">
          <span className="combatant-label">YOU</span>
          <HealthBar hp={hud.playerHp} maxHp={maxHp} />
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
          <HealthBar hp={hud.aiHp} maxHp={maxHp} align="right" />
          <span className="combatant-label">AI</span>
        </div>
        <button type="button" className="icon-button hud-pause" onClick={onPause} aria-label="暂停" title="暂停">
          <Pause size={17} />
        </button>
      </header>
      <div className={hud.aimValid ? 'crosshair is-valid' : 'crosshair'} aria-hidden="true">
        <span /><span /><i />
      </div>
      <div className="hud-bottom">
        <div className="coordinate-readout">
          <Crosshair size={16} />
          <span>XZ</span>
          <strong>{coordinate}</strong>
        </div>
        <div className="ability-status">
          {hud.speedBoostRemaining > 0 && (
            <div className="status-signal is-boosted">
              <Zap size={16} fill="currentColor" />
              <span>BOOST</span>
            </div>
          )}
          {hud.lastFeedback && (
            <div className={`status-signal is-feedback feedback--${hud.lastFeedback}`}>
              {hud.lastFeedback === 'core' ? <Shield size={16} /> : <Eye size={16} />}
              <span>{hud.lastFeedback === 'core' ? '直击' : hud.lastFeedback === 'graze' ? '擦伤' : '脱靶'}</span>
            </div>
          )}
          <div className={hud.scansLeft > 0 ? 'radar-state is-ready' : 'radar-state'}>
            <Radar size={18} />
            <span>{hud.scansLeft > 0 ? `${hud.scansLeft} READY` : 'SPENT'}</span>
          </div>
          <div className={hud.fireCooldown <= 0 ? 'cooldown is-ready' : 'cooldown'}>
            <span className="cooldown-track"><i style={{ transform: `scaleX(${cooldownRatio})` }} /></span>
            <strong>{hud.fireCooldown <= 0 ? 'ARMED' : `${hud.fireCooldown.toFixed(1)} S`}</strong>
          </div>
        </div>
      </div>
      {hud.exposureWarning && <div className="edge-warning">SIGNAL EXPOSED</div>}
      {hud.incomingScanWarning && <div className="scan-warning" aria-hidden="true" />}
    </div>
  )
}
