import { useCallback, useEffect, useRef, useState } from 'react'
import { Monitor } from 'lucide-react'
import { ArenaGame } from './game/ArenaGame'
import type { GameToast, HudSnapshot, RoundResult, Settings } from './game/types'
import { GameHud } from './ui/GameHud'
import { MainMenu } from './ui/MainMenu'
import { PauseOverlay } from './ui/PauseOverlay'
import { ResultOverlay } from './ui/ResultOverlay'
import { ToastStack } from './ui/ToastStack'

const DEFAULT_SETTINGS: Settings = { difficulty: 'operator', audioEnabled: true, mouseSensitivity: 1 }

const INITIAL_HUD: HudSnapshot = {
  phase: 'menu', difficulty: 'operator', round: 1,
  playerScore: 0, aiScore: 0, playerHp: 6, aiHp: 6, maxHp: 6,
  timeRemaining: 110, countdownRemaining: 3, fireCooldown: 0,
  scansLeft: 1, speedBoostRemaining: 0,
  playerPosition: { x: 3.4, z: 17.6 }, aimPosition: null, aimValid: false,
  pointerLocked: false, pointerFallback: false,
  exposureWarning: false, incomingScanWarning: false, lastFeedback: null,
}

const loadSettings = (): Settings => {
  try {
    const parsed = JSON.parse(localStorage.getItem('coordinate-hunt-settings') ?? '') as Partial<Settings>
    return {
      difficulty: (['cadet', 'operator', 'hunter'] as const).includes(parsed.difficulty as never) ? parsed.difficulty! as Settings['difficulty'] : DEFAULT_SETTINGS.difficulty,
      audioEnabled: typeof parsed.audioEnabled === 'boolean' ? parsed.audioEnabled : true,
      mouseSensitivity: typeof parsed.mouseSensitivity === 'number' ? Math.min(1.8, Math.max(0.45, parsed.mouseSensitivity)) : 1,
    }
  } catch { return DEFAULT_SETTINGS }
}

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ArenaGame | null>(null)
  const toastId = useRef(0)
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD)
  const [settings, setSettings] = useState(loadSettings)
  const initialSettingsRef = useRef(settings)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [toasts, setToasts] = useState<GameToast[]>([])

  const handleToast = useCallback((toast: Omit<GameToast, 'id'>) => {
    const id = ++toastId.current
    setToasts((c) => [...c.slice(-2), { ...toast, id }])
    window.setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), (toast.duration ?? 1.4) * 1000)
  }, [])
  const handleRoundEnd = useCallback((r: RoundResult) => setResult(r), [])
  const handlePauseRequest = useCallback(() => {}, [])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const game = new ArenaGame(vp, { onHud: setHud, onToast: handleToast, onRoundEnd: handleRoundEnd, onPauseRequest: handlePauseRequest }, initialSettingsRef.current)
    gameRef.current = game
    return () => { game.dispose(); gameRef.current = null }
  }, [handlePauseRequest, handleRoundEnd, handleToast])

  useEffect(() => { gameRef.current?.setSettings(settings); localStorage.setItem('coordinate-hunt-settings', JSON.stringify(settings)) }, [settings])

  return (
    <div className="game-shell">
      <div ref={viewportRef} className="game-viewport" />
      <div className="damage-overlay" style={{ '--damage-angle': '0rad' } as React.CSSProperties} aria-hidden="true" />
      {hud.phase === 'menu' && <MainMenu settings={settings} onSettingsChange={setSettings} onStart={() => { setResult(null); gameRef.current?.startMatch(settings.difficulty) }} />}
      {(hud.phase === 'playing' || hud.phase === 'countdown') && <GameHud hud={hud} onPause={() => gameRef.current?.pause()} />}
      {hud.phase === 'countdown' && <div className="countdown-layer" aria-live="assertive"><span>{Math.max(1, Math.ceil(hud.countdownRemaining))}</span></div>}
      {hud.phase === 'paused' && <PauseOverlay settings={settings} onSettingsChange={setSettings} onResume={() => gameRef.current?.resume()} onRestart={() => { setResult(null); gameRef.current?.restartRound() }} onMenu={() => { setResult(null); gameRef.current?.returnToMenu() }} />}
      {(hud.phase === 'roundEnd' || hud.phase === 'matchEnd') && result && (
        <ResultOverlay result={result} onContinue={() => { setResult(null); gameRef.current?.nextRound() }} onRestartMatch={() => { setResult(null); gameRef.current?.startMatch(settings.difficulty) }} onMenu={() => { setResult(null); gameRef.current?.returnToMenu() }} />
      )}
      <ToastStack toasts={toasts} />
      <aside className="desktop-required" role="status"><Monitor size={26} /><strong>桌面设备</strong><span>请使用键盘与鼠标继续对弈</span></aside>
    </div>
  )
}
