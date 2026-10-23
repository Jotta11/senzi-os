import { useContext, useMemo } from 'react'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { PERMISSIONS, type Perm } from './permissions'
import { PermissionsContext, type PermissionsValue } from './permissionsContext'
import { AuthContext } from './useAuth'

/**
 * Permissões de quem está usando a tela. Dentro de um `PermissionsContext` (ex.: prévia visual) devolve o valor
 * do contexto; fora dele, as do usuário logado (`my_permissions()`). A checagem que vale é a do banco.
 */
export function usePermissions(): PermissionsValue {
  const override = useContext(PermissionsContext)
  const remote = useRemotePermissions(override == null)
  return override ?? remote
}

/**
 * Cliente vazio usado só quando há override: a consulta fica desligada, mas `useQuery` ainda exige um cliente,
 * e a prévia não deve depender de QueryClientProvider só por causa das permissões.
 */
const inertClient = new QueryClient()

function useRemotePermissions(enabled: boolean): PermissionsValue {
  const auth = useContext(AuthContext)
  if (enabled && !auth) throw new Error('useAuth fora do AuthProvider')
  const status = auth?.status ?? 'signed_out'
  const query = useQuery({
    queryKey: ['my_permissions'],
    enabled: enabled && status === 'signed_in',
    queryFn: async () => {
      const supabase = getSupabase()
      if (!supabase) return []
      const { data, error } = await supabase.rpc('my_permissions')
      if (error) throw error
      return (data ?? []) as string[]
    },
  }, enabled ? undefined : inertClient)
  const perms = useMemo(
    () => new Set((query.data ?? []).filter((p): p is Perm => p in PERMISSIONS)),
    [query.data],
  )
  const can = (p: Perm) => perms.has(p)
  return {
    can,
    perms,
    isLoading: status === 'loading' || (status === 'signed_in' && query.isLoading),
    isError: status === 'signed_in' && query.isError && query.data === undefined,
    refetch: () => void query.refetch(),
  }
}
