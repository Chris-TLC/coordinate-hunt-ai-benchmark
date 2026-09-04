import { Crosshair, Play } from 'lucide-react'
import { DIFFICULTY_CONFIG, type Difficulty } from '../game/config'
import type { Settings } from '../game/types'
import { SettingsControls } from './SettingsControls'

type MainMenuProps = {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  onStart: () => void
}

const difficulties = Object.keys(DIFFICULTY_CONFIG) as Difficulty[]

export function MainMenu({ settings, onSettingsChange, onStart }: MainMenuProps) {
  return (
    <main className="menu-layer" aria-labelledby="game-title">
      <section className="menu-content">
        <div className="brand-symbol" aria-hidden="true">
          <Crosshair size={26} strokeWidth={1.5} />
        </div>
        <h1 id="game-title">坐标猎场</h1>
        <p className="menu-subtitle">3D 试验舱 · 巨幕坐标 · 信息驱动盲射追猎</p>
        <div className="difficulty-field">
          <span className="field-label">AI 强度</span>
          <div className="segmented-control" role="radiogroup" aria-label="AI 强度">
            {difficulties.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={settings.difficulty === d}
                className={settings.difficulty === d ? 'is-selected' : undefined}
                onClick={() => onSettingsChange({ ...settings, difficulty: d })}
              >
                <strong>{DIFFICULTY_CONFIG[d].label}</strong>
                <span>{DIFFICULTY_CONFIG[d].description}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="primary-action" onClick={onStart}>
          <Play size={18} fill="currentColor" />
          开始对弈
        </button>
        <SettingsControls settings={settings} onChange={onSettingsChange} />
      </section>
      <div className="menu-index" aria-hidden="true">
        <span>LOCAL SIMULATION</span>
        <span>ARENA / 22 × 20 M</span>
      </div>
    </main>
  )
}
