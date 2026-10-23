import { createContext, useContext } from 'react'
import { PERMISSIONS, type Perm } from '@/auth/permissions'

export type PreviewRole = 'admin' | 'atendimento'

export const PREVIEW_ROLES: { role: PreviewRole; label: string; userName: string; initials: string }[] = [
  { role: 'admin', label: 'Administrador', userName: 'Júlia Senzi', initials: 'JS' },
  { role: 'atendimento', label: 'Atendimento', userName: 'Ana Lima', initials: 'AL' },
]

/**
 * Perfil Atendimento — espelho exato dos `role_permission` de `supabase/migrations/20261023000100_acesso.sql`
 * (o teste `preview.test.tsx` compara com o SQL). Sem acervo.create, acervo.cost, financeiro consolidado/geral,
 * inteligência, reserva.authorize e config.*.
 */
export const ATENDIMENTO_PERMS: readonly Perm[] = [
  'dashboard.view',
  'agenda.view',
  'agenda.manage',
  'cliente.view',
  'cliente.create',
  'cliente.edit',
  'cliente.note',
  'acervo.view',
  'acervo.edit',
  'acervo.block',
  'prova.view',
  'prova.manage',
  'reserva.view',
  'reserva.create',
  'reserva.confirm',
  'reserva.cancel',
  'reserva.pickup',
  'reserva.return',
  'reserva.discount',
  'operacao.view',
  'operacao.inspect',
  'operacao.maintenance',
  'operacao.release',
  'financeiro.view',
  'financeiro.payment',
]

/** Administrador tem todas. */
export function permsFor(role: PreviewRole): Set<Perm> {
  return new Set(role === 'admin' ? (Object.keys(PERMISSIONS) as Perm[]) : ATENDIMENTO_PERMS)
}

export type PreviewRoleValue = { role: PreviewRole; setRole(role: PreviewRole): void }

export const PreviewRoleContext = createContext<PreviewRoleValue | null>(null)

/** Perfil simulado da prévia ("Ver como"). */
export function usePreviewRole(): PreviewRoleValue {
  const v = useContext(PreviewRoleContext)
  if (!v) throw new Error('usePreviewRole fora do PreviewPermissionsProvider')
  return v
}
