import { Volume2, VolumeX } from 'lucide-react'
import type { Settings } from '../game/types'

type SettingsControlsProps = {
  settings: Settings
  onChange: (settings: Settings) => void
  compact?: boolean
}

export function SettingsControls({ settings, onChange, compact = false }: SettingsControlsProps) {
  return (
    <div className={compact ? 'settings-controls is-compact' : 'settings-controls'}>
      <label className="setting-row" htmlFor={compact ? 'sensitivity-pause' : 'sensitivity-menu'}>
        <span>鼠标灵敏度</span>
        <input
          id={compact ? 'sensitivity-pause' : 'sensitivity-menu'}
          type="range"
          min="0.45"
          max="1.8"
          step="0.05"
          value={settings.mouseSensitivity}
          onChange={(event) =>
            onChange({ ...settings, mouseSensitivity: Number(event.currentTarget.value) })
          }
        />
        <output>{settings.mouseSensitivity.toFixed(2)}</output>
      </label>
      <button
        type="button"
        className="icon-button"
        onClick={() => onChange({ ...settings, audioEnabled: !settings.audioEnabled })}
        aria-label={settings.audioEnabled ? '关闭声音' : '打开声音'}
        title={settings.audioEnabled ? '关闭声音' : '打开声音'}
      >
        {settings.audioEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
    </div>
  )
}
