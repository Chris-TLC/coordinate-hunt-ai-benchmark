import { Volume2, VolumeX } from 'lucide-react'
import type { Settings } from '../game/types'

type Props = { settings: Settings; onChange: (s: Settings) => void; compact?: boolean }

export function SettingsControls({ settings, onChange, compact = false }: Props) {
  return (
    <div className={compact ? 'settings-controls is-compact' : 'settings-controls'}>
      <label className="setting-row" htmlFor={compact ? 'sens-p' : 'sens-m'}>
        <span>灵敏度</span>
        <input id={compact ? 'sens-p' : 'sens-m'} type="range" min="0.45" max="1.8" step="0.05"
          value={settings.mouseSensitivity} onChange={(e) => onChange({ ...settings, mouseSensitivity: Number(e.currentTarget.value) })} />
        <output>{settings.mouseSensitivity.toFixed(2)}</output>
      </label>
      <button type="button" className="icon-button"
        onClick={() => onChange({ ...settings, audioEnabled: !settings.audioEnabled })}
        aria-label={settings.audioEnabled ? '关闭声音' : '打开声音'}
        title={settings.audioEnabled ? '关闭声音' : '打开声音'}>
        {settings.audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </div>
  )
}
