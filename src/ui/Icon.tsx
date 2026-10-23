import { ICONS, type IconName } from './icons'

export type IconProps = {
  name: IconName
  size?: number
  className?: string
  /** Rótulo acessível; sem ele o ícone é decorativo (aria-hidden). */
  label?: string
}

export function Icon({ name, size = 16, className, label }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
