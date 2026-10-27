import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { PHONE_QUERY, useMediaQuery } from '@/lib/useMediaQuery'
import { InstallAppButton } from '@/pwa/PwaPrompts'
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
  /** Abre a busca global; sem ele o botão "Buscar…" não aparece. */
  onSearch?(): void
  footer?: ReactNode
  /** Força o caminho usado para marcar o item ativo (padrão: a URL atual). */
  activePath?: string
  /** Mapeia o `to` de cada item para o link real (ex.: a prévia usa '/acervo' → '/preview/acervo'). */
  linkTo?(to: string): string
}

/** Atalhos da barra de abas do celular, em ordem de preferência (o resto fica em "Mais"). */
const TAB_PRIORITY = ['/', '/agenda', '/reservas', '/clientes']
const TAB_COUNT = 4

/** Item ativo = o link mais específico que casa com a URL ('/' só casa com '/'). */
function activeHref(hrefs: string[], pathname: string): string | undefined {
  const matches = (h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`))
  return hrefs.filter(matches).sort((a, b) => b.length - a.length)[0]
}

/** Os 4 atalhos do celular: os preferidos que a pessoa pode ver, completados pelos demais na ordem da sidebar. */
function pickTabs<T extends { to: string }>(items: T[]): T[] {
  const preferred = TAB_PRIORITY.map((to) => items.find((n) => n.to === to)).filter((n): n is T => !!n)
  const rest = items.filter((n) => !preferred.includes(n))
  return [...preferred, ...rest].slice(0, TAB_COUNT)
}

/**
 * Sidebar Cranberry compartilhada pelo app e pela prévia. Trilho de ícones no tablet (≤1024px).
 * No celular (≤640px) vira gaveta aberta pelo botão de menu da barra do topo, com barra de abas embaixo.
 */
export function Sidebar({ items, search, onSearch, footer, activePath, linkTo }: SidebarProps) {
  const location = useLocation()
  const phone = useMediaQuery(PHONE_QUERY)
  const [open, setOpen] = useState(false)
  const drawerOpen = phone && open
  const railRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const pathname = activePath ?? location.pathname
  const map = (to: string) => (linkTo ? linkTo(to) : to)
  const links = items.map((n) => ({ ...n, href: map(n.to), kids: (n.children ?? []).map((c) => ({ ...c, href: map(c.to) })) }))
  const active = activeHref(links.map((n) => n.href), pathname)
  const tabs = phone ? pickTabs(links) : []
  // "Mais" acende quando a tela atual não é um dos atalhos.
  const moreActive = phone && active !== undefined && !tabs.some((t) => t.href === active)

  // Gaveta aberta: Escape fecha, rolagem da página trava, foco vai para o primeiro link e volta ao menu ao fechar.
  useEffect(() => {
    if (!drawerOpen) return
    const menu = menuRef.current
    railRef.current?.querySelector<HTMLElement>('.sb-nav a')?.focus()
    const saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = saved
      menu?.focus()
    }
  }, [drawerOpen])

  return (
    <>
      {phone && (
        <header className="sb-top">
          <button
            ref={menuRef}
            type="button"
            className="sb-top-btn"
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            aria-controls="sb-rail"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" size={20} />
          </button>
          <Link to={map('/')} className="sb-top-logo" aria-label="Senzi Club — início">
            <Logo variant="name" />
          </Link>
          <span className="sb-top-btn" aria-hidden="true" />
        </header>
      )}
      {drawerOpen && <div className="sb-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <aside
        id="sb-rail"
        ref={railRef}
        className="sb-rail"
        data-open={drawerOpen ? 'true' : undefined}
        // Fechada no celular, a gaveta sai da ordem do Tab e do leitor de tela.
        inert={phone && !open}
        {...(phone && { role: 'dialog', 'aria-modal': drawerOpen, 'aria-label': 'Menu' })}
        // Escolher um destino fecha a gaveta.
        onClick={(e) => {
          if (phone && (e.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <div className="sb-brand">
          <Logo className="sb-logo" />
          <Logo variant="mark" className="sb-logo-mark" />
          {phone && (
            <button type="button" className="sb-close" aria-label="Fechar menu" onClick={() => setOpen(false)}>
              <Icon name="x" size={18} />
            </button>
          )}
        </div>
        {search && onSearch && (
          <button
            type="button"
            className="sb-search"
            aria-label="Buscar"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => {
              setOpen(false)
              onSearch()
            }}
          >
            <Icon name="busca" size={15} />
            <span>Buscar…</span>
            <kbd>⌘K</kbd>
          </button>
        )}
        <nav className="sb-nav" aria-label="Navegação principal">
          {links.map((n) => {
            // Seção com subitens: o filho mais específico leva o destaque; "Visão geral" (mesmo caminho do pai) só tinge.
            const expanded = n.kids.length > 0 && n.href === active
            const kidActive = expanded ? activeHref(n.kids.map((c) => c.href), pathname) : undefined
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
                {expanded &&
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
        <InstallAppButton />
        {footer && <div className="sb-foot">{footer}</div>}
      </aside>
      {phone && (
        <nav className="sb-tabs" aria-label="Atalhos">
          {tabs.map((t) => (
            <Link key={t.to} to={t.href} aria-current={t.href === active ? 'page' : undefined}>
              <Icon name={t.icon} size={20} />
              <span>{t.to === '/' ? 'Início' : t.label}</span>
            </Link>
          ))}
          <button type="button" data-on={moreActive ? 'true' : undefined} aria-expanded={drawerOpen} aria-controls="sb-rail" onClick={() => setOpen(true)}>
            <Icon name="mais" size={20} />
            <span>Mais</span>
          </button>
        </nav>
      )}
    </>
  )
}
