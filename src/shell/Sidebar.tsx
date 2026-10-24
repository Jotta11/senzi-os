import { Fragment, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon, Logo, type IconName } from '@/ui'
import './shell.css'

export type SidebarItem = {
  to: string
  icon: IconName
  label: string
  count?: number
  /** Subitens (ex.: Financeiro): aparecem indentados só quando a rota está dentro da seção. */
  children?: { to: string; label: string }[]
}

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
  const map = (to: string) => (linkTo ? linkTo(to) : to)
  const links = items.map((n) => ({ ...n, href: map(n.to), kids: (n.children ?? []).map((c) => ({ ...c, href: map(c.to) })) }))
  const active = activeHref(links.map((n) => n.href), pathname)
  return (
    <aside className="sb-rail">
      <div className="sb-brand">
        <Logo className="sb-logo" />
        <Logo variant="mark" className="sb-logo-mark" />
      </div>
      {search && (
        <button type="button" className="sb-search" aria-label="Buscar">
          <Icon name="busca" size={15} />
          <span>Buscar…</span>
          <kbd>⌘K</kbd>
        </button>
      )}
      <nav className="sb-nav" aria-label="Navegação principal">
        {links.map((n) => {
          // Seção com subitens: o filho mais específico leva o destaque; "Visão geral" (mesmo caminho do pai) só tinge.
          const open = n.kids.length > 0 && n.href === active
          const kidActive = open ? activeHref(n.kids.map((c) => c.href), pathname) : undefined
          const kidIsDeeper = kidActive !== undefined && kidActive !== n.href
          return (
            <Fragment key={n.to}>
              <Link
                to={n.href}
                aria-current={n.href === active && !kidIsDeeper ? 'page' : undefined}
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
              {open &&
                n.kids.map((c) => (
                  <Link
                    key={c.to}
                    to={c.href}
                    className={c.href === n.href ? 'sb-sub sb-sub-first' : 'sb-sub'}
                    aria-current={c.href !== n.href && c.href === kidActive ? 'page' : undefined}
                    data-on={c.href === kidActive ? 'true' : undefined}
                  >
                    <span className="sb-nav-label">{c.label}</span>
                  </Link>
                ))}
            </Fragment>
          )
        })}
      </nav>
      {footer && <div className="sb-foot">{footer}</div>}
    </aside>
  )
}
