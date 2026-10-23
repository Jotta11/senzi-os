import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'

export type EmptyStateProps = { title: string; description?: ReactNode; icon?: IconName; action?: ReactNode }

/** Estado vazio: ícone discreto, título, explicação e (opcional) uma ação. */
export function EmptyState({ title, description, icon = 'busca', action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-ic" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <p className="empty-t">{title}</p>
      {description && <p className="empty-d">{description}</p>}
      {action && <div className="empty-a">{action}</div>}
    </div>
  )
}
