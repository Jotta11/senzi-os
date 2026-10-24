import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { previewRoutes } from '@/preview/previewRoutes'
import type { PreviewRole } from '@/preview/previewRole'
import { AppPathContext } from '@/shell/appPath'
import { AcervoListPage } from './AcervoListPage'

const newSource = () => createMockSource({ latencyMs: 0, today: '2026-10-23' })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

/** Prévia completa (layout + "Ver como") com fonte sem latência. */
function renderPreview(path = '/preview/acervo', source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  const view = render(<RouterProvider router={router} />)
  return { router, source, ...view }
}

function Ficha() {
  return <p>Ficha {useParams().id}</p>
}

/** Só a tela, com perfil fixo (para espiar chamadas da fonte). */
function renderPage(role: PreviewRole, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [
      { path: '/preview/acervo', element: <AcervoListPage /> },
      { path: '/preview/acervo/:id', element: <Ficha /> },
    ],
    { initialEntries: ['/preview/acervo'] },
  )
  render(
    <QueryClientProvider client={newClient()}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole={role}>
          <AppPathContext.Provider value="/preview">
            <RouterProvider router={router} />
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
  return { router, source }
}

const gallery = () => screen.findByRole('list', { name: 'Peças do acervo' })
const cards = async () => within(await gallery()).getAllByRole('listitem')
const chip = (group: string, name: RegExp) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })

beforeEach(() => {
  localStorage.clear()
})

describe('Acervo — lista', () => {
  it('cabeçalho, 24 cards na primeira página e "Carregar mais" traz o resto', async () => {
    renderPreview()
    expect(await screen.findByRole('heading', { level: 1, name: 'Acervo' })).toBeInTheDocument()
    expect(await screen.findByText(/27 peças · 17 disponíveis/)).toBeInTheDocument()
    await waitFor(async () => expect(await cards()).toHaveLength(24))
    const verona = within(await gallery()).getByRole('link', { name: /Vestido Verona/ })
    expect(verona).toHaveAttribute('href', '/preview/acervo/sz-0107')
    expect(within(verona).getByText('SZ-0107')).toBeInTheDocument()
    expect(within(verona).getByText('Verde esmeralda · tam. 38')).toBeInTheDocument()
    expect(within(verona).getByText('R$ 890')).toBeInTheDocument()
    expect(within(verona).getByText('Livre')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await waitFor(async () => expect(await cards()).toHaveLength(27))
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('busca "verde" filtra depois do debounce e vai para a URL', async () => {
    const { router } = renderPreview()
    await waitFor(async () => expect(await cards()).toHaveLength(24))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar peça' }), 'verde')
    await waitFor(async () => expect(await cards()).toHaveLength(3))
    for (const c of await cards()) expect(c).toHaveTextContent(/Verde/)
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('verde')
    expect(screen.getByText('3 resultados')).toBeInTheDocument()
  })

  it('chips de estado mostram contagens; "Em ciclo operacional" filtra', async () => {
    const { router } = renderPreview()
    await waitFor(() => expect(chip('Estado', /^Disponível/)).toHaveTextContent('17'))
    expect(chip('Estado', /^Qualquer estado/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Estado', /^Qualquer estado/)).toHaveTextContent('27')
    await userEvent.click(chip('Estado', /^Em ciclo operacional/))
    await waitFor(async () => expect(await cards()).toHaveLength(4))
    expect(chip('Estado', /^Em ciclo operacional/)).toHaveAttribute('aria-pressed', 'true')
    expect(new URLSearchParams(router.state.location.search).get('st')).toBe('ciclo')
    const states = (await cards()).map((c) => c.textContent)
    for (const t of states) expect(t).toMatch(/Higien\.|Inspeç\.|Ajuste|Manut\./)
  })

  it('"Ver como Atendimento" esconde "investidos", colunas de custo e "Nova peça"', async () => {
    renderPreview()
    await userEvent.click(await screen.findByRole('button', { name: 'Lista' }))
    const table = await screen.findByRole('table', { name: 'Peças do acervo' })
    expect(within(table).getByRole('columnheader', { name: 'Receita' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Payback' })).toBeInTheDocument()
    expect(await screen.findByText(/investidos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova peça' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Atendimento' }))
    expect(screen.queryByText(/investidos/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nova peça' })).toBeNull()
    const t2 = screen.getByRole('table', { name: 'Peças do acervo' })
    expect(within(t2).queryByRole('columnheader', { name: 'Receita' })).toBeNull()
    expect(within(t2).queryByRole('columnheader', { name: 'Payback' })).toBeNull()
    for (const h of ['Código', 'Peça', 'Cor', 'Tam.', 'Estado', 'Locação']) {
      expect(within(t2).getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
  })

  it('Atendimento nunca pede custos à fonte; Administrador pede', async () => {
    const src = newSource()
    const econ = vi.spyOn(src, 'garmentEconomics')
    const inv = vi.spyOn(src, 'acervoInvestment')
    renderPage('atendimento', src)
    await userEvent.click(await screen.findByRole('button', { name: 'Lista' }))
    await screen.findByRole('table', { name: 'Peças do acervo' })
    await screen.findByText(/27 peças/)
    expect(econ).not.toHaveBeenCalled()
    expect(inv).not.toHaveBeenCalled()

    const src2 = newSource()
    const econ2 = vi.spyOn(src2, 'garmentEconomics')
    renderPage('admin', src2)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Lista' })).at(-1)!)
    await waitFor(() => expect(econ2).toHaveBeenCalled())
  })

  it('lista: linha com código, preço e payback; Galeria/Lista lembrado', async () => {
    const { unmount } = renderPreview()
    await userEvent.click(await screen.findByRole('button', { name: 'Lista' }))
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    const table = await screen.findByRole('table', { name: 'Peças do acervo' })
    const row = (await within(table).findByRole('link', { name: 'Vestido Verona' })).closest('tr')!
    expect(row).toHaveTextContent('SZ-0107')
    expect(row).toHaveTextContent('R$ 890')
    await waitFor(() => expect(row).toHaveTextContent(/\d,\d×/))
    unmount()
    renderPreview()
    expect(await screen.findByRole('table', { name: 'Peças do acervo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicar no card navega para a ficha', async () => {
    const { router } = renderPage('admin')
    await userEvent.click(within(await gallery()).getByRole('link', { name: /Vestido Verona/ }))
    expect(router.state.location.pathname).toBe('/preview/acervo/sz-0107')
    expect(await screen.findByText('Ficha sz-0107')).toBeInTheDocument()
  })

  it('filtros na URL sobrevivem a remontar a tela', async () => {
    const first = renderPreview()
    await userEvent.click(await screen.findByRole('button', { name: /^Vestido sereia/ }))
    await userEvent.click(chip('Tamanho', /^M$/))
    await waitFor(async () => expect(await cards()).toHaveLength(2))
    const { pathname, search } = first.router.state.location
    const params = new URLSearchParams(search)
    expect(params.get('cat')).toBe('vestido-sereia')
    expect(params.get('tam')).toBe('M')
    first.unmount()

    renderPreview(pathname + search)
    await waitFor(async () => expect(await cards()).toHaveLength(2))
    expect(chip('Categoria', /^Vestido sereia/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Tamanho', /^M$/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('?st=todos (ou valor desconhecido) cai no padrão: "Qualquer estado" marcado, sem baixadas', async () => {
    for (const st of ['todos', 'xyz']) {
      const { unmount } = renderPreview(`/preview/acervo?st=${st}`)
      await waitFor(async () => expect(await cards()).toHaveLength(24))
      expect(chip('Estado', /^Qualquer estado/)).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('27 resultados')).toBeInTheDocument()
      unmount()
    }
  })

  it('sem resultado mostra o vazio', async () => {
    renderPreview('/preview/acervo?q=zzzz')
    expect(await screen.findByText('Nenhuma peça encontrada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros ou cadastre uma nova peça.')).toBeInTheDocument()
  })

  it('chips de filtro substituem a entrada do histórico (não empilham)', async () => {
    const { router } = renderPreview('/preview/acervo')
    await userEvent.click(await within(await screen.findByRole('group', { name: 'Categoria' })).findByRole('button', { name: /^Saia/ }))
    expect(new URLSearchParams(router.state.location.search).get('cat')).not.toBeNull()
    expect(router.state.historyAction).toBe('REPLACE')
    await userEvent.click(chip('Tamanho', /^M$/))
    expect(new URLSearchParams(router.state.location.search).get('tam')).toBe('M')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('"Nova peça" põe ?nova=1 na URL (o formulário vem na Task 3)', async () => {
    const { router } = renderPreview('/preview/acervo?cat=saia')
    await userEvent.click(await screen.findByRole('button', { name: 'Nova peça' }))
    const p = new URLSearchParams(router.state.location.search)
    expect(p.get('nova')).toBe('1')
    expect(p.get('cat')).toBe('saia')
  })
})
