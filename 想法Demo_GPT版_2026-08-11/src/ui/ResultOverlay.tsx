import { ChevronRight, Home, RotateCcw, Target } from 'lucide-react'
import type { RoundResult } from '../game/types'

type ResultOverlayProps = {
  result: RoundResult
  onContinue: () => void
  onRestartMatch: () => void
  onMenu: () => void
}

const resultCopy = {
  player: { title: '坐标锁定', subtitle: '本回合获胜' },
  ai: { title: '信号中断', subtitle: '本回合失利' },
  draw: { title: '同步归零', subtitle: '本回合平局' },
} as const

export function ResultOverlay({ result, onContinue, onRestartMatch, onMenu }: ResultOverlayProps) {
  const copy = resultCopy[result.winner]
  const accuracy = result.stats.shots > 0
    ? Math.round((result.stats.hits / result.stats.shots) * 100)
    : 0
  const informedShare = result.stats.hits > 0
    ? Math.round((result.stats.informedHits / result.stats.hits) * 100)
    : 0
  const playerWonMatch = result.playerScore >= 3

  return (
    <section className="result-layer" aria-modal="true" role="dialog" aria-labelledby="result-title">
      <div className="result-content">
        <div className="result-symbol" aria-hidden="true">
          <Target size={30} strokeWidth={1.4} />
        </div>
        <span className="overlay-code">
          {result.matchComplete ? 'MATCH COMPLETE' : `ROUND ${String(result.round).padStart(2, '0')} COMPLETE`}
        </span>
        <h2 id="result-title">
          {result.matchComplete ? (playerWonMatch ? '追猎完成' : '演算失守') : copy.title}
        </h2>
        <p>{result.matchComplete ? `${result.playerScore} : ${result.aiScore}` : copy.subtitle}</p>

        <dl className="result-metrics">
          <div>
            <dt>射击</dt>
            <dd>{result.stats.shots}</dd>
          </div>
          <div>
            <dt>命中率</dt>
            <dd>{accuracy}%</dd>
          </div>
          <div>
            <dt>线索伤害</dt>
            <dd>{informedShare}%</dd>
          </div>
          <div>
            <dt>用时</dt>
            <dd>{Math.round(result.stats.elapsedSeconds)}s</dd>
          </div>
        </dl>

        {result.matchComplete ? (
          <button type="button" className="primary-action" onClick={onRestartMatch} autoFocus>
            <RotateCcw size={18} />
            再战一场
          </button>
        ) : (
          <button type="button" className="primary-action" onClick={onContinue} autoFocus>
            下一回合
            <ChevronRight size={19} />
          </button>
        )}
        <button type="button" className="text-action" onClick={onMenu}>
          <Home size={16} />
          返回主菜单
        </button>
      </div>
    </section>
  )
}
