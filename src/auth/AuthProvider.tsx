import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import {
  MSG_DEACTIVATED,
  MSG_NO_CLIENT,
  MSG_OFFLINE,
  MSG_PASSWORD_UPDATE,
  MSG_PROFILE,
  passwordUpdateMessage,
  SignInError,
} from './authErrors'
import { AuthContext, type AppUser, type AuthValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthValue['status']>(supabase ? 'loading' : 'signed_out')
  const [user, setUser] = useState<AppUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
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
        setRecovery(false)
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

  // Sessão salva no aparelho: o app fica conectado até a pessoa sair. Sem internet para renovar o acesso
  // (PWA aberto sem sinal), a sessão continua guardada — mostra o aviso e tenta de novo, nunca a tela de login.
  const resolveSession = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.auth.getSession()
      if (data.session) void loadUser(data.session.user.id)
      else if (error && isAuthRetryableFetchError(error)) setLoadError(MSG_OFFLINE)
      else setStatus('signed_out')
    } catch (err) {
      if (isAuthRetryableFetchError(err)) setLoadError(MSG_OFFLINE)
      else setStatus('signed_out')
    }
  }, [supabase, loadUser])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    // Sincroniza com o sistema externo (sessão do Supabase); o setState ocorre após await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resolveSession()
    // Fora do callback para não travar o cliente do Supabase.
    const later = (id: string) =>
      setTimeout(() => {
        if (alive) void loadUser(id)
      }, 0)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        const id = session.user.id
        if (userRef.current?.id === id || pendingRef.current === id) return
        later(id)
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Reconfere o perfil a cada renovação do token: desativação no meio da sessão
        // cai no caminho de "acesso desativado". Uma busca por evento, sem laço.
        const id = session.user.id
        if (userRef.current?.id === id && pendingRef.current !== id) later(id)
      } else if (event === 'SIGNED_OUT') {
        reqRef.current++
        pendingRef.current = null
        setRecovery(false)
        applyUser(null)
        setLoadError(null)
        setStatus('signed_out')
        queryClient.clear()
      }
    })
    // my_permissions vazio com sessão aberta: provável desativação (has_perm zera tudo
    // para inativo). Reconfere o perfil uma vez por resultado vazio; usuário ainda ativo
    // continua logado e nada é refeito até um novo resultado.
    const unsubCache = queryClient.getQueryCache().subscribe((e) => {
      if (
        e.type === 'updated' &&
        e.action.type === 'success' &&
        e.query.queryKey[0] === 'my_permissions' &&
        Array.isArray(e.action.data) &&
        e.action.data.length === 0
      ) {
        const id = userRef.current?.id
        if (id && pendingRef.current !== id) later(id)
      }
    })
    // Voltou a internet sem usuário carregado (aviso de sem conexão ou perfil não carregado): tenta de novo.
    const onOnline = () => {
      if (alive && !userRef.current) void resolveSession()
    }
    window.addEventListener('online', onOnline)
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      unsubCache()
      window.removeEventListener('online', onOnline)
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

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase) throw new Error(MSG_NO_CLIENT)
      let error: { code?: string; message?: string } | null
      try {
        ;({ error } = await supabase.auth.updateUser({ password }))
      } catch {
        throw new Error(MSG_PASSWORD_UPDATE)
      }
      if (error) throw new Error(passwordUpdateMessage(error))
    },
    [supabase],
  )

  const finishRecovery = useCallback(() => setRecovery(false), [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    reqRef.current++
    pendingRef.current = null
    setRecovery(false)
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
    () => ({ status, user, notice, loadError, signIn, signOut, retry, recovery, updatePassword, finishRecovery }),
    [status, user, notice, loadError, signIn, signOut, retry, recovery, updatePassword, finishRecovery],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
