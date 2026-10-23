import type { HTMLAttributes, ReactNode } from 'react'

export type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode
  /** Conteúdo extra no cabeçalho, logo após o título (contagem, badge). */
  meta?: ReactNode
  actions?: ReactNode
  /** Corpo sem padding (listas, tabelas). */
  flush?: boolean
}

export function Card({ title, meta, actions, flush, className, children, ...rest }: CardProps) {
  const hasHeader = title != null || actions != null || meta != null
  return (
    <section className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {hasHeader && (
        <div className="card-h">
          {title != null && <h3>{title}</h3>}
          {meta}
          {actions != null && <div className="actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'card-b flush' : 'card-b'}>{children}</div>
    </section>
  )
}
