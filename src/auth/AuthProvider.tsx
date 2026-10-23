import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const userRef = useRef<AppUser | null>(null)
  /** Contador de requisições: resultado de uma busca antiga (stale) é descartado. */
  const reqRef = useRef(0)
  /** Id do usuário cuja busca de perfil está em andamento (evita busca duplicada). */
  const pendingRef = useRef<string | null>(null)

  const applyUser = useCallback((u: AppUser | null) => {
    userRef.current = u
    setUser(u)
  }, [])

  const loadUser = useCallback(
    async (userId: string) => {
      if (!supabase) return
      const req = ++reqRef.current
      pendingRef.current = userId
      let data: AppUser | null = null
      let failed: boolean
      try {
        const res = await supabase
          .from('app_user')
          .select('id, full_name, email, role, is_active')
          .eq('id', userId)
          .maybeSingle()
        failed = !!res.error
        data = (res.data as AppUser | null) ?? null
      } catch {
        failed = true
      }
      if (req !== reqRef.current) return
      pendingRef.current = null
      if (failed) {
        // Falha transitória: nunca derruba a sessão. Já logado mantém o estado; senão mostra erro com retry.
        if (!userRef.current) setLoadError(MSG_PROFILE)
        return
      }
      // Resultado definitivo sem linha legível (RLS zera tudo para inativo) ou inativo: desativado.
      if (!data || !data.is_active) {
        setNotice(MSG_DEACTIVATED)
        applyUser(null)
        setLoadError(null)
        setStatus('signed_out')
        queryClient.clear()
        try {
          await supabase.auth.signOut()
        } catch {
          /* sessão local já descartada na interface */
        }
        return
      }
      setNotice(null)
      setLoadError(null)
      applyUser(data)
      setStatus('signed_in')
    },
    [supabase, queryClient, applyUser],
  )

  const resolveSession = useCallback(async () => {
    if (!supabase) return
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) void loadUser(data.session.user.id)
      else setStatus('signed_out')
    } catch {
      setStatus('signed_out')
    }
  }, [supabase, loadUser])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    // Sincroniza com o sistema externo (sessão do Supabase); o setState ocorre após await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resolveSession()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'SIGNED_IN' && session) {
        const id = session.user.id
        if (userRef.current?.id === id || pendingRef.current === id) return
        // Fora do callback para não travar o cliente do Supabase.
        setTimeout(() => {
          if (alive) void loadUser(id)
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        reqRef.current++
        pendingRef.current = null
        applyUser(null)
        setLoadError(null)
        setStatus('signed_out')
        queryClient.clear()
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadUser, resolveSession, applyUser, queryClient])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new SignInError('Conexão não configurada.', false)
      setNotice(null)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const invalid = error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)
        throw new SignInError(invalid ? 'E-mail ou senha incorretos' : 'Não foi possível entrar. Tente novamente.', invalid)
      }
      // O perfil é carregado pelo evento SIGNED_IN (único caminho).
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    reqRef.current++
    pendingRef.current = null
    await supabase.auth.signOut()
    applyUser(null)
    setStatus('signed_out')
    queryClient.clear()
  }, [supabase, queryClient, applyUser])

  const retry = useCallback(async () => {
    setLoadError(null)
    await resolveSession()
  }, [resolveSession])

  const value = useMemo(
    () => ({ status, user, notice, loadError, signIn, signOut, retry }),
    [status, user, notice, loadError, signIn, signOut, retry],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
