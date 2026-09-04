import { ChevronRight, Home, RotateCcw, Target } from 'lucide-react'
import type { RoundResult } from '../game/types'

type Props = { result: RoundResult; onContinue: () => void; onRestartMatch: () => void; onMenu: () => void }

const copy = {
  player: { title: '坐标锁定', sub: '本回合获胜' },
  ai: { title: '信号中断', sub: '本回合失利' },
  draw: { title: '同步归零', sub: '本回合平局' },
} as const

export function ResultOverlay({ result, onContinue, onRestartMatch, onMenu }: Props) {
  const c = copy[result.winner]
  const acc = result.stats.shots > 0 ? Math.round((result.stats.coreHits + result.stats.grazeHits) / result.stats.shots * 100) : 0
  const inf = result.stats.damageDealt > 0 ? Math.round(result.stats.informedDamage / result.stats.damageDealt * 100) : 0
  return (
    <section className="result-layer" aria-modal="true" role="dialog" aria-labelledby="result-title">
      <div className="result-content">
        <div className="result-symbol" aria-hidden="true"><Target size={28} strokeWidth={1.4} /></div>
        <span className="overlay-code">{result.matchComplete ? 'MATCH COMPLETE' : `ROUND ${String(result.round).padStart(2, '0')} COMPLETE`}</span>
        <h2 id="result-title">{result.matchComplete ? (result.playerScore >= 3 ? '追猎完成' : '演算失守') : c.title}</h2>
        <p>{result.matchComplete ? `${result.playerScore} : ${result.aiScore}` : c.sub}</p>
        <dl className="result-metrics">
          <div><dt>命中</dt><dd>{result.stats.coreHits + result.stats.grazeHits}</dd></div>
          <div><dt>命中率</dt><dd>{acc}%</dd></div>
          <div><dt>线索伤害</dt><dd>{inf}%</dd></div>
          <div><dt>用时</dt><dd>{Math.round(result.stats.elapsedSeconds)}s</dd></div>
        </dl>
        {result.matchComplete ? (
          <button type="button" className="primary-action" onClick={onRestartMatch} autoFocus><RotateCcw size={17} /> 再战一场</button>
        ) : (
          <button type="button" className="primary-action" onClick={onContinue} autoFocus>下一回合 <ChevronRight size={18} /></button>
        )}
        <button type="button" className="text-action" onClick={onMenu}><Home size={15} /> 返回主菜单</button>
      </div>
    </section>
  )
}
