import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { createSupabaseSource } from '@/data/supabaseSource'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { FittingPage } from '@/features/provas/FittingPage'
import { ProvasListPage } from '@/features/provas/ProvasListPage'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { ToastProvider } from '@/ui'

/**
 * Telas ligadas no app real (Agenda e Provas): renderizadas sobre a fonte em memória, registram cada método da
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
