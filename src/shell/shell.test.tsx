import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Perm } from '@/auth/permissions'
import { appRoutes, LIVE } from '@/app/router'
import { NAV } from '@/shell/nav'

const authMock = vi.hoisted(() => ({ signOut: vi.fn(), refetch: vi.fn(), user: null as unknown, perms: [] as string[], loading: false, error: false }))
vi.mock('@/lib/env', () => ({ getEnv: () => ({ url: 'http://x', anonKey: 'k' }) }))
// As telas reais (Dashboard em `/`, Inteligência…) leem dados: aqui a fonte do Supabase dá lugar à fonte em memória.
vi.mock('@/data/supabaseSource', async () => {
  const { createMockSource } = await import('@/data/mockSource')
  return { createSupabaseSource: () => createMockSource({ latencyMs: 0 }) }
})
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ status: 'signed_in', user: authMock.user, signOut: authMock.signOut }),
}))
vi.mock('@/auth/usePermissions', () => ({
  usePermissions: () => ({
    can: (p: Perm) => authMock.perms.includes(p),
    perms: new Set(authMock.perms),
    isLoading: authMock.loading,
    isError: authMock.error,
    refetch: authMock.refetch,
  }),
}))

const ATENDIMENTO = ['dashboard.view', 'agenda.view', 'reserva.view', 'acervo.view', 'cliente.view', 'operacao.view', 'financeiro.view']
const ADMIN = [...ATENDIMENTO, 'inteligencia.view', 'config.view']
const LABELS = ['Dashboard', 'Agenda', 'Reservas', 'Acervo', 'Clientes', 'Operação', 'Financeiro', 'Inteligência', 'Configurações']

function setup(role: 'admin' | 'atendimento', path = '/') {
  authMock.user = { id: 'u1', full_name: 'Ana Souza', email: 'a@b.com', role, is_active: true }
  authMock.perms = role === 'admin' ? ADMIN : ATENDIMENTO
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
const navLinks = () => within(screen.getByRole('navigation', { name: /navegação principal/i })).getAllByRole('link')

beforeEach(() => {
  authMock.signOut.mockReset()
  authMock.refetch.mockReset()
  authMock.loading = false
  authMock.error = false
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
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Carregando…')
  })

  it('falha ao carregar permissões mostra erro com Tentar novamente, não Acesso restrito', async () => {
    authMock.error = true
    setup('atendimento', '/config')
    expect(screen.queryByText('Acesso restrito')).toBeNull()
    expect(screen.getByText('Não foi possível carregar suas permissões.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(authMock.refetch).toHaveBeenCalled()
  })

  it('item ativo tem aria-current=page e a rota mostra a tela real', async () => {
    setup('admin', '/inteligencia')
    const ativos = navLinks().filter((l) => l.getAttribute('aria-current') === 'page')
    expect(ativos).toHaveLength(1)
    expect(ativos[0]).toHaveAttribute('aria-label', 'Inteligência')
    expect(await screen.findByRole('heading', { level: 1, name: 'Inteligência' })).toBeInTheDocument()
    expect(screen.queryByText('Em construção')).toBeNull()
  })

  // Desde a área 6 do Plano 2B todo item do menu tem tela no banco: nenhuma rota real cai em "Em construção"
  // (o componente segue em uso e testado na prévia, `preview.test.tsx`).
  it('todo item do menu (e submenu) tem tela real', () => {
    const paths = NAV.flatMap((n) => [n.path, ...(n.children ?? []).map((c) => c.path)])
    const routed = ['/financeiro/receber', '/financeiro/pagar', '/financeiro/categorias']
    expect(paths.filter((p) => !(p in LIVE) && !routed.includes(p))).toEqual([])
  })

  it('rodapé mostra o nome e Sair chama signOut', async () => {
    setup('admin')
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(authMock.signOut).toHaveBeenCalled()
  })

  it('sidebar mostra a logo Senzi Club', () => {
    setup('admin')
    expect(screen.getAllByRole('img', { name: 'Senzi Club' }).length).toBeGreaterThan(0)
  })

  // Plano 2B, área 7: a prévia (fonte em memória + fixture) e as telas chegam sob demanda, fora do pedaço principal.
  it('a prévia abre pelas rotas do app, carregada sob demanda', async () => {
    setup('admin', '/preview/acervo')
    expect(await screen.findByRole('group', { name: 'Ver como' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Acervo' })).toBeInTheDocument()
  })

  it('o roteador do app não importa a prévia nem as telas de forma estática', () => {
    const src = readFileSync(resolve(__dirname, '../app/router.tsx'), 'utf8')
    const statics = [...src.matchAll(/^import [^;]*? from '([^']+)'/gms)].map((m) => m[1])
    expect(statics.filter((m) => m!.startsWith('@/preview/') && m !== '@/preview/paths')).toEqual([])
    expect(statics.filter((m) => m!.startsWith('@/features/'))).toEqual([])
  })

  it('rota desconhecida mostra Página não encontrada com link para /', () => {
    setup('admin', '/nada-aqui')
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/')
  })

  it('item ativo no CSS: fundo Beige sólido, texto e ícone Cranberry, sem declarações duplicadas', () => {
    const css = readFileSync(resolve(__dirname, 'shell.css'), 'utf8')
    const rule = (sel: string) => {
      const m = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((x) => x[1]!.trim() === sel)
      expect(m).toHaveLength(1)
      return m[0]![2]!.split(';').map((d) => d.trim()).filter(Boolean)
    }
    const ativo = rule('.sb-nav a[aria-current="page"]')
    expect(ativo.filter((d) => d.startsWith('color:'))).toEqual(['color: var(--cranberry)'])
    expect(ativo.filter((d) => d.startsWith('background:'))).toEqual(['background: var(--beige)'])
    expect(rule('.sb-nav a[aria-current="page"] svg')).toEqual(['color: var(--cranberry)'])
  })
})
