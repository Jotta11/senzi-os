import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import type { Perm } from '@/auth/permissions'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppPathContext } from '@/shell/appPath'
import { ClientesListPage } from './ClientesListPage'

const newSource = () => createMockSource({ latencyMs: 0, today: '2026-10-23' })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderPreview(path = '/preview/clientes', source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}

function Ficha() {
  return <p>Ficha {useParams().id}</p>
}

function renderPage({ revoke, source = newSource() }: { revoke?: Perm[]; source?: DataSource } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/preview/clientes', element: <ClientesListPage /> },
      { path: '/preview/clientes/:id', element: <Ficha /> },
    ],
    { initialEntries: ['/preview/clientes'] },
  )
  render(
    <QueryClientProvider client={newClient()}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole="admin" revoke={revoke}>
          <AppPathContext.Provider value="/preview">
            <RouterProvider router={router} />
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
  return { router, source }
}

const table = () => screen.findByRole('table', { name: 'Clientes' })
const bodyRows = async () => within(await table()).getAllByRole('row').slice(1)
const firstName = async () => (await bodyRows())[0]!.querySelector('.cl-name')?.textContent

describe('Clientes — lista', () => {
  it('cabeçalho "{n} cadastradas", 30 linhas e "Carregar mais" traz o resto', async () => {
    renderPreview()
    expect(await screen.findByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument()
    expect(await screen.findByText('34 cadastradas')).toBeInTheDocument()
    await waitFor(async () => expect(await bodyRows()).toHaveLength(30))
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(34))
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('linha: iniciais, nome, VIP, código, telefone mascarado, Instagram, cidade e dinheiro', async () => {
    renderPreview()
    const t = await table()
    const row = (await within(t).findByRole('link', { name: 'Mariana Fontes Ribeiro' })).closest('tr')!
    expect(row).toHaveTextContent('MR')
    expect(row).toHaveTextContent('VIP')
    expect(row).toHaveTextContent('CL-0001')
    expect(row).toHaveTextContent('(63) 99612-4478')
    expect(row).toHaveTextContent('@marifontes')
    expect(row).toHaveTextContent('Palmas')
    expect(row).toHaveTextContent(/R\$ \d/)
    for (const h of ['Cliente', 'Contato', 'Cidade', 'Locações', 'Total gasto', 'Ticket', 'Próximo evento']) {
      expect(within(t).getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
  })

  it('busca por nome sem acento, telefone com máscara e CPF reflete nos resultados e na URL', async () => {
    const { router } = renderPreview()
    await waitFor(async () => expect(await bodyRows()).toHaveLength(30))
    const box = screen.getByRole('searchbox', { name: 'Buscar cliente' })
    expect(box).toHaveAttribute('placeholder', 'Nome, telefone, Instagram, CPF ou código…')

    await userEvent.type(box, 'veronica')
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1))
    expect(await firstName()).toBe('Verônica Pontes')
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('veronica')
    expect(screen.getByText('1 resultado')).toBeInTheDocument()

    for (const q of ['(63) 99612-4478', '529.982.247-25']) {
      await userEvent.clear(box)
      await userEvent.type(box, q)
      await waitFor(async () => expect(await firstName()).toBe('Mariana Fontes Ribeiro'))
      expect(await bodyRows()).toHaveLength(1)
    }
  })

  it('sem resultado mostra o vazio', async () => {
    renderPreview('/preview/clientes?q=zzzz')
    expect(await screen.findByText('Nenhuma cliente encontrada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste a busca ou cadastre uma nova cliente.')).toBeInTheDocument()
  })

  it('ordenação A–Z / Maior gasto / Mais locações / Mais recentes reflete na ordem e na URL', async () => {
    const { router, source } = renderPreview()
    const seg = await screen.findByRole('group', { name: 'Ordenar por' })
    expect(within(seg).getAllByRole('button').map((b) => b.textContent)).toEqual(['A–Z', 'Maior gasto', 'Mais locações', 'Mais recentes'])
    expect(within(seg).getByRole('button', { name: 'A–Z' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect(await firstName()).toBe('Adriana Sales'))

    for (const [label, sort] of [
      ['Maior gasto', 'gasto'],
      ['Mais locações', 'locacoes'],
      ['Mais recentes', 'recentes'],
    ] as const) {
      const expected = (await source.searchCustomers('', sort, { limit: 1, offset: 0 })).items[0]!.fullName
      await userEvent.click(within(seg).getByRole('button', { name: label }))
      expect(within(seg).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      expect(new URLSearchParams(router.state.location.search).get('ordem')).toBe(sort)
      await waitFor(async () => expect(await firstName()).toBe(expected))
    }
  })

  it('a fonte recebe busca e ordenação', async () => {
    const src = newSource()
    const spy = vi.spyOn(src, 'searchCustomers')
    renderPage({ source: src })
    await table()
    await userEvent.click(screen.getByRole('button', { name: 'Maior gasto' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('', 'gasto', { limit: 30, offset: 0 }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'palmas')
    await waitFor(() => expect(spy).toHaveBeenCalledWith('palmas', 'gasto', { limit: 30, offset: 0 }))
  })

  it('sem financeiro.view as colunas de dinheiro somem', async () => {
    renderPage({ revoke: ['financeiro.view'] })
    const t = await table()
    await within(t).findByRole('link', { name: 'Mariana Fontes Ribeiro' })
    expect(within(t).queryByRole('columnheader', { name: 'Total gasto' })).toBeNull()
    expect(within(t).queryByRole('columnheader', { name: 'Ticket' })).toBeNull()
    expect(t).not.toHaveTextContent(/R\$/)
    for (const h of ['Cliente', 'Contato', 'Cidade', 'Locações', 'Próximo evento']) {
      expect(within(t).getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
  })

  it('clicar na linha (ou no nome) navega para a ficha', async () => {
    const { router } = renderPage()
    const link = await within(await table()).findByRole('link', { name: 'Mariana Fontes Ribeiro' })
    expect(link).toHaveAttribute('href', '/preview/clientes/cl-0001')
    await userEvent.click(link.closest('tr')!.querySelector('td:nth-child(3)')!)
    expect(router.state.location.pathname).toBe('/preview/clientes/cl-0001')
    expect(await screen.findByText('Ficha cl-0001')).toBeInTheDocument()
  })

  it('"Nova cliente" só com cliente.create; abre o formulário via ?nova=1 e fechar tira o parâmetro', async () => {
    const { router } = renderPreview('/preview/clientes?ordem=gasto')
    await userEvent.click(await screen.findByRole('button', { name: 'Nova cliente' }))
    const p = new URLSearchParams(router.state.location.search)
    expect(p.get('nova')).toBe('1')
    expect(p.get('ordem')).toBe('gasto')
    const dlg = await screen.findByRole('dialog', { name: 'Nova cliente' })
    expect(within(dlg).getByText('Nome, telefone, nascimento e CPF são obrigatórios.')).toBeInTheDocument()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }))
    expect(new URLSearchParams(router.state.location.search).get('nova')).toBeNull()
  })

  it('sem cliente.create não há botão nem formulário', async () => {
    const src = newSource()
    const router = createMemoryRouter([{ path: '/preview/clientes', element: <ClientesListPage /> }], { initialEntries: ['/preview/clientes?nova=1'] })
    render(
      <QueryClientProvider client={newClient()}>
        <DataSourceProvider source={src}>
          <PreviewPermissionsProvider revoke={['cliente.create']}>
            <AppPathContext.Provider value="/preview">
              <RouterProvider router={router} />
            </AppPathContext.Provider>
          </PreviewPermissionsProvider>
        </DataSourceProvider>
      </QueryClientProvider>,
    )
    await table()
    expect(screen.queryByRole('button', { name: 'Nova cliente' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
