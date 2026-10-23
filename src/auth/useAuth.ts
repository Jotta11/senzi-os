import { createContext, useContext } from 'react'

export type AppUser = {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'atendimento'
  is_active: boolean
}

export type AuthValue = {
  status: 'loading' | 'signed_out' | 'signed_in'
  user: AppUser | null
  /** Aviso a exibir no login (ex.: acesso desativado). */
  notice: string | null
  /** Falha ao carregar o perfil na primeira carga (sem derrubar a sessão). */
  loadError: string | null
  retry(): Promise<void>
  /** Sessão aberta por link de redefinição de senha (evento PASSWORD_RECOVERY). */
  recovery: boolean
  /** Grava a nova senha; lança Error com mensagem pt-BR. */
  updatePassword(password: string): Promise<void>
  /** Sai da tela de nova senha e segue para o app. */
  finishRecovery(): void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
