type HealthBarProps = {
  hp: number
  align?: 'left' | 'right'
}

export function HealthBar({ hp, align = 'left' }: HealthBarProps) {
  return (
    <div className={`health-bar health-bar--${align}`} aria-label={`生命值 ${hp}/3`}>
      {[0, 1, 2].map((index) => (
        <span key={index} className={index < hp ? 'health-cell is-active' : 'health-cell'} />
      ))}
    </div>
  )
}
