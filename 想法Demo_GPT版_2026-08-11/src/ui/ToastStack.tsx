import type { GameToast } from '../game/types'

export function ToastStack({ toasts }: { toasts: readonly GameToast[] }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          {toast.text}
        </div>
      ))}
    </div>
  )
}
