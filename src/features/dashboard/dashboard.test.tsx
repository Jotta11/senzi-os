import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
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
const ATENDIMENTO = '?como=atendimento'
const heading = (name: string) => screen.findByRole('heading', { name })
const before = (a: HTMLElement, b: HTMLElement) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Dashboard — estrutura', () => {
  it('cabeçalho com data por extenso e as três ações; Dashboard é o item ativo da sidebar', async () => {
    renderPreview('/preview')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoje' })).toBeInTheDocument()
    expect(screen.getByText('Sábado, 24/10/2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Agendar prova/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nova cliente/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nova reserva/ })).toHaveAttribute('href', '/preview/reservas?nova=1')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('ordem das seções: Alertas → tiles → Agenda de hoje → Faturamento | Ciclo operacional', async () => {
    renderPreview('/preview')
    const alertas = await heading('Alertas')
    const tiles = await screen.findByRole('list', { name: 'Resumo do dia' })
    const agenda = await heading('Agenda de hoje')
    const fat = await heading('Faturamento recebido')
    const ciclo = await heading('Ciclo operacional')
    before(alertas, tiles)
    before(tiles, agenda)
    before(agenda, fat)
    before(fat, ciclo)
  })

  it('tiles com números do dia e destinos', async () => {
    renderPreview('/preview')
    const tiles = within(await screen.findByRole('list', { name: 'Resumo do dia' }))
    expect(tiles.getByRole('link', { name: /Retiradas hoje/ })).toHaveAttribute('href', `/preview/agenda?dia=${TODAY}`)
    expect(tiles.getByRole('link', { name: /Atrasadas.*ação imediata/ })).toHaveAttribute('href', '/preview/reservas?f=rua')
    expect(tiles.getByRole('link', { name: /Peças disponíveis.*de 27 no acervo/ })).toHaveAttribute('href', '/preview/acervo?st=disponivel')
    expect(tiles.getByRole('link', { name: /Retiradas hoje.*Larissa/ })).toBeInTheDocument()
  })

  it('ciclo operacional: nota de inspeção, contagens e taxa de ocupação', async () => {
    renderPreview('/preview')
    const card = within((await heading('Ciclo operacional')).closest('section')!)
    expect(card.getByText(/2 peça\(s\) aguardando inspeção\./)).toBeInTheDocument()
    expect(card.getByText('Comprometidas com reservas futuras')).toBeInTheDocument()
    expect(card.getByText('Fora da loja agora')).toBeInTheDocument()
    expect(card.getByText(/^\d+%$/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: /Ver operação/ })).toHaveAttribute('href', '/preview/operacao')
  })
})

describe('Dashboard — alertas', () => {
  it('mostra 6 boxes com rótulo de severidade; "Ver todos (N)" expande; crítico primeiro', async () => {
    const user = userEvent.setup()
    renderPreview('/preview')
    const section = (await heading('Alertas')).closest('section')!
    const boxes = () => within(section).getAllByRole('link')
    await waitFor(() => expect(boxes()).toHaveLength(6))
    expect(boxes()[0]).toHaveTextContent('Crítico')
    expect(within(section).getByText(/críticos?$/)).toBeInTheDocument()
    const more = within(section).getByRole('button', { name: /Ver todos \((\d+)\)/ })
    const n = Number(/\((\d+)\)/.exec(more.textContent!)![1])
    expect(n).toBeGreaterThan(6)
    await user.click(more)
    expect(boxes()).toHaveLength(n)
    expect(within(section).getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicar num alerta navega para a rota dele', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview')
    const section = (await heading('Alertas')).closest('section')!
    const link = await within(section).findByRole('link', { name: /Devolução atrasada — Vitória/ })
    await user.click(link)
    expect(router.state.location.pathname).toMatch(/^\/preview\/reservas\/.+/)
  })
})

describe('Dashboard — agenda de hoje e mini calendário', () => {
  it('lista os 6 compromissos de hoje com Retirar, Devolver e Abrir prova', async () => {
    const user = userEvent.setup()
    renderPreview('/preview')
    const card = within((await heading('Agenda de hoje')).closest('section')!)
    expect(await card.findByText('6 compromissos')).toBeInTheDocument()
    expect(card.getByRole('link', { name: /Ver agenda/ })).toHaveAttribute('href', '/preview/agenda')
    expect(card.getByRole('link', { name: 'Abrir prova' })).toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Retirar' }))
    expect(await screen.findByRole('dialog', { name: /Registrar retirada/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(card.getByRole('button', { name: 'Devolver' }))
    expect(await screen.findByRole('dialog', { name: /Registrar devolução/ })).toBeInTheDocument()
  })

  it('clicar um dia do mini calendário abre a Agenda naquele dia', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview')
    const grid = await screen.findByRole('grid', { name: 'Calendário de Outubro de 2026' })
    await user.click(within(grid).getByRole('link', { name: /^28\/10\/2026/ }))
    expect(router.state.location.pathname).toBe('/preview/agenda')
    expect(router.state.location.search).toBe('?dia=2026-10-28')
    expect(await screen.findByText('27/10 – 30/10/2026')).toBeInTheDocument()
  })

  it('marca hoje e os dias com compromisso; as setas trocam o mês', async () => {
    const user = userEvent.setup()
    renderPreview('/preview')
    const grid = await screen.findByRole('grid', { name: 'Calendário de Outubro de 2026' })
    expect(await within(grid).findByRole('link', { name: '24/10/2026, com compromissos' })).toHaveClass('today')
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByRole('grid', { name: 'Calendário de Outubro de 2026' })).toBeInTheDocument()
  })
})

describe('Dashboard — faturamento e perfis', () => {
  it('Administrador vê faturamento com ticket médio, locações e troca de período', async () => {
    const user = userEvent.setup()
    renderPreview('/preview')
    const card = within((await heading('Faturamento recebido')).closest('section')!)
    expect(card.getByText('Ticket médio')).toBeInTheDocument()
    expect(card.getByText('Locações')).toBeInTheDocument()
    expect(card.getByText('Este mês', { selector: '.eyebrow' })).toBeInTheDocument()
    expect(card.getByRole('figure', { name: 'Faturamento recebido por mês' })).toBeInTheDocument()
    expect(card.getByRole('link', { name: /Ver financeiro completo/ })).toHaveAttribute('href', '/preview/financeiro')
    await user.click(card.getByRole('button', { name: 'Últimos 7 dias' }))
    expect(await card.findByText('Últimos 7 dias', { selector: '.eyebrow' })).toBeInTheDocument()
  })

  it('Atendimento vê "Provas de hoje e amanhã" no lugar do Faturamento, sem ticket médio nem valores', async () => {
    renderPreview(`/preview${ATENDIMENTO}`)
    const card = within((await heading('Provas de hoje e amanhã')).closest('section')!)
    expect(await card.findByText(/peça\(s\) separada\(s\)/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/preview/provas')
    expect(screen.queryByText('Faturamento recebido')).toBeNull()
    expect(screen.queryByText('Ticket médio')).toBeNull()
    expect(screen.queryByRole('figure', { name: 'Faturamento recebido por mês' })).toBeNull()
    expect(screen.queryByText(/R\$ ?[\d.]+ mil|\bmil\b/)).toBeNull()
    expect(screen.queryByRole('link', { name: /Ver financeiro completo/ })).toBeNull()
  })

  it('Atendimento continua vendo o alerta de pagamento pendente (tem financeiro.view)', async () => {
    const user = userEvent.setup()
    renderPreview(`/preview${ATENDIMENTO}`)
    const section = (await heading('Alertas')).closest('section')!
    await user.click(await within(section).findByRole('button', { name: /Ver todos/ }))
    expect(within(section).getAllByText(/Pagamento pendente —/).length).toBeGreaterThan(0)
  })

  it('alerta sem permissão no destino some: sem financeiro.view não há pagamento pendente', async () => {
    const { visibleAlerts } = await import('./alertAccess')
    const source = newSource()
    const s = await source.dashboardSummary('30')
    const without = visibleAlerts(s.alerts, (p) => p !== 'financeiro.view')
    expect(s.alerts.some((a) => a.kind === 'pagamento_pendente')).toBe(true)
    expect(without.some((a) => a.kind === 'pagamento_pendente')).toBe(false)
    expect(visibleAlerts(s.alerts, (p) => p !== 'operacao.view').some((a) => a.route === '/operacao')).toBe(false)
  })
})
