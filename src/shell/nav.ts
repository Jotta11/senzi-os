import type { Perm } from '@/auth/permissions'
import type { IconName } from '@/ui'

export type NavItem = { path: string; icon: IconName; label: string; perm: Perm }

/** Itens da sidebar, na ordem do protótipo. Cada um só aparece para quem tem a permissão. */
export const NAV: NavItem[] = [
  { path: '/', icon: 'dashboard', label: 'Dashboard', perm: 'dashboard.view' },
  { path: '/agenda', icon: 'agenda', label: 'Agenda', perm: 'agenda.view' },
  { path: '/provas', icon: 'prova', label: 'Provas', perm: 'prova.view' },
  { path: '/reservas', icon: 'reservas', label: 'Reservas', perm: 'reserva.view' },
  { path: '/acervo', icon: 'acervo', label: 'Acervo', perm: 'acervo.view' },
  { path: '/clientes', icon: 'clientes', label: 'Clientes', perm: 'cliente.view' },
  { path: '/operacao', icon: 'operacao', label: 'Operação', perm: 'operacao.view' },
  { path: '/financeiro', icon: 'financeiro', label: 'Financeiro', perm: 'financeiro.view' },
  { path: '/inteligencia', icon: 'inteligencia', label: 'Inteligência', perm: 'inteligencia.view' },
  { path: '/config', icon: 'config', label: 'Configurações', perm: 'config.view' },
]
