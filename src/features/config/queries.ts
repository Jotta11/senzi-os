import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'

export type Role = 'admin' | 'atendimento'

export type UserRow = {
  id: string
  full_name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', atendimento: 'Atendimento' }

/** Colunas legíveis de app_user (select por coluna no banco — nunca `*`). */
export const USER_COLUMNS = 'id, full_name, email, role, is_active, created_at'

export const usersKey = ['config', 'users'] as const

export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return []
      const { data, error } = await sb.from('app_user').select(USER_COLUMNS).order('full_name')
      if (error) throw error
      return (data ?? []) as UserRow[]
    },
  })
}

/** Chama `admin_update_user`; `overrides` null mantém os overrides atuais. Lança o erro do banco. */
export async function updateUser(u: { id: string; role: Role; is_active: boolean }, overrides: Record<string, boolean> | null) {
  const sb = getSupabase()
  if (!sb) throw new Error('SEM_CONEXAO')
  const { error } = await sb.rpc('admin_update_user', {
    p_user_id: u.id,
    p_role: u.role,
    p_is_active: u.is_active,
    p_overrides: overrides,
  })
  if (error) throw error
}

/**
 * Perfil e status atuais lidos do banco na hora (não do cache da lista), para que
 * salvar permissões não reverta uma mudança de perfil/status feita por outro admin.
 */
export async function fetchUserAccess(id: string): Promise<{ id: string; role: Role; is_active: boolean }> {
  const sb = getSupabase()
  if (!sb) throw new Error('SEM_CONEXAO')
  const { data, error } = await sb.from('app_user').select('id, role, is_active').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('USUARIO_NAO_ENCONTRADO')
  return data as { id: string; role: Role; is_active: boolean }
}
