import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import type { Perm } from '@/auth/permissions'
import { DataSourceProvider } from '@/data/source'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { AppPathContext } from '@/shell/appPath'
import { ToastProvider } from '@/ui'
import { FittingPage } from './FittingPage'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

/** Sábado: "hoje" da fonte e do relógio da tela coincidem (a data padrão do agendamento é amanhã). */
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

/** Só a ficha da prova (a aberta da Patrícia), com permissões revogáveis. */
async function renderFicha(revoke: Perm[]) {
  const source = newSource()
  const rows = (await source.listFittings('abertas', { limit: 10, offset: 0 })).items
  const row = rows.find((r) => /Patrícia/.test(r.customerName))!
  const router = createMemoryRouter([{ path: '/preview/provas/:id', element: <FittingPage /> }, { path: '/preview/reservas', element: <p>Reservas</p> }], {
    initialEntries: [`/preview/provas/${row.id}`],
  })
  render(
    <QueryClientProvider client={newClient()}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole="admin" revoke={revoke}>
          <AppPathContext.Provider value="/preview">
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
  return { router, id: row.id }
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

const rowOf = async (name: RegExp) => (await screen.findAllByRole('row')).find((r) => name.test(r.textContent ?? ''))!

/** Abre a ficha da prova da cliente pela lista (filtro Todas). */
async function openFitting(user: ReturnType<typeof userEvent.setup>, who: RegExp) {
  renderPreview('/preview/provas?f=todas')
  const row = await waitFor(async () => {
    const r = await rowOf(who)
    expect(r).toBeTruthy()
    return r
  })
  await user.click(within(row).getByRole('link', { name: /^PR-/ }))
  return screen.findByRole('heading', { level: 1, name: /^Prova PR-/ })
}

describe('Provas — lista', () => {
  it('abre em "Em aberto", com 4 tiles e a taxa no subtítulo; "Todas" inclui a concluída', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/provas')
    expect(await screen.findByRole('heading', { level: 1, name: 'Provas' })).toBeInTheDocument()
    expect(await screen.findByText('27 sessões · 71% de conversão')).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: 'Situação' }))
    expect(chips.getByRole('button', { name: 'Em aberto' })).toHaveAttribute('aria-pressed', 'true')

    const terms = within(await screen.findByLabelText('Números das provas')).getAllByRole('term').map((t) => t.textContent)
    expect(terms).toEqual(['Em aberto', 'Convertidas', 'Sem conversão', 'Taxa de conversão'])
    expect(screen.getByText('sobre 24 provas encerradas')).toBeInTheDocument()

    const table = await screen.findByRole('table', { name: 'Provas' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3)) // cabeçalho + 2 abertas
    expect(within(table).queryByText('Concluída')).toBeNull()

    await user.click(chips.getByRole('button', { name: 'Todas' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Provas' })).getAllByRole('row')).toHaveLength(28))
    expect(within(screen.getByRole('table', { name: 'Provas' })).getByText('Concluída')).toBeInTheDocument()
  })
})

describe('Provas — agendar', () => {
  async function openModal(user: ReturnType<typeof userEvent.setup>) {
    renderPreview('/preview/provas')
    await user.click(await screen.findByRole('button', { name: 'Agendar prova' }))
    return screen.findByRole('dialog', { name: 'Agendar prova' })
  }

  it('cadastrando cliente nova com CPF inválido: mostra "CPF inválido." no campo e não cria nada', async () => {
    const user = userEvent.setup()
    const { source } = renderPreview('/preview/provas')
    await user.click(await screen.findByRole('button', { name: 'Agendar prova' }))
    const dlg = await screen.findByRole('dialog', { name: 'Agendar prova' })
    await user.click(within(dlg).getByRole('combobox', { name: 'Cliente *' }))
    await user.click(await within(dlg).findByRole('option', { name: /Cadastrar nova cliente/ }))
    await user.type(within(dlg).getByLabelText('Nome *'), 'Beatriz Nogueira Lima')
    await user.type(within(dlg).getByLabelText('Telefone *'), '63996124478')
    fireEvent.change(within(dlg).getByLabelText('Nascimento *'), { target: { value: '1990-05-10' } })
    await user.type(within(dlg).getByLabelText('CPF *'), '11111111111')
    await user.click(within(dlg).getByRole('button', { name: 'Agendar prova' }))

    expect(await within(dlg).findByText('CPF inválido.')).toBeInTheDocument()
    expect(within(dlg).getByLabelText('CPF *')).toHaveAttribute('aria-invalid', 'true')
    expect((await source.listFittings('todas', { limit: 50, offset: 0 })).total).toBe(27)
    const found = await source.searchCustomers('Beatriz Nogueira', 'nome', { limit: 5, offset: 0 })
    expect(found.items).toHaveLength(0)
  })

  it('com cliente existente cria a prova e navega para a ficha nova', async () => {
    const user = userEvent.setup()
    const { router, source } = renderPreview('/preview/provas')
    await user.click(await screen.findByRole('button', { name: 'Agendar prova' }))
    const dlg = await screen.findByRole('dialog', { name: 'Agendar prova' })
    await user.type(within(dlg).getByRole('combobox', { name: 'Cliente *' }), 'Mariana')
    await user.click(await within(dlg).findByRole('option', { name: /Mariana/ }))
    await user.click(within(dlg).getByRole('button', { name: 'Agendar prova' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/preview\/provas\/.+/))
    expect(await screen.findByRole('heading', { level: 1, name: /^Prova PR-2026-/ })).toBeInTheDocument()
    expect((await source.listFittings('todas', { limit: 50, offset: 0 })).total).toBe(28)
    expect(await screen.findByRole('status')).toHaveTextContent(/Prova agendada\s*PR-2026-\d{4} · 25\/10/)
  })

  it('o atendente já vem com a pessoa logada', async () => {
    const user = userEvent.setup()
    const dlg = await openModal(user)
    await waitFor(() => expect(within(dlg).getByLabelText('Atendente')).toHaveValue('Júlia Senzi'))
  })

  it('campos da cliente nova vazios mostram as mensagens de obrigatório', async () => {
    const user = userEvent.setup()
    const dlg = await openModal(user)
    await user.click(within(dlg).getByRole('combobox', { name: 'Cliente *' }))
    await user.click(await within(dlg).findByRole('option', { name: /Cadastrar nova cliente/ }))
    await user.click(within(dlg).getByRole('button', { name: 'Agendar prova' }))
    expect(await within(dlg).findByText('Informe o nome completo da cliente.')).toBeInTheDocument()
    expect(within(dlg).getByText('Informe um telefone com DDD.')).toBeInTheDocument()
    expect(within(dlg).getByText('Informe a data de nascimento (não pode ser no futuro).')).toBeInTheDocument()
    expect(within(dlg).getByText('CPF inválido.')).toBeInTheDocument()
  })

  it('data do evento antes da prova: "O evento não pode ser antes da prova."', async () => {
    const user = userEvent.setup()
    const dlg = await openModal(user)
    await user.type(within(dlg).getByRole('combobox', { name: 'Cliente *' }), 'Mariana')
    await user.click(await within(dlg).findByRole('option', { name: /Mariana/ }))
    fireEvent.change(within(dlg).getByLabelText('Data do evento'), { target: { value: '2026-10-20' } })
    await user.click(within(dlg).getByRole('button', { name: 'Agendar prova' }))
    expect(await within(dlg).findByText('O evento não pode ser antes da prova.')).toBeInTheDocument()
  })

  it('sem cliente escolhida pede para selecionar', async () => {
    const user = userEvent.setup()
    const dlg = await openModal(user)
    await user.click(within(dlg).getByRole('button', { name: 'Agendar prova' }))
    expect(await within(dlg).findByText('Selecione a cliente.')).toBeInTheDocument()
  })
})

describe('Provas — ficha', () => {
  it('clicar num resultado mantém a nota da peça; "Gerar reserva" só com peça aprovada', async () => {
    const user = userEvent.setup()
    await openFitting(user, /Patrícia/)
    const items = await screen.findByRole('list', { name: 'Peças separadas' })
    expect(within(items).getAllByRole('listitem')).toHaveLength(3)
    // Siena está "Serviu" → há peça aprovada
    const gerar = screen.getByRole('link', { name: /Gerar reserva/ })
    expect(gerar.getAttribute('href')).toMatch(/\/reservas\?nova=1&prova=/)

    const milano = within(items).getAllByRole('listitem').find((li) => /Milano/.test(li.textContent ?? ''))!
    await user.click(within(milano).getByRole('button', { name: /Observação de/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Observação da prova' })
    await user.type(within(dlg).getByRole('textbox'), 'Marcando a cintura')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findAllByText(/“Marcando a cintura”/)).not.toHaveLength(0)

    const again = within(within(await screen.findByRole('list', { name: 'Peças separadas' })).getAllByRole('listitem').find((li) => /Milano/.test(li.textContent ?? ''))!)
    await user.click(again.getByRole('button', { name: 'Gostou' }))
    await waitFor(() => expect(again.getByRole('button', { name: 'Gostou' })).toHaveAttribute('aria-pressed', 'true'))
    expect(within(await screen.findByRole('list', { name: 'Peças separadas' })).getByText('“Marcando a cintura”')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'O que a cliente disse' })).toBeInTheDocument()
  })

  it('prova sem peça aprovada não oferece "Gerar reserva"', async () => {
    const user = userEvent.setup()
    await openFitting(user, /Gabriela/)
    await screen.findByRole('button', { name: 'Encerrar prova' })
    expect(screen.queryByRole('link', { name: /Gerar reserva/ })).toBeNull()
  })

  it('encerrar com peça sem resultado avisa em âmbar e, depois, some a edição', async () => {
    const user = userEvent.setup()
    await openFitting(user, /Patrícia/)
    await user.click(await screen.findByRole('button', { name: 'Encerrar prova' }))
    const dlg = await screen.findByRole('dialog', { name: 'Encerrar prova' })
    expect(within(dlg).getByText(/2 peças sem resultado registrado/)).toBeInTheDocument()
    await user.click(within(dlg).getByRole('button', { name: 'Encerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Prova encerrada sem conversão.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Encerrar prova' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Separar peça' })).toBeNull()
    expect(screen.queryByRole('group', { name: /Resultado de/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Gerar reserva/ })).toBeNull()
  })

  it('sem reserva.create não há "Gerar reserva"; com ela, o link leva a /reservas?nova=1&prova=', async () => {
    await renderFicha(['reserva.create'])
    await screen.findByRole('button', { name: 'Encerrar prova' })
    expect(screen.queryByRole('link', { name: /Gerar reserva/ })).toBeNull()
  })

  it('"Gerar reserva" navega para a nova reserva com a prova', async () => {
    const user = userEvent.setup()
    const { router, id } = await renderFicha([])
    await user.click(await screen.findByRole('link', { name: /Gerar reserva/ }))
    expect(router.state.location.pathname + router.state.location.search).toBe(`/preview/reservas?nova=1&prova=${id}`)
  })

  it('observação salva avisa com um toast', async () => {
    const user = userEvent.setup()
    await openFitting(user, /Patrícia/)
    const items = await screen.findByRole('list', { name: 'Peças separadas' })
    await user.click(within(items).getAllByRole('button', { name: /Observação de/ })[0]!)
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Observação registrada')).toBeInTheDocument()
  })

  it('prova não encontrada', async () => {
    renderPreview('/preview/provas/nao-existe')
    expect(await screen.findByRole('heading', { level: 1, name: 'Prova não encontrada' })).toBeInTheDocument()
  })
})

describe('Provas nas fichas', () => {
  it('aba Provas da cliente lista as sessões dela', async () => {
    renderPreview('/preview/clientes/cl-0001?aba=provas')
    const list = await screen.findByRole('list', { name: 'Provas da cliente' })
    const first = (await within(list).findAllByRole('listitem'))[0]!
    expect(within(first).getByRole('link', { name: /^PR-/ })).toBeInTheDocument()
    expect(within(first).getByText('Convertida')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeInTheDocument()
  })

  it('aba Provas da peça mostra a conversão', async () => {
    renderPreview('/preview/acervo/sz-0107?aba=provas')
    expect(await screen.findByText('Favoritas')).toBeInTheDocument()
    expect(screen.getByText('Viraram reserva')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Provas da peça' })
    const first = within(list).getAllByRole('listitem')[0]!
    expect(within(first).getByRole('link', { name: /^PR-/ })).toBeInTheDocument()
    expect(within(first).getByText('Favorita')).toBeInTheDocument()
  })
})
