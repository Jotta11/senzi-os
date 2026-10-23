import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { PERMISSIONS, type Perm } from './permissions'
import { useAuth } from './useAuth'

/** Permissões do usuário logado (`my_permissions()`). A checagem que vale é a do banco. */
export function usePermissions(): {
  can(p: Perm): boolean
  perms: Set<Perm>
  isLoading: boolean
  /** Falha ao buscar as permissões (sem resultado anterior para usar). */
  isError: boolean
  refetch(): void
} {
  const { status } = useAuth()
  const query = useQuery({
    queryKey: ['my_permissions'],
    enabled: status === 'signed_in',
    queryFn: async () => {
      const supabase = getSupabase()
      if (!supabase) return []
      const { data, error } = await supabase.rpc('my_permissions')
      if (error) throw error
      return (data ?? []) as string[]
    },
  })
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
