import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Perm } from '@/auth/permissions'
import { appRoutes } from '@/app/router'

const authMock = vi.hoisted(() => ({ signOut: vi.fn(), user: null as unknown, perms: [] as string[], loading: false }))
vi.mock('@/lib/env', () => ({ getEnv: () => ({ url: 'http://x', anonKey: 'k' }) }))
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ status: 'signed_in', user: authMock.user, signOut: authMock.signOut }),
}))
vi.mock('@/auth/usePermissions', () => ({
  usePermissions: () => ({
    can: (p: Perm) => authMock.perms.includes(p),
    perms: new Set(authMock.perms),
    isLoading: authMock.loading,
  }),
}))

const ATENDIMENTO = ['dashboard.view', 'agenda.view', 'reserva.view', 'acervo.view', 'cliente.view', 'operacao.view', 'financeiro.view']
const ADMIN = [...ATENDIMENTO, 'inteligencia.view', 'config.view']
const LABELS = ['Dashboard', 'Agenda', 'Reservas', 'Acervo', 'Clientes', 'Operação', 'Financeiro', 'Inteligência', 'Configurações']

function setup(role: 'admin' | 'atendimento', path = '/') {
  authMock.user = { id: 'u1', full_name: 'Ana Souza', email: 'a@b.com', role, is_active: true }
  authMock.perms = role === 'admin' ? ADMIN : ATENDIMENTO
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}
const navLinks = () => within(screen.getByRole('navigation', { name: /navegação principal/i })).getAllByRole('link')

beforeEach(() => {
  authMock.signOut.mockReset()
  authMock.loading = false
})

describe('shell', () => {
  it('atendimento não vê Inteligência nem Configurações, mas vê Financeiro e Operação', () => {
    setup('atendimento')
    const names = navLinks().map((l) => l.getAttribute('aria-label'))
    expect(names).not.toContain('Inteligência')
    expect(names).not.toContain('Configurações')
    expect(names).toContain('Financeiro')
    expect(names).toContain('Operação')
  })

  it('admin vê os 9 itens na ordem do protótipo', () => {
    setup('admin')
    expect(navLinks().map((l) => l.getAttribute('aria-label'))).toEqual(LABELS)
  })

  it('atendimento em /config vê Acesso restrito', () => {
    setup('atendimento', '/config')
    expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
  })

  it('enquanto carrega permissões não mostra Acesso restrito', () => {
    authMock.loading = true
    setup('atendimento', '/config')
    expect(screen.queryByText('Acesso restrito')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('item ativo tem aria-current=page e a rota mostra Em construção', () => {
    setup('admin', '/acervo')
    const ativos = navLinks().filter((l) => l.getAttribute('aria-current') === 'page')
    expect(ativos).toHaveLength(1)
    expect(ativos[0]).toHaveAttribute('aria-label', 'Acervo')
    expect(screen.getByText('Em construção')).toBeInTheDocument()
  })

  it('rodapé mostra o nome e Sair chama signOut', async () => {
    setup('admin')
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(authMock.signOut).toHaveBeenCalled()
  })
})
