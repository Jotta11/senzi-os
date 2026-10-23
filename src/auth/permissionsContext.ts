import { createContext } from 'react'
import type { Perm } from './permissions'

/** O que `usePermissions()` devolve — igual no app real e na prévia. */
export type PermissionsValue = {
  can(p: Perm): boolean
  perms: Set<Perm>
  isLoading: boolean
  /** Falha ao buscar as permissões (sem resultado anterior para usar). */
  isError: boolean
  refetch(): void
}

/**
 * Fonte alternativa de permissões. Vazio (padrão) = permissões do usuário logado (`my_permissions()`).
 * A prévia visual preenche com o perfil simulado ("Ver como"), e as telas não precisam saber onde estão.
 */
export const PermissionsContext = createContext<PermissionsValue | null>(null)
