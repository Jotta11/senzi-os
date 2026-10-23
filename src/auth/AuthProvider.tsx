import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { MSG_DEACTIVATED, MSG_PROFILE, SignInError } from './authErrors'
import { AuthContext, type AppUser, type AuthValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthValue['status']>(supabase ? 'loading' : 'signed_out')
  const [user, setUser] = useState<AppUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadUser = useCallback(
    async (userId: string) => {
      if (!supabase) return
      const { data, error } = await supabase
        .from('app_user')
        .select('id, full_name, email, role, is_active')
        .eq('id', userId)
        .maybeSingle()
      // Sem linha legível (RLS zera tudo para usuário inativo) ou inativo: desativado.
      if (error || !data || !data.is_active) {
        setNotice(error ? MSG_PROFILE : MSG_DEACTIVATED)
        setUser(null)
        setStatus('signed_out')
        queryClient.clear()
        await supabase.auth.signOut()
        return
      }
      setNotice(null)
      setUser(data as AppUser)
      setStatus('signed_in')
    },
    [supabase, queryClient],
  )

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session) void loadUser(data.session.user.id)
      else setStatus('signed_out')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'SIGNED_IN' && session) {
        // Fora do callback para não travar o cliente do Supabase.
        setTimeout(() => void loadUser(session.user.id), 0)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setStatus('signed_out')
        queryClient.clear()
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadUser, queryClient])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new SignInError('Conexão não configurada.', false)
      setNotice(null)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const invalid = error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)
        throw new SignInError(invalid ? 'E-mail ou senha incorretos' : 'Não foi possível entrar. Tente novamente.', invalid)
      }
      // Cobre clientes que não emitem SIGNED_IN antes do retorno.
      const { data } = await supabase.auth.getSession()
      if (data.session) await loadUser(data.session.user.id)
    },
    [supabase, loadUser],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setStatus('signed_out')
    queryClient.clear()
  }, [supabase, queryClient])

  const value = useMemo(() => ({ status, user, notice, signIn, signOut }), [status, user, notice, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
