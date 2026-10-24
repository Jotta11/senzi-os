import type { Perm } from '@/auth/permissions'
import type { IconName } from '@/ui'

export type NavItem = { path: string; icon: IconName; label: string; perm: Perm; children?: NavItem[] }

/** Itens da sidebar, na ordem do protótipo. Cada um só aparece para quem tem a permissão. */
export const NAV: NavItem[] = [
  { path: '/', icon: 'dashboard', label: 'Dashboard', perm: 'dashboard.view' },
  { path: '/agenda', icon: 'agenda', label: 'Agenda', perm: 'agenda.view' },
  { path: '/provas', icon: 'prova', label: 'Provas', perm: 'prova.view' },
  { path: '/reservas', icon: 'reservas', label: 'Reservas', perm: 'reserva.view' },
  { path: '/acervo', icon: 'acervo', label: 'Acervo', perm: 'acervo.view' },
  { path: '/clientes', icon: 'clientes', label: 'Clientes', perm: 'cliente.view' },
  { path: '/operacao', icon: 'operacao', label: 'Operação', perm: 'operacao.view' },
  {
    path: '/financeiro',
    icon: 'financeiro',
    label: 'Financeiro',
    perm: 'financeiro.view',
    children: [
      { path: '/financeiro', icon: 'financeiro', label: 'Visão geral', perm: 'financeiro.view' },
      { path: '/financeiro/receber', icon: 'moeda', label: 'Contas a Receber', perm: 'financeiro.geral' },
      { path: '/financeiro/pagar', icon: 'moeda', label: 'Contas a Pagar', perm: 'financeiro.geral' },
      { path: '/financeiro/categorias', icon: 'tag', label: 'Categorias', perm: 'financeiro.geral' },
    ],
  },
  { path: '/inteligencia', icon: 'inteligencia', label: 'Inteligência', perm: 'inteligencia.view' },
  { path: '/config', icon: 'config', label: 'Configurações', perm: 'config.view' },
]

/** Itens da sidebar visíveis para quem tem as permissões; subitens só aparecem se sobrar mais de um (só Visão geral = sem submenu). */
export function visibleNav(can: (perm: Perm) => boolean): { to: string; icon: IconName; label: string; children?: { to: string; label: string }[] }[] {
  return NAV.filter((n) => can(n.perm)).map((n) => {
    const kids = (n.children ?? []).filter((c) => can(c.perm)).map((c) => ({ to: c.path, label: c.label }))
    return { to: n.path, icon: n.icon, label: n.label, ...(kids.length > 1 ? { children: kids } : {}) }
  })
}
