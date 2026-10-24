import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { AppPathContext } from '@/shell/appPath'
import { ToastProvider } from '@/ui'
import { IntelPage } from './IntelPage'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })

function renderPreview(path: string, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}
const nav = () => within(screen.getByRole('navigation', { name: /navegação principal/i }))
/** Card pelo título (h3). */
const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('section') as HTMLElement

const SECTIONS = ['Como está o negócio?', 'O que devo comprar?', 'Quais peças não estão rendendo?', 'As provas viram locação?', 'Quem são as clientes?']
const TILES = ['Locações', 'Faturamento', 'Ticket médio', 'Clientes ativas', 'Taxa de recorrência', 'Peças paradas', 'Conversão de prova']
const CARDS = [
  'Receita por peça',
  'Cores mais procuradas',
  'Tamanhos mais procurados',
  'Ocupação por categoria',
  'Conversão de prova por peça',
  'Encanta e não fecha',
  'Pressão do acervo por tamanho',
  'Pressão por categoria',
  'Clientes que mais alugam',
  'Capital parado',
]

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Inteligência — estrutura', () => {
  it('título, subtítulo do período padrão (6 meses) e item ativo da sidebar', async () => {
    renderPreview('/preview/inteligencia')
    expect(await screen.findByRole('heading', { level: 1, name: 'Inteligência' })).toBeInTheDocument()
    expect(await screen.findByText(/locações · R\$ .* · ticket R\$ .* nos últimos 180 dias/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6 meses' })).toHaveAttribute('aria-pressed', 'true')
    expect(nav().getByRole('link', { name: 'Inteligência' })).toHaveAttribute('aria-current', 'page')
  })

  it('as 5 seções existem com os títulos de pergunta, na ordem, e a navegação por âncoras', async () => {
    renderPreview('/preview/inteligencia')
    const heads = await Promise.all(SECTIONS.map((s) => screen.findByRole('heading', { level: 2, name: s })))
    for (let i = 1; i < heads.length; i++) expect(heads[i - 1]!.compareDocumentPosition(heads[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const secNav = within(screen.getByRole('navigation', { name: 'Seções da Inteligência' }))
    for (const s of SECTIONS) expect(secNav.getByRole('link', { name: new RegExp(s.replace('?', '\\?')) })).toBeInTheDocument()
  })

  it('os 7 tiles e todos os cards do inventário estão presentes', async () => {
    renderPreview('/preview/inteligencia')
    const tiles = within(await screen.findByRole('list', { name: 'Indicadores do período' }))
    for (const t of TILES) expect(tiles.getByText(t)).toBeInTheDocument()
    expect(tiles.getByText('de 34 cadastradas')).toBeInTheDocument()
    expect(tiles.getByText('sem locação há 90+ dias')).toBeInTheDocument()
    for (const c of CARDS) expect(screen.getByRole('heading', { level: 3, name: c })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Peças que já se pagaram' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Quase nunca provadas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Leitura do período' })).toBeInTheDocument()
  })

  it('conteúdo dos cards: Milano em "Encanta e não fecha", Turim/Nápoles/Rimini "nunca alugada", nota da pressão', async () => {
    renderPreview('/preview/inteligencia')
    await screen.findByRole('heading', { level: 3, name: 'Encanta e não fecha' })
    const enc = within(card('Encanta e não fecha'))
    expect(enc.getByText('Vestido Milano')).toBeInTheDocument()
    expect(enc.getByText(/pediram ajuste/)).toBeInTheDocument()
    const cap = within(card('Capital parado'))
    for (const n of ['Conjunto Turim', 'Saia Nápoles', 'Vestido Rimini']) expect(cap.getByRole('link', { name: n })).toBeInTheDocument()
    expect(cap.getAllByText('nunca alugada')).toHaveLength(3)
    expect(within(card('Receita por peça')).getByText('A barra usa a cor real da peça.')).toBeInTheDocument()
    expect(within(card('Pressão do acervo por tamanho')).getByText(/Pressão = \(locações \+ metade das provas\) ÷ peças do segmento/)).toBeInTheDocument()
  })

  it('Leitura do período: insights com porquê; clicar no destino rola até o card de origem', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    renderPreview('/preview/inteligencia')
    const block = within(await waitFor(() => card('Leitura do período')))
    expect(block.getByText(/quase nunca são sequer provadas/)).toBeInTheDocument()
    expect(block.getByText(/Vestido Milano/)).toBeInTheDocument()
    expect(block.getByText(/Revisar caimento, preço, conservação ou posicionamento na arara\./)).toBeInTheDocument()
    await userEvent.click(block.getAllByRole('link', { name: /Ver em/ })[0]!)
    expect(scroll).toHaveBeenCalled()
  })
})

describe('Inteligência — filtros', () => {
  it('trocar o período muda o subtítulo e vai para a URL', async () => {
    const { router } = renderPreview('/preview/inteligencia')
    await screen.findByText(/ticket .* nos últimos 180 dias/)
    await userEvent.click(screen.getByRole('button', { name: '90 dias' }))
    expect(await screen.findByText(/ticket .* nos últimos 90 dias/)).toBeInTheDocument()
    expect(router.state.location.search).toContain('periodo=90')
    await userEvent.click(screen.getByRole('button', { name: '12 meses' }))
    expect(await screen.findByText(/ticket .* nos últimos 365 dias/)).toBeInTheDocument()
  })

  it('filtro de categoria restringe "Receita por peça"', async () => {
    renderPreview('/preview/inteligencia')
    await screen.findByRole('heading', { level: 3, name: 'Receita por peça' })
    await waitFor(() => expect(within(card('Receita por peça')).getAllByRole('link').length).toBeGreaterThan(1))
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), 'macacao')
    await waitFor(() => {
      const names = within(card('Receita por peça')).getAllByRole('link').map((l) => l.textContent)
      expect(names).toContain('Macacão Urbino')
      expect(names.every((n) => n!.startsWith('Macacão '))).toBe(true)
    })
    expect(screen.getByText(/· Macacão$/)).toBeInTheDocument()
  })
})

describe('Inteligência — permissões', () => {
  it('Atendimento não vê o item "Inteligência" na sidebar e a rota mostra acesso restrito', async () => {
    renderPreview('/preview/inteligencia?como=atendimento')
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'Inteligência' })).toBeNull()
    expect(screen.queryByText('Leitura do período')).toBeNull()
    expect(screen.queryByText('Capital parado')).toBeNull()
  })
})

describe('Inteligência — sem acervo.cost', () => {
  it('com inteligencia.view mas sem acervo.cost: sem insights de custo, colunas Custo/Receita nem "Peças que já se pagaram"', async () => {
    const router = createMemoryRouter([{ path: '/preview/inteligencia', element: <IntelPage /> }], { initialEntries: ['/preview/inteligencia'] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DataSourceProvider source={newSource()}>
          <PreviewPermissionsProvider initialRole="admin" revoke={['acervo.cost']}>
            <AppPathContext.Provider value="/preview">
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </AppPathContext.Provider>
          </PreviewPermissionsProvider>
        </DataSourceProvider>
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { level: 3, name: 'Capital parado' })
    const read = within(card('Leitura do período'))
    expect(read.queryByText(/sem locação nos últimos/)).toBeNull()
    expect(read.queryByText(/recuperou o investimento/)).toBeNull()
    expect(read.getByText(/quase nunca são sequer provadas/)).toBeInTheDocument()
    const cap = within(card('Capital parado'))
    expect(cap.queryByRole('columnheader', { name: 'Custo' })).toBeNull()
    expect(cap.queryByRole('columnheader', { name: 'Receita' })).toBeNull()
    expect(cap.getByRole('columnheader', { name: 'Parada há' })).toBeInTheDocument()
    expect(cap.queryByText(/de capital parado/)).toBeNull()
    expect(screen.queryByRole('heading', { level: 3, name: 'Peças que já se pagaram' })).toBeNull()
  })
})
