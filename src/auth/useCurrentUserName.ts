import { useContext } from 'react'
import { PREVIEW_ROLES, PreviewRoleContext } from '@/preview/previewRole'
import { AuthContext } from './useAuth'

/** Nome de quem está usando o sistema: o usuário logado ou, na prévia, o perfil escolhido em "Ver como". */
export function useCurrentUserName(): string | null {
  const preview = useContext(PreviewRoleContext)
  const auth = useContext(AuthContext)
  if (preview) return PREVIEW_ROLES.find((r) => r.role === preview.role)?.userName ?? null
  return auth?.user?.full_name ?? null
}
