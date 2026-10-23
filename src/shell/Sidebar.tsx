import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '@/ui'
import './shell.css'

export type SidebarItem = { to: string; icon: IconName; label: string; count?: number }

/** Sidebar Cranberry compartilhada pelo app e pela prévia. Trilho de ícones ≤1024px, barra no topo ≤560px. */
export function Sidebar({ items, search, footer }: { items: SidebarItem[]; search?: boolean; footer?: ReactNode }) {
  const { pathname } = useLocation()
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
  return (
    <aside className="sb-rail">
      <div className="sb-brand">
        <span className="sb-mark">Senzi</span>
        <span className="sb-os">OS</span>
      </div>
      {search && (
        <button type="button" className="sb-search" aria-label="Buscar">
          <Icon name="busca" size={15} />
          <span>Buscar…</span>
          <kbd>⌘K</kbd>
        </button>
      )}
      <nav className="sb-nav" aria-label="Navegação principal">
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            aria-current={isActive(n.to) ? 'page' : undefined}
            aria-label={n.label}
            title={n.label}
          >
            <Icon name={n.icon} size={16} />
            <span className="sb-nav-label">{n.label}</span>
            {n.count != null && (
              <span className="sb-count" aria-hidden="true">
                {n.count}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {footer && <div className="sb-foot">{footer}</div>}
    </aside>
  )
}
