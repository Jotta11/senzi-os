import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '@/ui'
import './shell.css'

export type SidebarItem = { to: string; icon: IconName; label: string; count?: number }

export type SidebarProps = {
  items: SidebarItem[]
  search?: boolean
  footer?: ReactNode
  /** Força o caminho usado para marcar o item ativo (padrão: a URL atual). */
  activePath?: string
  /** Mapeia o `to` de cada item para o link real (ex.: a prévia usa '/acervo' → '/preview/acervo'). */
  linkTo?(to: string): string
}

/** Item ativo = o link mais específico que casa com a URL ('/' só casa com '/'). */
function activeHref(hrefs: string[], pathname: string): string | undefined {
  const matches = (h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`))
  return hrefs.filter(matches).sort((a, b) => b.length - a.length)[0]
}

/** Sidebar Cranberry compartilhada pelo app e pela prévia. Trilho de ícones ≤1024px, barra no topo ≤560px. */
export function Sidebar({ items, search, footer, activePath, linkTo }: SidebarProps) {
  const location = useLocation()
  const pathname = activePath ?? location.pathname
  const links = items.map((n) => ({ ...n, href: linkTo ? linkTo(n.to) : n.to }))
  const active = activeHref(links.map((n) => n.href), pathname)
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
        {links.map((n) => (
          <Link
            key={n.to}
            to={n.href}
            aria-current={n.href === active ? 'page' : undefined}
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
