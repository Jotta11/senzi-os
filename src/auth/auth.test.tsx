import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { AuthGate } from './AuthGate'
import { usePermissions } from './usePermissions'

const envMock = vi.hoisted(() => ({ getEnv: vi.fn() }))
const sbMock = vi.hoisted(() => ({ getSupabase: vi.fn() }))
vi.mock('@/lib/env', () => envMock)
vi.mock('@/lib/supabase', () => sbMock)

type Row = { id: string; full_name: string; email: string; role: string; is_active: boolean } | null

function fakeClient(opts: { session?: boolean; row?: Row; perms?: string[]; signInError?: { message: string; code?: string } | null; fetchRow?: () => Promise<{ data: Row; error: unknown }>; getSession?: () => Promise<unknown> }) {
  let cb: (event: string, session: unknown) => void = () => {}
  const fetchRow = vi.fn(opts.fetchRow ?? (() => Promise.resolve({ data: opts.row ?? null, error: null })))
  const client = {
    auth: {
      getSession: vi.fn(opts.getSession ?? (() => Promise.resolve({ data: { session: opts.session ? { user: { id: 'u1' } } : null } }))),
      onAuthStateChange: vi.fn((f: typeof cb) => {
        cb = f
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(() => {
        if (!opts.signInError) cb('SIGNED_IN', { user: { id: 'u1' } })
        return Promise.resolve({ error: opts.signInError ?? null })
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: fetchRow }) }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: opts.perms ?? [], error: null }),
  }
  sbMock.getSupabase.mockReturnValue(client)
  return Object.assign(client, { emit: (e: string, sess: unknown) => cb(e, sess), fetchRow })
}

function PermsProbe() {
  const { perms } = usePermissions()
  return <p>conteúdo do app ({perms.size} permissões)</p>
}

function renderApp(opts: { probe?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ element: <AuthGate />, children: [{ path: '/', element: opts.probe ? <PermsProbe /> : <p>conteúdo do app</p> }] }],
    { initialEntries: ['/'] },
  )
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  envMock.getEnv.mockReturnValue({ url: 'http://x', anonKey: 'k' })
})

describe('auth', () => {
  it('sem env mostra a tela Configurar conexão com as duas variáveis', async () => {
    envMock.getEnv.mockReturnValue(null)
    sbMock.getSupabase.mockReturnValue(null)
    renderApp()
    expect(await screen.findByText('Configurar conexão')).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument()
  })

  it('signed out mostra o login e chama signInWithPassword', async () => {
    const c = fakeClient({ session: false })
    renderApp()
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'segredo' })
  })

  it('credencial inválida mostra mensagem em pt-BR', async () => {
    fakeClient({ session: false, signInError: { message: 'Invalid login credentials', code: 'invalid_credentials' } })
    renderApp()
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail ou senha incorretos')).toBeInTheDocument()
  })

  it('esqueci minha senha chama resetPasswordForEmail com redirectTo', async () => {
    const c = fakeClient({ session: false })
    renderApp()
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: `${window.location.origin}/` })
  })

  it('usuário desativado sofre logout e vê o aviso', async () => {
    const c = fakeClient({
      session: true,
      row: { id: 'u1', full_name: 'Ana', email: 'a@b.com', role: 'atendimento', is_active: false },
    })
    renderApp()
    expect(await screen.findByText('Seu acesso foi desativado. Fale com um administrador.')).toBeInTheDocument()
    expect(c.auth.signOut).toHaveBeenCalled()
  })

  it('sem linha legível em app_user também é tratado como desativado', async () => {
    const c = fakeClient({ session: true, row: null })
    renderApp()
    expect(await screen.findByText('Seu acesso foi desativado. Fale com um administrador.')).toBeInTheDocument()
    expect(c.auth.signOut).toHaveBeenCalled()
  })

  it('usuário ativo vê o app', async () => {
    fakeClient({ session: true, row: { id: 'u1', full_name: 'Ana', email: 'a@b.com', role: 'atendimento', is_active: true } })
    renderApp()
    expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
  })

  it('can(config.users) é false para perms de atendimento', async () => {
    fakeClient({
      session: true,
      row: { id: 'u1', full_name: 'Ana', email: 'a@b.com', role: 'atendimento', is_active: true },
      perms: ['dashboard.view', 'cliente.view'],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
    const { result } = renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.can('cliente.view')).toBe(true)
    expect(result.current.can('config.users')).toBe(false)
  })

  const active: Row = { id: 'u1', full_name: 'Ana', email: 'a@b.com', role: 'atendimento', is_active: true }
  const sess = { user: { id: 'u1' } }

  it('SIGNED_IN reemitido com falha de rede mantém o usuário logado', async () => {
    const c = fakeClient({ session: true, row: active })
    renderApp()
    expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
    c.fetchRow.mockResolvedValue({ data: null, error: { message: 'network' } })
    c.emit('SIGNED_IN', { user: { id: 'u2' } })
    await waitFor(() => expect(c.fetchRow).toHaveBeenCalledTimes(2))
    expect(c.auth.signOut).not.toHaveBeenCalled()
    expect(screen.getByText('conteúdo do app')).toBeInTheDocument()
  })

  it('SIGNED_IN do mesmo usuário já logado não refaz a busca', async () => {
    const c = fakeClient({ session: true, row: active })
    renderApp()
    await screen.findByText('conteúdo do app')
    c.emit('SIGNED_IN', sess)
    await new Promise((r) => setTimeout(r, 20))
    expect(c.fetchRow).toHaveBeenCalledTimes(1)
  })

  it('primeira carga com erro mostra aviso, não faz signOut e permite tentar de novo', async () => {
    let fail = true
    const c = fakeClient({
      session: true,
      fetchRow: () => Promise.resolve(fail ? { data: null, error: { message: 'x' } } : { data: active, error: null }),
    })
    renderApp()
    expect(await screen.findByText('Não foi possível carregar seu perfil. Tente novamente.')).toBeInTheDocument()
    expect(c.auth.signOut).not.toHaveBeenCalled()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
  })

  it('SIGNED_OUT durante busca pendente termina signed_out', async () => {
    let resolve: (v: { data: Row; error: null }) => void = () => {}
    const c = fakeClient({ session: true, fetchRow: () => new Promise((r) => (resolve = r)) })
    renderApp()
    await waitFor(() => expect(c.fetchRow).toHaveBeenCalled())
    c.emit('SIGNED_OUT', null)
    resolve({ data: active, error: null })
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo do app')).not.toBeInTheDocument()
  })

  it('login dispara exatamente uma busca de app_user', async () => {
    const c = fakeClient({ session: false, row: active })
    renderApp()
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
    expect(c.fetchRow).toHaveBeenCalledTimes(1)
  })

  it('getSession rejeitado cai em signed_out sem rejeição não tratada', async () => {
    fakeClient({ getSession: () => Promise.reject(new Error('boom')) })
    renderApp()
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument()
  })

  describe('desativação no meio da sessão (I3)', () => {
    const inactive: Row = { ...active!, is_active: false }

    it('my_permissions vazio com sessão ativa refaz a checagem e desloga o desativado', async () => {
      let calls = 0
      const c = fakeClient({
        session: true,
        perms: [],
        fetchRow: () => Promise.resolve({ data: ++calls === 1 ? active : inactive, error: null }),
      })
      renderApp({ probe: true })
      expect(await screen.findByText('Seu acesso foi desativado. Fale com um administrador.')).toBeInTheDocument()
      expect(c.fetchRow).toHaveBeenCalledTimes(2)
      expect(c.auth.signOut).toHaveBeenCalled()
    })

    it('my_permissions vazio para usuário ainda ativo não entra em laço', async () => {
      const c = fakeClient({ session: true, row: active, perms: [] })
      renderApp({ probe: true })
      expect(await screen.findByText('conteúdo do app (0 permissões)')).toBeInTheDocument()
      await waitFor(() => expect(c.fetchRow).toHaveBeenCalledTimes(2))
      await new Promise((r) => setTimeout(r, 50))
      expect(c.fetchRow).toHaveBeenCalledTimes(2)
      expect(c.auth.signOut).not.toHaveBeenCalled()
      expect(screen.getByText('conteúdo do app (0 permissões)')).toBeInTheDocument()
    })

    it('com permissões, não refaz a checagem', async () => {
      const c = fakeClient({ session: true, row: active, perms: ['dashboard.view'] })
      renderApp({ probe: true })
      expect(await screen.findByText('conteúdo do app (1 permissões)')).toBeInTheDocument()
      await new Promise((r) => setTimeout(r, 30))
      expect(c.fetchRow).toHaveBeenCalledTimes(1)
    })

    it('TOKEN_REFRESHED refaz a checagem e desloga o desativado', async () => {
      const c = fakeClient({ session: true, row: active })
      renderApp()
      expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
      c.fetchRow.mockResolvedValue({ data: inactive, error: null })
      c.emit('TOKEN_REFRESHED', sess)
      expect(await screen.findByText('Seu acesso foi desativado. Fale com um administrador.')).toBeInTheDocument()
      expect(c.fetchRow).toHaveBeenCalledTimes(2)
    })

    it('TOKEN_REFRESHED com falha de rede mantém o usuário logado', async () => {
      const c = fakeClient({ session: true, row: active })
      renderApp()
      await screen.findByText('conteúdo do app')
      c.fetchRow.mockResolvedValue({ data: null, error: { message: 'network' } })
      c.emit('TOKEN_REFRESHED', sess)
      await waitFor(() => expect(c.fetchRow).toHaveBeenCalledTimes(2))
      expect(c.auth.signOut).not.toHaveBeenCalled()
      expect(screen.getByText('conteúdo do app')).toBeInTheDocument()
    })
  })

  describe('redefinição de senha (I4)', () => {
    async function openRecovery() {
      const c = fakeClient({ session: true, row: active })
      renderApp()
      await screen.findByText('conteúdo do app')
      c.emit('PASSWORD_RECOVERY', sess)
      expect(await screen.findByRole('heading', { name: 'Definir nova senha' })).toBeInTheDocument()
      return c
    }

    it('PASSWORD_RECOVERY mostra a tela, valida e chama updateUser; depois segue para o app', async () => {
      const c = await openRecovery()
      const nova = screen.getByLabelText('Nova senha')
      const conf = screen.getByLabelText('Confirmar nova senha')
      const salvar = screen.getByRole('button', { name: 'Salvar nova senha' })

      await userEvent.type(nova, 'curta')
      await userEvent.type(conf, 'curta')
      await userEvent.click(salvar)
      expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres.')).toBeInTheDocument()

      await userEvent.clear(nova)
      await userEvent.clear(conf)
      await userEvent.type(nova, 'a'.repeat(73))
      await userEvent.type(conf, 'a'.repeat(73))
      await userEvent.click(salvar)
      expect(await screen.findByText('A senha deve ter no máximo 72 caracteres.')).toBeInTheDocument()

      await userEvent.clear(nova)
      await userEvent.clear(conf)
      await userEvent.type(nova, 'senha-nova-1')
      await userEvent.type(conf, 'senha-nova-2')
      await userEvent.click(salvar)
      expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument()
      expect(c.auth.updateUser).not.toHaveBeenCalled()

      await userEvent.clear(conf)
      await userEvent.type(conf, 'senha-nova-1')
      await userEvent.click(salvar)
      expect(c.auth.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-1' })
      expect(await screen.findByText('Senha alterada com sucesso.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
      expect(await screen.findByText('conteúdo do app')).toBeInTheDocument()
    })

    it('erro do updateUser aparece em pt-BR e mantém a tela', async () => {
      const c = await openRecovery()
      c.auth.updateUser.mockResolvedValue({ data: {}, error: { message: 'New password should be different', code: 'same_password' } } as never)
      await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-nova-1')
      await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'senha-nova-1')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
      expect(await screen.findByText('A nova senha deve ser diferente da atual.')).toBeInTheDocument()
      c.auth.updateUser.mockRejectedValue(new Error('rede'))
      await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
      expect(await screen.findByText('Não foi possível alterar a senha. Tente novamente.')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Definir nova senha' })).toBeInTheDocument()
    })
  })

  describe('esqueci minha senha: falhas (I4)', () => {
    it('resetPasswordForEmail rejeitado mostra erro em pt-BR', async () => {
      const c = fakeClient({ session: false })
      c.auth.resetPasswordForEmail.mockRejectedValue(new Error('rede'))
      renderApp()
      await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
      await userEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
      expect(await screen.findByText('Não foi possível enviar o e-mail de redefinição. Tente novamente.')).toBeInTheDocument()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('sem cliente Supabase não informa sucesso', async () => {
      sbMock.getSupabase.mockReturnValue(null)
      renderApp()
      await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
      await userEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
      expect(await screen.findByText('Conexão não configurada.')).toBeInTheDocument()
      expect(screen.queryByText(/você receberá as instruções/)).toBeNull()
    })
  })
})
