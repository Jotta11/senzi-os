export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/** Classes do botão — também usadas em links (`<Link className={buttonClass(...)}>`). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md', extra?: string) {
  return ['btn', variant !== 'secondary' && `btn-${variant}`, size === 'sm' && 'btn-sm', extra]
    .filter(Boolean)
    .join(' ')
}
