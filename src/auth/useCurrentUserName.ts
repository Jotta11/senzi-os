import { createContext, useContext } from 'react'
import { AuthContext } from './useAuth'

/** Quem sobrepõe o nome do usuário atual (a prévia informa o perfil escolhido em "Ver como"). `null` = usar o login. */
export const CurrentUserNameContext = createContext<string | null>(null)

/** Nome de quem está usando o sistema: o informado pelo contexto ou, senão, o usuário logado. */
export function useCurrentUserName(): string | null {
  const override = useContext(CurrentUserNameContext)
  const auth = useContext(AuthContext)
  return override ?? auth?.user?.full_name ?? null
}
