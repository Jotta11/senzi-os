import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { createSupabaseSource } from '@/data/supabaseSource'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
import { CategoriesPage } from '@/features/financeiro/CategoriesPage'
import { FinanceOverviewPage } from '@/features/financeiro/FinanceOverviewPage'
import { PayablesPage } from '@/features/financeiro/PayablesPage'
import { ReceivablesPage } from '@/features/financeiro/ReceivablesPage'
import { FittingPage } from '@/features/provas/FittingPage'
import { ProvasListPage } from '@/features/provas/ProvasListPage'
import { ContractPrint } from '@/features/reservas/print/ContractPrint'
import { OsPrint } from '@/features/reservas/print/OsPrint'
import { ReservasListPage } from '@/features/reservas/ReservasListPage'
import { ReservationPage } from '@/features/reservas/ReservationPage'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { ToastProvider } from '@/ui'

/**
 * Telas ligadas no app real (Agenda, Provas, Reservas, Financeiro e as abas de reservas das fichas): renderizadas sobre a fonte em memória, registram cada método da
 * `DataSource` que chamam. Todos precisam existir na fonte do Supabase — senão a tela cairia em `NAO_DISPONIVEL`.
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

function renderAt(path: string, element: ReactNode, source: DataSource) {
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
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole="admin">
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
