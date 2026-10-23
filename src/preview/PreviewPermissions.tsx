import { useMemo, useState, type ReactNode } from 'react'
import type { Perm } from '@/auth/permissions'
import { PermissionsContext, type PermissionsValue } from '@/auth/permissionsContext'
import { permsFor, PreviewRoleContext, type PreviewRole } from './previewRole'

export type PreviewPermissionsProviderProps = {
  initialRole?: PreviewRole
  /** Tira permissões do perfil (útil nos testes das telas, ex.: `['financeiro.view']`). */
  revoke?: Perm[]
  children: ReactNode
}

/**
 * Permissões simuladas da prévia: alimenta `usePermissions()` (via `PermissionsContext`) com o perfil
 * escolhido em "Ver como" — Administrador = todas; Atendimento = o conjunto do banco.
 */
export function PreviewPermissionsProvider({ initialRole = 'admin', revoke, children }: PreviewPermissionsProviderProps) {
  const [role, setRole] = useState<PreviewRole>(initialRole)
  const revokeKey = (revoke ?? []).join(',')
  const value = useMemo<PermissionsValue>(() => {
    const perms = permsFor(role)
    for (const p of revokeKey.split(',')) perms.delete(p as Perm)
    return { can: (p) => perms.has(p), perms, isLoading: false, isError: false, refetch: () => {} }
  }, [role, revokeKey])
  const roleValue = useMemo(() => ({ role, setRole }), [role])
  return (
    <PreviewRoleContext.Provider value={roleValue}>
      <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
    </PreviewRoleContext.Provider>
  )
}
