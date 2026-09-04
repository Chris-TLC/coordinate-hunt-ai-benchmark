import type { GameToast } from '../game/types'

export function ToastStack({ toasts }: { toasts: readonly GameToast[] }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => <div key={t.id} className={`toast toast--${t.tone}`}>{t.text}</div>)}
    </div>
  )
}
