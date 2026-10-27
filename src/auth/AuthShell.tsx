import type { ReactNode } from 'react'
import { Logo } from '@/ui'
import { MARK_PATH, MARK_VIEWBOX } from '@/ui/brandMark'
import './auth.css'

type AuthShellProps = { eyebrow: string; title: string; subtitle?: string; children: ReactNode }

/** Moldura das telas de acesso (login, nova senha): painel da marca em Cranberry + formulário sobre o fundo. */
export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  return (
    <main className="login">
      <aside className="login-brand">
        <svg className="login-watermark" viewBox={MARK_VIEWBOX} fill="currentColor" aria-hidden="true">
          <path d={MARK_PATH} />
        </svg>
        <Logo className="login-logo" />
        <div className="login-tagline">
          <p className="display">Welcome to your bigger closet</p>
          <span>Escolha. Alugue. Aproveite.</span>
        </div>
      </aside>
      <div className="login-form">
        <section className="login-panel">
          <header>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="display">{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}
