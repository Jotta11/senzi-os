import { Link, useLocation } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { NAV } from '@/shell/nav'
import { useAppHref } from '@/shell/appPath'
import './sectionNav.css'

/**
 * Abas no topo das telas de uma seção com submenu (Financeiro, Acervo) — servem onde a sidebar vira trilho/barra.
 * Só quem enxerga mais de uma subtela as vê. `section` = caminho do item pai no `NAV`.
 */
export function SectionNav({ section, label }: { section: string; label: string }) {
  const { can } = usePermissions()
  const href = useAppHref()
  const { pathname } = useLocation()
  const items = (NAV.find((n) => n.path === section)?.children ?? []).filter((s) => can(s.perm))
  if (items.length < 2) return null
  const current = items.map((s) => href(s.path)).filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0]
  return (
    <nav className="sec-nav" aria-label={label}>
      {items.map((s) => (
        <Link key={s.path} to={href(s.path)} aria-current={href(s.path) === current ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  )
}
