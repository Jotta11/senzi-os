import type { ReactNode } from 'react'

export type Tone = 'green' | 'wine' | 'amber' | 'indigo' | 'teal' | 'ochre' | 'stone' | 'red'

export type BadgeProps = {
  tone: Tone
  children: ReactNode
  /** Mostra o ponto de cor antes do rótulo (padrão: sim). */
  dot?: boolean
}

/** Status sempre com rótulo de texto — a cor nunca é a única informação. */
export function Badge({ tone, children, dot = true }: BadgeProps) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
