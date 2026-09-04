type HealthBarProps = {
  hp: number
  maxHp?: number
  align?: 'left' | 'right'
}

export function HealthBar({ hp, maxHp = 6, align = 'left' }: HealthBarProps) {
  const cols = maxHp <= 4 ? maxHp : 3
  const rows = maxHp <= 4 ? 1 : Math.ceil(maxHp / 3)
  return (
    <div
      className={`health-bar health-bar--${align}`}
      aria-label={`生命值 ${hp}/${maxHp}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {Array.from({ length: maxHp }, (_, i) => (
        <span key={i} className={i < hp ? 'health-cell is-active' : 'health-cell'} />
      ))}
    </div>
  )
}
