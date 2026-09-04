import { useCallback, useEffect, useRef, useState } from 'react'
import { Monitor } from 'lucide-react'
import { ArenaGame } from './game/ArenaGame'
import type {
  GameToast,
  HudSnapshot,
  RoundResult,
  Settings,
} from './game/types'
import { GameHud } from './ui/GameHud'
import { MainMenu } from './ui/MainMenu'
import { PauseOverlay } from './ui/PauseOverlay'
import { ResultOverlay } from './ui/ResultOverlay'
import { ToastStack } from './ui/ToastStack'

const DEFAULT_SETTINGS: Settings = {
  difficulty: 'operator',
  audioEnabled: true,
  mouseSensitivity: 1,
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'menu',
  difficulty: 'operator',
  round: 1,
  playerScore: 0,
  aiScore: 0,
  playerHp: 3,
  aiHp: 3,
  timeRemaining: 120,
  countdownRemaining: 3,
  fireCooldown: 0,
  scanAvailable: true,
  speedBoostRemaining: 0,
  playerPosition: { x: 3.15, z: 12.8 },
  aimPosition: null,
  aimValid: false,
  pointerLocked: false,
  exposureWarning: false,
  aiScanning: false,
}

const loadSettings = (): Settings => {
  try {
    const parsed = JSON.parse(localStorage.getItem('coordinate-hunt-settings') ?? '') as Partial<Settings>
    return {
      difficulty: ['cadet', 'operator', 'hunter'].includes(parsed.difficulty ?? '')
        ? parsed.difficulty!
        : DEFAULT_SETTINGS.difficulty,
      audioEnabled: typeof parsed.audioEnabled === 'boolean' ? parsed.audioEnabled : true,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number'
          ? Math.min(1.8, Math.max(0.45, parsed.mouseSensitivity))
          : 1,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ArenaGame | null>(null)
  const toastId = useRef(0)
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const initialSettingsRef = useRef(settings)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [toasts, setToasts] = useState<GameToast[]>([])

  const handleToast = useCallback((toast: Omit<GameToast, 'id'>) => {
    const id = ++toastId.current
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, (toast.duration ?? 1.4) * 1000)
  }, [])

  const handleRoundEnd = useCallback((roundResult: RoundResult) => {
    setResult(roundResult)
  }, [])

  const handlePauseRequest = useCallback(() => {
    // The game snapshot drives the pause overlay; this callback marks the explicit UI boundary.
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const game = new ArenaGame(
      viewport,
      {
        onHud: setHud,
        onToast: handleToast,
        onRoundEnd: handleRoundEnd,
        onPauseRequest: handlePauseRequest,
      },
      initialSettingsRef.current,
    )
    gameRef.current = game
    return () => {
      game.dispose()
      gameRef.current = null
    }
  }, [handlePauseRequest, handleRoundEnd, handleToast])

  useEffect(() => {
    gameRef.current?.setSettings(settings)
    localStorage.setItem('coordinate-hunt-settings', JSON.stringify(settings))
  }, [settings])

  const startMatch = () => {
    setResult(null)
    gameRef.current?.startMatch(settings.difficulty)
  }

  const returnToMenu = () => {
    setResult(null)
    gameRef.current?.returnToMenu()
  }

  return (
    <div className="game-shell">
      <div ref={viewportRef} className="game-viewport" />
      <div className="damage-overlay" aria-hidden="true" />

      {hud.phase === 'menu' ? (
        <MainMenu settings={settings} onSettingsChange={setSettings} onStart={startMatch} />
      ) : null}

      {hud.phase === 'playing' || hud.phase === 'countdown' ? (
        <GameHud hud={hud} onPause={() => gameRef.current?.pause()} />
      ) : null}

      {hud.phase === 'countdown' ? (
        <div className="countdown-layer" aria-live="assertive">
          <span>{Math.max(1, Math.ceil(hud.countdownRemaining))}</span>
        </div>
      ) : null}

      {hud.phase === 'paused' ? (
        <PauseOverlay
          settings={settings}
          onSettingsChange={setSettings}
          onResume={() => gameRef.current?.resume()}
          onRestart={() => {
            setResult(null)
            gameRef.current?.restartRound()
          }}
          onMenu={returnToMenu}
        />
      ) : null}

      {(hud.phase === 'roundEnd' || hud.phase === 'matchEnd') && result ? (
        <ResultOverlay
          result={result}
          onContinue={() => {
            setResult(null)
            gameRef.current?.nextRound()
          }}
          onRestartMatch={startMatch}
          onMenu={returnToMenu}
        />
      ) : null}

      <ToastStack toasts={toasts} />

      <aside className="desktop-required" role="status">
        <Monitor size={28} />
        <strong>桌面设备</strong>
        <span>请使用键盘与鼠标继续对弈</span>
      </aside>
    </div>
  )
}
