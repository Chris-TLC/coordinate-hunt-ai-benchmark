import { Home, Play, RotateCcw } from 'lucide-react'
import type { Settings } from '../game/types'
import { SettingsControls } from './SettingsControls'

type Props = { settings: Settings; onSettingsChange: (s: Settings) => void; onResume: () => void; onRestart: () => void; onMenu: () => void }

export function PauseOverlay({ settings, onSettingsChange, onResume, onRestart, onMenu }: Props) {
  return (
    <section className="pause-layer" aria-modal="true" role="dialog" aria-labelledby="pause-title">
      <div className="pause-content">
        <span className="overlay-code">SIMULATION SUSPENDED</span>
        <h2 id="pause-title">对弈暂停</h2>
        <button type="button" className="primary-action" onClick={onResume} autoFocus>
          <Play size={17} fill="currentColor" />
          继续
        </button>
        <div className="pause-actions">
          <button type="button" className="secondary-action" onClick={onRestart}><RotateCcw size={16} /> 重开本回合</button>
          <button type="button" className="secondary-action" onClick={onMenu}><Home size={16} /> 返回主菜单</button>
        </div>
        <SettingsControls compact settings={settings} onChange={onSettingsChange} />
      </div>
    </section>
  )
}
