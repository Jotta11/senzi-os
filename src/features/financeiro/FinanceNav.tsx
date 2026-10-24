import { Link, useLocation } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { NAV } from '@/shell/nav'
import { useAppHref } from '@/shell/appPath'
import './financeiro.css'

const SECTIONS = NAV.find((n) => n.path === '/financeiro')!.children!

/** Abas no topo das quatro páginas (servem onde a sidebar vira trilho/barra). Só quem enxerga mais de uma seção as vê. */
export function FinanceNav() {
  const { can } = usePermissions()
  const href = useAppHref()
  const { pathname } = useLocation()
  const items = SECTIONS.filter((s) => can(s.perm))
  if (items.length < 2) return null
  const current = items.map((s) => href(s.path)).filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0]
  return (
    <nav className="fx-nav" aria-label="Seções do Financeiro">
      {items.map((s) => (
        <Link key={s.path} to={href(s.path)} aria-current={href(s.path) === current ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  )
}
