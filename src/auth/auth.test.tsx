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

function fakeClient(opts: { session?: boolean; row?: Row; perms?: string[]; signInError?: { message: string; code?: string } | null }) {
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: opts.session ? { user: { id: 'u1' } } : null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: opts.signInError ?? null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.row ?? null, error: null }) }) }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: opts.perms ?? [], error: null }),
  }
  sbMock.getSupabase.mockReturnValue(client)
  return client
}

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ element: <AuthGate />, children: [{ path: '/', element: <p>conteúdo do app</p> }] }],
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
})
