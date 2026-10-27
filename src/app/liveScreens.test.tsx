import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { createSupabaseSource } from '@/data/supabaseSource'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CategoriesPage } from '@/features/financeiro/CategoriesPage'
import { FinanceOverviewPage } from '@/features/financeiro/FinanceOverviewPage'
import { PayablesPage } from '@/features/financeiro/PayablesPage'
import { ReceivablesPage } from '@/features/financeiro/ReceivablesPage'
import { IntelPage } from '@/features/inteligencia/IntelPage'
import { OperacaoPage } from '@/features/operacao/OperacaoPage'
import { FittingPage } from '@/features/provas/FittingPage'
import { ProvasListPage } from '@/features/provas/ProvasListPage'
import { ContractPrint } from '@/features/reservas/print/ContractPrint'
import { OsPrint } from '@/features/reservas/print/OsPrint'
import { ReservasListPage } from '@/features/reservas/ReservasListPage'
import { ReservationPage } from '@/features/reservas/ReservationPage'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { RequirePerm } from '@/shell/RequirePerm'
import { ToastProvider } from '@/ui'

/**
 * Telas ligadas no app real (Agenda, Provas, Reservas, Financeiro, Operação e as abas de reservas e manutenções das fichas): renderizadas sobre a fonte em memória, registram cada método da
 * `DataSource` que chamam. Todos precisam existir na fonte do Supabase (desde a área 6 o TypeScript já garante isso em
 * `createSupabaseSource`; o teste continua como rede de segurança e documenta o que cada tela lê).
 */
const TODAY = '2026-10-24'

function recording(src: DataSource) {
  const called = new Set<string>()
  const proxy = new Proxy(src, {
    get(target, key) {
      const v = target[key as keyof DataSource]
      if (typeof v === 'function') called.add(String(key))
      return v
    },
  })
  return { proxy, called }
}

function renderAt(path: string, element: ReactNode, source: DataSource, role: 'admin' | 'atendimento' = 'admin') {
  const router = createMemoryRouter(
    [
      { path: '/agenda', element },
      { path: '/provas', element },
      { path: '/provas/:id', element },
      { path: '/reservas', element },
      { path: '/reservas/:id', element },
      { path: '/reservas/:id/contrato', element },
      { path: '/reservas/:id/os', element },
      { path: '/clientes/:id', element },
      { path: '/acervo/:id', element },
      { path: '/financeiro', element },
      { path: '/financeiro/receber', element },
      { path: '/financeiro/pagar', element },
      { path: '/financeiro/categorias', element },
      { path: '/operacao', element },
      { path: '/', element },
      { path: '/inteligencia', element },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole={role}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('telas de Agenda e Provas no app real', () => {
  it('só chamam métodos que a fonte do Supabase já tem', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)
    const { items } = await mock.listFittings('todas', { limit: 200, offset: 0 })
    const conv = items.find((f) => f.state === 'convertida')!
    const open = items.find((f) => f.state === 'em_curso')!

    const screens: [string, ReactNode, RegExp][] = [
      ['/agenda', <AgendaPage key="s" />, /Agenda/],
      ['/agenda?vista=dia', <AgendaPage key="d" />, /Agenda/],
      ['/agenda?vista=mes', <AgendaPage key="m" />, /Agenda/],
      ['/provas', <ProvasListPage key="l" />, /Provas/],
      [`/provas/${conv.id}`, <FittingPage key="c" />, new RegExp(conv.code)],
      [`/provas/${open.id}`, <FittingPage key="o" />, new RegExp(open.code)],
    ]
    for (const [path, el, title] of screens) {
      renderAt(path, el, proxy)
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)
      cleanup()
    }
    expect(called).toContain('agendaRange')
    expect(called).toContain('getFitting')
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })
})

describe('telas de Reservas no app real', () => {
  it('lista, ficha (todas as abas, vários estados), contrato, OS e abas Reservas da cliente e da peça só chamam métodos que a fonte do Supabase tem', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)
    const { items } = await mock.listReservations('todas', { limit: 1000, offset: 0 })
    const pick = (state: string) => items.find((r) => r.state === state)!
    const draft = pick('rascunho')
    const conf = pick('confirmada')
    const out = items.find((r) => r.state === 'em_uso' || r.state === 'aguardando_devolucao')!
    const closed = items.find((r) => r.state === 'finalizada' || r.state === 'cancelada')!
    const full = (await mock.getReservation(conf.id))!

    const screens: [string, ReactNode, RegExp][] = [
      ['/reservas', <ReservasListPage key="l" />, /Reservas/],
      ['/reservas?nova=1', <ReservasListPage key="n" />, /Reservas/],
      ...[draft, conf, out, closed].flatMap((r): [string, ReactNode, RegExp][] =>
        ['', '?aba=pagamentos', '?aba=contrato', '?aba=historico'].map((q) => [`/reservas/${r.id}${q}`, <ReservationPage key={r.id + q} />, new RegExp(r.code)]),
      ),
      [`/reservas/${conf.id}/contrato`, <ContractPrint key="c" />, /CONTRATO DE LOCAÇÃO/],
      [`/reservas/${out.id}/os`, <OsPrint key="o" />, new RegExp(out.code)],
      [`/clientes/${full.customerId}?aba=reservas`, <CustomerPage key="cl" />, new RegExp(full.customer.fullName)],
      [`/acervo/${full.items[0]!.garmentId}?aba=reservas`, <GarmentPage key="g" />, new RegExp(full.garments[0]!.code)],
    ]
    for (const [path, el, title] of screens) {
      renderAt(path, el, proxy)
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)
      cleanup()
    }
    for (const m of ['listReservations', 'reservationSummary', 'getReservation', 'reservationsOfCustomer', 'reservationsOfGarment']) expect(called).toContain(m)
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })
})

describe('telas do Financeiro no app real', () => {
  it('visão geral, contas a receber, contas a pagar e categorias só chamam métodos que a fonte do Supabase tem', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)

    const screens: [string, ReactNode, RegExp][] = [
      ['/financeiro', <FinanceOverviewPage key="o" />, /Faturamento recebido por mês/],
      ['/financeiro?periodo=365', <FinanceOverviewPage key="o2" />, /Faturamento recebido por mês/],
      ['/financeiro/receber', <ReceivablesPage key="r" />, /Contas a Receber/],
      ['/financeiro/pagar', <PayablesPage key="p" />, /Contas a Pagar/],
      ['/financeiro/categorias', <CategoriesPage key="c" />, /Categorias/],
    ]
    for (const [path, el, title] of screens) {
      renderAt(path, el, proxy)
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)
      cleanup()
    }
    for (const m of ['financeOverview', 'listReceivables', 'listPayables', 'listFinCategories']) expect(called).toContain(m)
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })
})

describe('telas da Operação no app real', () => {
  it('fila, modais de inspeção, conclusão e liberação e a aba Manutenções da peça só chamam métodos que a fonte do Supabase tem', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)
    const q = await mock.operacaoQueue()

    // Fila + modal de inspeção (checklist, reserva da devolução, fornecedores).
    renderAt('/operacao', <OperacaoPage />, proxy)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Aguardando inspeção' })).getAllByRole('button', { name: 'Inspecionar' })[0]!)
    expect(await screen.findByRole('dialog', { name: 'Inspeção de devolução' })).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: 'Zíper e fechos' })).toBeInTheDocument()
    cleanup()
    // Conclusão de ordem.
    renderAt('/operacao', <OperacaoPage />, proxy)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Em higienização' })).getAllByRole('button', { name: 'Concluir' })[0]!)
    expect(await screen.findByRole('dialog', { name: 'Concluir higienização' })).toBeInTheDocument()
    cleanup()
    // Liberação de peça bloqueada.
    renderAt('/operacao', <OperacaoPage />, proxy)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Bloqueadas' })).getAllByRole('button', { name: 'Devolver ao acervo' })[0]!)
    expect(await screen.findByRole('dialog', { name: 'Liberar peça para o acervo' })).toBeInTheDocument()
    cleanup()
    // Aba Manutenções da ficha de uma peça em manutenção.
    const g = q.manutencao[0]!.garment
    renderAt(`/acervo/${g.id}?aba=manutencoes`, <GarmentPage key="m" />, proxy)
    expect(await screen.findByRole('table', { name: 'Ordens de serviço' })).toBeInTheDocument()
    cleanup()

    for (const m of ['operacaoQueue', 'checklist', 'inspectionTarget', 'suppliers', 'maintenancesOf']) expect(called).toContain(m)
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })
})

describe('Dashboard e Inteligência no app real', () => {
  it('admin: painel (com faturamento, nos 3 períodos) e inteligência (filtros de período e categoria) só chamam métodos que a fonte do Supabase tem', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)

    renderAt('/', <DashboardPage />, proxy)
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoje' })).toBeInTheDocument()
    for (const label of ['Últimos 7 dias', '90 dias']) {
      fireEvent.click(await screen.findByRole('button', { name: label }))
      expect(await screen.findByRole('button', { name: label, pressed: true })).toBeInTheDocument()
    }
    cleanup()
    const screens: [string, ReactNode, RegExp][] = [
      ['/inteligencia', <IntelPage key="i" />, /Leitura do período/],
      ['/inteligencia?periodo=365&cat=vestido-longo', <IntelPage key="c" />, /Leitura do período/],
    ]
    for (const [path, el, title] of screens) {
      renderAt(path, el, proxy)
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)
      cleanup()
    }
    for (const m of ['dashboardSummary', 'agendaMonthDays', 'intelReport', 'listCategories']) expect(called).toContain(m)
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })

  it('atendimento: painel sem faturamento (provas próximas) e Inteligência barrada antes de ler o relatório', async () => {
    const mock = createMockSource({ latencyMs: 0, today: TODAY })
    const { proxy, called } = recording(mock)
    const live = createSupabaseSource({ rpc: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient)

    renderAt('/', <DashboardPage />, proxy, 'atendimento')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoje' })).toBeInTheDocument()
    expect(await screen.findByText('Provas de hoje e amanhã')).toBeInTheDocument()
    expect(screen.queryByText('Faturamento recebido')).toBeNull()
    cleanup()
    renderAt(
      '/inteligencia',
      <RequirePerm perm="inteligencia.view">
        <IntelPage />
      </RequirePerm>,
      proxy,
      'atendimento',
    )
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
    cleanup()

    expect(called).toContain('dashboardSummary')
    expect(called).not.toContain('intelReport')
    const missing = [...called].filter((k) => !(k in live))
    expect(missing).toEqual([])
  })
})
