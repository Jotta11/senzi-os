import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import { addDays } from '@/lib/format'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

/** Domingo: a semana vai de segunda a domingo, então a próxima coluna depois de hoje é segunda. */
const TODAY = '2026-10-25'
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

const regions = () => screen.getAllByRole('region').filter((r) => /^\S+, \d\d\/\d\d$/.test(r.getAttribute('aria-label') ?? ''))
const dayRegion = (label: string) => screen.findByRole('region', { name: label })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-25T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Agenda — kanban de dias', () => {
  it('com hoje domingo, as colunas seguem sáb, dom e a próxima é seg; hoje vem marcado e é a 2ª coluna visível', async () => {
    renderPreview('/preview/agenda')
    const today = await dayRegion('domingo, 25/10')
    await within(today).findByText('hoje')
    const labels = regions().map((r) => r.getAttribute('aria-label'))
    const i = labels.indexOf('domingo, 25/10')
    expect(labels.slice(i - 1, i + 2)).toEqual(['sábado, 24/10', 'domingo, 25/10', 'segunda, 26/10'])
    // janela: hoje −14 a hoje +45
    expect(labels).toHaveLength(60)
    expect(labels[0]).toBe('domingo, 11/10')
    // intervalo visível: sáb 24 → ter 27 (hoje é a 2ª das 4 colunas)
    expect(screen.getByText('24/10 – 27/10/2026')).toBeInTheDocument()
  })

  it('?dia= abre centrado no dia pedido (mesmo fora da janela padrão)', async () => {
    renderPreview('/preview/agenda?dia=2026-12-31')
    await dayRegion('quinta, 31/12')
    expect(screen.getByText('30/12 – 02/01/2027')).toBeInTheDocument()
  })

  it('setas movem uma coluna e Hoje volta; as setas têm nome acessível', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    await user.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText('25/10 – 28/10/2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('23/10 – 26/10/2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByText('24/10 – 27/10/2026')).toBeInTheDocument()
  })

  it('cartões do dia em ordem de horário, com tipo e cliente', async () => {
    renderPreview('/preview/agenda')
    const today = await dayRegion('domingo, 25/10')
    const cards = await within(today).findAllByRole('listitem')
    const times = cards.map((c) => c.querySelector('.kb-time')?.textContent)
    expect(times).toEqual([...times].sort())
    expect(within(today).getByText('Prova')).toBeInTheDocument()
    expect(within(today).getByText('Retirada')).toBeInTheDocument()
    expect(within(today).getByText('Evento')).toBeInTheDocument()
  })

  it('dia sem compromissos mostra "—"', async () => {
    renderPreview('/preview/agenda')
    const day = await dayRegion('domingo, 11/10')
    await within(day).findByText('—')
  })

  it('chip Prova esconde os outros tipos mas mantém os blocos de acervo', async () => {
    const source = newSource()
    const g = (await source.searchGarments({}, { limit: 1, offset: 0 })).items[0]!
    await source.blockGarment(g.id, TODAY, addDays(TODAY, 1), 'Teste')
    const user = userEvent.setup()
    renderPreview('/preview/agenda', source)
    const today = await dayRegion('domingo, 25/10')
    await within(today).findByText('Retirada')
    expect(within(today).getByRole('link', { name: new RegExp(`${g.code} · Bloqueio`) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prova' }))
    await waitFor(() => expect(within(today).queryByText('Retirada')).toBeNull())
    expect(within(today).queryByText('Evento')).toBeNull()
    expect(within(today).getByText('Prova')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: new RegExp(`${g.code} · Bloqueio`) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(await within(today).findByText('Retirada')).toBeInTheDocument()
  })

  it('"+N peças" aparece no dia com 5 ou mais blocos de acervo', async () => {
    const source = newSource()
    const gs = (await source.searchGarments({}, { limit: 6, offset: 0 })).items
    const day = addDays(TODAY, 20)
    for (const g of gs) await source.blockGarment(g.id, day, day, 'Teste')
    const more = (await source.agendaRange(day, day))[0]!.moreBlocks
    expect(more).toBeGreaterThanOrEqual(2)
    renderPreview('/preview/agenda', source)
    const col = await dayRegion('sábado, 14/11')
    expect(await within(col).findByText(`+${more} peças`)).toBeInTheDocument()
    expect(within(col).getAllByRole('link', { name: / · Bloqueio/ })).toHaveLength(4)
  })

  it('cartão de prova leva à ficha da prova', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/agenda?dia=2026-10-24')
    const day = await dayRegion('sábado, 24/10')
    // a prova "em curso" do mundo cai no "hoje" da fonte (25/10)
    const today = await dayRegion('domingo, 25/10')
    void day
    const link = await within(today).findByRole('link', { name: /Prova/ })
    await user.click(link)
    expect(router.state.location.pathname).toMatch(/^\/preview\/provas\/.+/)
  })
})

describe('Agenda — novo compromisso', () => {
  it('Interno marcado salva sem cliente e o cartão aparece com rótulo "Interno"', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    await user.click(screen.getByRole('button', { name: /Novo compromisso/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo compromisso' })
    await user.click(within(dlg).getByRole('checkbox', { name: 'Interno' }))
    await user.type(within(dlg).getByLabelText(/Observação/), 'Reunião de equipe')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const today = await dayRegion('domingo, 25/10')
    expect(await within(today).findByText('Reunião de equipe')).toBeInTheDocument()
    expect(within(today).getByText('Interno')).toBeInTheDocument()
  })

  it('sem Interno e sem cliente mostra "Selecione a cliente." no campo', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    await user.click(screen.getByRole('button', { name: /Novo compromisso/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo compromisso' })
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Selecione a cliente.')).toBeInTheDocument()
    expect(within(dlg).getByRole('combobox', { name: /Cliente/ })).toHaveAttribute('aria-invalid', 'true')
  })

  it('Serviço sem cliente exige observação', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    await user.click(screen.getByRole('button', { name: /Novo compromisso/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo compromisso' })
    await user.selectOptions(within(dlg).getByLabelText('Tipo'), 'servico')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Escreva a observação.')).toBeInTheDocument()
  })

  it('Atendimento com cliente: busca por teclado, Enter escolhe sem enviar o formulário', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    await user.click(screen.getByRole('button', { name: /Novo compromisso/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo compromisso' })
    const box = within(dlg).getByRole('combobox', { name: /Cliente/ })
    await user.type(box, 'Mari')
    const list = await within(dlg).findByRole('listbox')
    const opts = await within(list).findAllByRole('option')
    expect(opts.length).toBeGreaterThan(0)
    await user.keyboard('{ArrowDown}{Enter}')
    // Enter não envia: o diálogo continua aberto e a cliente fica escolhida
    expect(screen.getByRole('dialog', { name: 'Novo compromisso' })).toBeInTheDocument()
    await waitFor(() => expect((box as HTMLInputElement).value).toMatch(/Mari/))
    expect(within(dlg).queryByRole('listbox')).toBeNull()
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const today = await dayRegion('domingo, 25/10')
    expect(await within(today).findAllByText('Atendimento')).not.toHaveLength(0)
  })

  it('Atendimento (perfil) também vê o botão', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    await dayRegion('domingo, 25/10')
    // o botão do perfil (os chips de tipo também têm um "Atendimento")
    const chips = screen.getByRole('group', { name: 'Filtrar por tipo' })
    const perfil = screen.getAllByRole('button', { name: 'Atendimento' }).find((b) => !chips.contains(b))!
    await user.click(perfil)
    expect(screen.getByRole('button', { name: /Novo compromisso/ })).toBeInTheDocument()
  })
})

describe('Agenda — editar e cancelar compromisso manual', () => {
  it('clicar no cartão manual abre a edição; Cancelar compromisso o remove da agenda', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    const today = await dayRegion('domingo, 25/10')
    await user.click(await within(today).findByRole('button', { name: /Coleta da lavanderia/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Editar compromisso' })
    expect(within(dlg).getByLabelText('Tipo')).toHaveValue('servico')
    await user.click(within(dlg).getByRole('button', { name: 'Cancelar compromisso' }))
    await user.click(within(dlg).getByRole('button', { name: 'Sim, cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(within(today).queryByText(/Coleta da lavanderia/)).toBeNull())
  })

  it('editar a observação atualiza o cartão', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    const today = await dayRegion('domingo, 25/10')
    await user.click(await within(today).findByRole('button', { name: /Coleta da lavanderia/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Editar compromisso' })
    const obs = within(dlg).getByLabelText(/Observação/)
    await user.clear(obs)
    await user.type(obs, 'Coleta da costureira')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(today).findByText('Coleta da costureira')).toBeInTheDocument()
  })

  it('cartões automáticos não abrem o modal de edição', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/agenda')
    const today = await dayRegion('domingo, 25/10')
    await user.click(await within(today).findByRole('link', { name: /Retirada/ }))
    expect(screen.queryByRole('dialog', { name: 'Editar compromisso' })).toBeNull()
  })
})
