import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { AppPathContext } from '@/shell/appPath'
import { ToastProvider } from '@/ui'
import { ReservasListPage } from './ReservasListPage'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

/** Sábado: "hoje" da fonte e do relógio da tela coincidem. */
const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderPreview(path: string, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

const rows = async () => (await screen.findAllByRole('row')).slice(1)

describe('Reservas — lista', () => {
  it('abre em "Ativas" (sem encerradas) e "Rascunhos" lista Bolonha e Capri', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/reservas')
    expect(await screen.findByRole('heading', { level: 1, name: 'Reservas' })).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: 'Filtro' }))
    expect(chips.getByRole('button', { name: 'Ativas' })).toHaveAttribute('aria-pressed', 'true')
    expect((await rows()).some((r) => /Finalizada/.test(r.textContent ?? ''))).toBe(false)
    await user.click(chips.getByRole('button', { name: 'Rascunhos' }))
    await waitFor(async () => expect(await rows()).toHaveLength(2))
    const text = (await rows()).map((r) => r.textContent).join(' ')
    expect(text).toMatch(/Bolonha/)
    expect(text).toMatch(/Capri/)
  })

  it('atraso aparece como "2d de atraso" em vermelho', async () => {
    renderPreview('/preview/reservas')
    const late = await screen.findByText('2d de atraso')
    expect(late).toHaveClass('rs-late')
  })

  it('sem financeiro.view somem Pagamento, Valor, "Com saldo" e "a receber"; com ela aparecem (Atendimento tem a permissão)', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/reservas')
    await screen.findByText('2d de atraso')
    expect(screen.getByRole('columnheader', { name: 'Pagamento' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Valor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Com saldo' })).toBeInTheDocument()
    expect(screen.getByText(/a receber/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Atendimento' }))
    expect(screen.getByRole('columnheader', { name: 'Pagamento' })).toBeInTheDocument()
    cleanup()

    const router = createMemoryRouter([{ path: '/preview/reservas', element: <ReservasListPage /> }], { initialEntries: ['/preview/reservas'] })
    render(
      <QueryClientProvider client={newClient()}>
        <DataSourceProvider source={newSource()}>
          <PreviewPermissionsProvider initialRole="atendimento" revoke={['financeiro.view']}>
            <AppPathContext.Provider value="/preview">
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </AppPathContext.Provider>
          </PreviewPermissionsProvider>
        </DataSourceProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('2d de atraso')
    expect(screen.queryByRole('columnheader', { name: 'Pagamento' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Valor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Com saldo' })).toBeNull()
    expect(screen.queryByText(/a receber/)).toBeNull()
    expect(screen.getByText(/em curso$/)).toBeInTheDocument()
  })
})

describe('Reservas — nova reserva', () => {
  it('?nova=1&peca=sz-0107 abre o formulário com Verona selecionada, em conflito, e ainda permite criar o rascunho', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/reservas?nova=1&peca=sz-0107')
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    const verona = await within(dialog).findByRole('button', { name: /Vestido Verona/, pressed: true })
    expect(verona).toBeInTheDocument()
    expect(await within(verona).findByText(/^Locação \d\d\/\d\d – \d\d\/\d\d$/)).toBeInTheDocument()
    const band = await within(dialog).findByText(/Vestido Verona \(SZ-0107\) não está disponível\./)
    expect(band.closest('.note')).toHaveClass('amber')
    expect(await within(dialog).findByText(/Alternativas semelhantes livres:|Não há peça semelhante livre/)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Cliente *'), 'Patrícia')
    await user.click(await screen.findByRole('option', { name: /Patrícia/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Criar rascunho' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/preview\/reservas\/res-/))
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Reserva criada')).toBeInTheDocument()
    expect(screen.getByText(/RS-2026-\d{4} · rascunho/)).toBeInTheDocument()
  })

  it('lista os erros verbatim na caixa "Corrija antes de continuar:"', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/reservas?nova=1')
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    fireEvent.change(within(dialog).getByLabelText('Desconto (R$)'), { target: { value: '-5' } })
    await user.click(within(dialog).getByRole('button', { name: 'Criar rascunho' }))
    const box = await within(dialog).findByText('Corrija antes de continuar:')
    const text = box.closest('.note')!.textContent
    expect(text).toContain('Selecione a cliente — toda reserva pertence a alguém.')
    expect(text).toContain('Selecione ao menos uma peça.')
    expect(text).toContain('O desconto não pode ser negativo.')
  })

  it('desconto maior que o valor das peças compõe a frase com os valores', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const c = (await source.searchCustomers('Patrícia', 'nome', { limit: 1, offset: 0 })).items[0]!
    renderPreview(`/preview/reservas?nova=1&peca=sz-0107&cliente=${c.id}`, source)
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    await within(dialog).findByRole('button', { name: /Vestido Verona/, pressed: true })
    fireEvent.change(within(dialog).getByLabelText('Desconto (R$)'), { target: { value: '2000' } })
    await user.click(within(dialog).getByRole('button', { name: 'Criar rascunho' }))
    expect(await within(dialog).findByText(/O desconto \(R\$\s2\.000,00\) é maior que o valor das peças \(R\$\s890,00\)\./)).toBeInTheDocument()
  })

  it('desconto acima de 15% pede o PIN; com 1234 cria o rascunho', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const c = (await source.searchCustomers('Patrícia', 'nome', { limit: 1, offset: 0 })).items[0]!
    const { router } = renderPreview(`/preview/reservas?nova=1&peca=sz-0107&cliente=${c.id}`, source)
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    await within(dialog).findByRole('button', { name: /Vestido Verona/, pressed: true })
    fireEvent.change(within(dialog).getByLabelText('Desconto (R$)'), { target: { value: '200' } })
    await user.click(within(dialog).getByRole('button', { name: 'Criar rascunho' }))

    const pin = await screen.findByRole('dialog', { name: 'Autorizar exceção' })
    expect(within(pin).getByText('Desconto acima do limite')).toBeInTheDocument()
    await user.selectOptions(within(pin).getByLabelText('Administrador'), await within(pin).findByRole('option', { name: /Júlia Senzi/ }))
    await user.type(within(pin).getByLabelText('PIN'), '1234')
    await user.type(within(pin).getByLabelText('Motivo'), 'Cliente antiga')
    await user.click(within(pin).getByRole('button', { name: 'Autorizar' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/preview\/reservas\/res-/))
    const list = await source.listReservations('rascunhos', { limit: 10, offset: 0 })
    expect(list.items).toHaveLength(3)
  })

  it('vindo de prova, preenche a cliente e as peças aprovadas e deixa a prova "Convertida"', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const fit = (await source.listFittings('abertas', { limit: 10, offset: 0 })).items.find((f) => /Patrícia/.test(f.customerName))!
    const { router } = renderPreview(`/preview/reservas?nova=1&prova=${fit.id}`, source)
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    await waitFor(() => expect(within(dialog).getByLabelText('Cliente *')).toHaveValue('Patrícia Rocha Andrade'))
    expect(await within(dialog).findByLabelText('Data do evento *')).toHaveValue('2026-11-18')
    expect(within(dialog).getAllByRole('button', { pressed: true })).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Criar rascunho' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/preview\/reservas\/res-/))
    expect((await source.getFitting(fit.id))!.session.state).toBe('convertida')
  })

  it('fechar remove os parâmetros da URL', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/reservas?nova=1&peca=sz-0107&f=rascunhos')
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.search).toBe('?f=rascunhos')
  })
})
