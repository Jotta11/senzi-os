import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { PERMISSIONS, type Perm } from '@/auth/permissions'
import { usePermissions } from '@/auth/usePermissions'
import { useAppHref } from '@/shell/appPath'
import { ATENDIMENTO_PERMS } from './previewRole'
import { PreviewPermissionsProvider } from './PreviewPermissions'
import { previewRoutes } from './previewRoutes'

function renderAt(path: string) {
  const router = createMemoryRouter([previewRoutes], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}
const nav = () => within(screen.getByRole('navigation', { name: /navegação principal/i }))

describe('PreviewLayout', () => {
  it('mostra a faixa da prévia e o seletor "Ver como"', () => {
    renderAt('/preview/acervo')
    expect(screen.getByText('Prévia visual · dados fictícios')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Ver como' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Administrador' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sidebar linka Dashboard/Acervo/Clientes para /preview/* e marca o item ativo', () => {
    renderAt('/preview/acervo/sz-0107')
    expect(nav().getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/preview')
    expect(nav().getByRole('link', { name: 'Acervo' })).toHaveAttribute('href', '/preview/acervo')
    expect(nav().getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/preview/clientes')
    expect(nav().getByRole('link', { name: 'Acervo' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('tem rotas reservadas para acervo, ficha, clientes e ficha da cliente', () => {
    for (const p of ['/preview/acervo', '/preview/acervo/sz-0107', '/preview/clientes', '/preview/clientes/cl-0001']) {
      const { unmount } = render(<RouterProvider router={createMemoryRouter([previewRoutes], { initialEntries: [p] })} />)
      expect(screen.getByRole('main')).toBeInTheDocument()
      unmount()
    }
  })

  it('demais itens mostram "Em construção" dentro da prévia', async () => {
    const router = renderAt('/preview')
    await userEvent.click(nav().getByRole('link', { name: 'Operação' }))
    expect(router.state.location.pathname).toBe('/preview/operacao')
    expect(screen.getByText('Em construção')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Operação' })).toBeInTheDocument()
    expect(nav().getByRole('link', { name: 'Operação' })).toHaveAttribute('aria-current', 'page')
  })

  it('?como=atendimento abre já como Atendimento', () => {
    renderAt('/preview?como=atendimento')
    expect(screen.getByRole('button', { name: 'Atendimento' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Ana Lima')).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'Configurações' })).toBeNull()
  })

  it('"Ver como Atendimento" troca o perfil e esconde itens sem permissão', async () => {
    renderAt('/preview')
    expect(nav().getByRole('link', { name: 'Configurações' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Atendimento' }))
    expect(screen.getByRole('button', { name: 'Atendimento' })).toHaveAttribute('aria-pressed', 'true')
    expect(nav().queryByRole('link', { name: 'Configurações' })).toBeNull()
    expect(nav().queryByRole('link', { name: 'Inteligência' })).toBeNull()
    expect(nav().getByRole('link', { name: 'Acervo' })).toBeInTheDocument()
    expect(screen.getByText('Ana Lima')).toBeInTheDocument()
  })
})

function Probe({ perm }: { perm: Perm }) {
  const { can, perms } = usePermissions()
  const href = useAppHref()
  return (
    <p>
      {perm}:{String(can(perm))} · {perms.size} · {href('/acervo/x')}
    </p>
  )
}

describe('PreviewPermissions', () => {
  it('usePermissions() lê o provider da prévia (sem AuthProvider)', () => {
    const total = Object.keys(PERMISSIONS).length
    const { unmount } = render(
      <PreviewPermissionsProvider>
        <Probe perm="acervo.cost" />
      </PreviewPermissionsProvider>,
    )
    expect(screen.getByText(`acervo.cost:true · ${total} · /acervo/x`)).toBeInTheDocument()
    unmount()
    render(
      <PreviewPermissionsProvider initialRole="atendimento">
        <Probe perm="acervo.cost" />
      </PreviewPermissionsProvider>,
    )
    expect(screen.getByText(/acervo\.cost:false/)).toBeInTheDocument()
  })

  it('revoke tira permissões específicas (para testes das telas)', () => {
    render(
      <PreviewPermissionsProvider revoke={['financeiro.view']}>
        <Probe perm="financeiro.view" />
      </PreviewPermissionsProvider>,
    )
    expect(screen.getByText(/financeiro\.view:false/)).toBeInTheDocument()
  })

  it('o perfil atendimento espelha a migration de acesso', () => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261023000100_acesso.sql'), 'utf8')
    const fromSql = [...sql.matchAll(/\('atendimento',\s*'([a-z.]+)'\)/g)].map((m) => m[1]).sort()
    expect(fromSql.length).toBeGreaterThan(10)
    expect([...ATENDIMENTO_PERMS].sort()).toEqual(fromSql)
    for (const p of ['acervo.create', 'acervo.cost', 'config.view', 'inteligencia.view']) expect(ATENDIMENTO_PERMS).not.toContain(p)
  })
})
