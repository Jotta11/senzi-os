import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import type { ReservationRow } from '@/data/types'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })

function renderPreview(path: string, source: DataSource) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router }
}

async function findRes(source: DataSource, pred: (r: ReservationRow) => boolean): Promise<ReservationRow> {
  const row = (await source.listReservations('todas', { limit: 500, offset: 0 })).items.find(pred)
  if (!row) throw new Error('reserva do cenário não encontrada')
  return row
}
const card = async (name: string) => screen.findByRole('region', { name })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Operação — tela', () => {
  it('mostra título, subtítulo, tiles, nota fixa e as filas do cenário', async () => {
    renderPreview('/preview/operacao', newSource())
    expect(await screen.findByRole('heading', { level: 1, name: 'Operação' })).toBeInTheDocument()
    expect(await screen.findByText(/peça\(s\) no ciclo · 4 ordem\(ns\) em aberto · R\$\s[\d.]+ em custos nos últimos 30 dias/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma peça nesta tela pode ser reservada\./)).toBeInTheDocument()
    expect(within(await card('Aguardando inspeção')).getByText('Vestido Modena')).toBeInTheDocument()
    expect(within(await card('Em higienização')).getByText('Vestido Trastevere')).toBeInTheDocument()
    const man = await card('Em manutenção')
    expect(within(man).getByText(/Zíper invisível rompido/)).toBeInTheDocument()
    expect(within(man).getByText(/há 9 dia\(s\)/)).toHaveClass('op-old')
    expect(within(man).getByText(/próxima reserva/)).toBeInTheDocument()
    expect(within(await card('Bloqueadas')).getByRole('button', { name: 'Devolver ao acervo' })).toBeInTheDocument()
    expect(within(await card('Aguardando inspeção')).getAllByText(/aguarda há \d+ dia\(s\)/).length).toBeGreaterThan(0)
    const orders = within(await card('Ordens em aberto')).getByRole('table', { name: 'Ordens em aberto' })
    expect(within(orders).getAllByRole('row')).toHaveLength(5)
  })

  it('devolver na reserva leva à Operação; inspecionar sem ressalvas manda para higienização e finaliza a reserva', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await findRes(source, (r) => r.state === 'em_uso' && r.garments.some((g) => /Ostuni/.test(g.shortName)))
    const { router } = renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Registrar devolução' }))
    const ret = await screen.findByRole('dialog', { name: 'Registrar devolução' })
    await user.click(within(ret).getByRole('button', { name: 'Confirmar devolução' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/operacao'))
    expect(router.state.location.search).toBe(`?reserva=${row.id}`)

    const wait = await card('Aguardando inspeção')
    const ostuni = (await within(wait).findByText('Vestido Ostuni')).closest('li') as HTMLElement
    expect(ostuni).toHaveAttribute('data-focus', 'true')
    await user.click(within(ostuni).getByRole('button', { name: 'Inspecionar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Inspeção de devolução' })
    expect(within(dialog).getByText(/devolvida por Fernanda/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Registrar inspeção' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(await card('Em higienização')).getByText('Vestido Ostuni')).toBeInTheDocument()
    expect(within(await card('Aguardando inspeção')).queryByText('Vestido Ostuni')).toBeNull()

    await act(() => router.navigate(`/preview/reservas/${row.id}`))
    expect((await screen.findAllByText('Finalizada')).length).toBeGreaterThan(0)
  })

  it('inspeção com dano grave: aviso, opção de perda e envio à manutenção', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/operacao', newSource())
    const wait = await card('Aguardando inspeção')
    const modena = (await within(wait).findByText('Vestido Modena')).closest('li') as HTMLElement
    await user.click(within(modena).getByRole('button', { name: 'Inspecionar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Inspeção de devolução' })
    expect(within(dialog).getByLabelText('Severidade de Manchas')).toBeDisabled()
    expect(within(dialog).getByText('Nenhuma foto anexada.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Zíper e fechos' }))
    await user.selectOptions(within(dialog).getByLabelText('Severidade de Zíper e fechos'), 'grave')
    await user.type(within(dialog).getByLabelText('Descrição de Zíper e fechos'), 'Rompido')
    expect(within(dialog).getByText('Dano grave marcado.')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Possível perda da peça/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Dano' }))
    expect(within(dialog).getByRole('button', { name: 'Remover foto' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Registrar inspeção' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(await card('Em manutenção')).getByText('Vestido Modena')).toBeInTheDocument()
  })

  it('concluir higienização com custo lança a despesa e libera a peça', async () => {
    const user = userEvent.setup()
    const source = newSource()
    renderPreview('/preview/operacao', source)
    const hig = await card('Em higienização')
    const row = (await within(hig).findByText('Vestido Trastevere')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Concluir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Concluir higienização' })
    expect(within(dialog).getByLabelText('Custo (R$)')).toHaveValue(58)
    expect(within(dialog).getByRole('checkbox', { name: /Liberar a peça para o acervo/ })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Em higienização' })).queryByText('Vestido Trastevere')).toBeNull())
    expect(await screen.findByText(/R\$\s58,00 lançado no custo da peça/)).toBeInTheDocument()
  })

  it('Liberar na peça bloqueada pede confirmação e devolve ao acervo', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/operacao', newSource())
    await user.click(await within(await card('Bloqueadas')).findByRole('button', { name: 'Devolver ao acervo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Liberar peça para o acervo' })
    expect(within(dialog).getByText(/Os bloqueios operacionais atuais serão removidos do calendário\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Liberar peça' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bloqueadas' })).toBeNull())
    expect(await screen.findByText(/agora está disponível\./)).toBeInTheDocument()
  })

  it('Atendimento não vê o custo dos últimos 30 dias, mas opera as filas', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/operacao', newSource())
    await screen.findByText(/em custos nos últimos 30 dias/)
    await user.click(screen.getByRole('button', { name: 'Atendimento' }))
    await waitFor(() => expect(screen.queryByText(/em custos nos últimos 30 dias/)).toBeNull())
    expect(screen.getByText(/ordem\(ns\) em aberto/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Inspecionar' }).length).toBeGreaterThan(0)
  })
})

describe('Ficha da peça — aba Manutenções', () => {
  it('lista ordens e inspeções; custo só com acervo.cost', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const parma = (await source.searchGarments({ q: 'Parma', stateGroup: 'todos' }, { limit: 5, offset: 0 })).items[0]!
    renderPreview(`/preview/acervo/${parma.id}?aba=manutencoes`, source)
    const orders = await screen.findByRole('table', { name: 'Ordens de serviço' })
    expect(within(orders).getByText('Zíper')).toBeInTheDocument()
    expect(within(orders).getByRole('columnheader', { name: 'Custo' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Inspeções' })).getAllByText('Reprovada (dano)').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: /Manutenções/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Atendimento' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Custo' })).toBeNull())
  })
})
