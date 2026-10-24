import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import type { ReservationRow } from '@/data/types'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'

/** Sábado: "hoje" da fonte e do relógio da tela coincidem. */
const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderPreview(path: string, source: DataSource) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router }
}

/** Reservas são achadas pela situação (código varia com a data). */
async function find(source: DataSource, pred: (r: ReservationRow) => boolean): Promise<ReservationRow> {
  const all = (await source.listReservations('todas', { limit: 500, offset: 0 })).items
  const row = all.find(pred)
  if (!row) throw new Error('reserva do cenário não encontrada')
  return row
}
const has = (name: string) => (r: ReservationRow) => r.garments.some((g) => new RegExp(name).test(g.shortName))
const draftOf = (name: string) => (r: ReservationRow) => r.state === 'rascunho' && has(name)(r)
const signed = (source: DataSource, id: string) => source.markContractSigned(id, { signedAt: TODAY, signerName: 'Cliente', notes: null })
const actionNames = () => within(document.querySelector('.rd-actions') as HTMLElement).getAllByRole('button').map((b) => b.textContent)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Reservas — ficha', () => {
  it('rascunho mostra Editar rascunho, Confirmar reserva, o aviso de conflito e o botão Adicionar peça', async () => {
    const source = newSource()
    const row = await find(source, draftOf('Bolonha'))
    renderPreview(`/preview/reservas/${row.id}`, source)
    expect(await screen.findByRole('heading', { level: 1, name: row.code })).toBeInTheDocument()
    expect(actionNames()).toEqual(expect.arrayContaining(['Editar rascunho', 'Confirmar reserva', 'Cancelar']))
    expect(screen.getByText('Há conflito de agenda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar peça' })).toBeInTheDocument()
    expect(screen.getByText('Sinal mínimo para confirmar')).toBeInTheDocument()
  })

  it('confirmar com contrato não assinado: botão desabilitado e oferece "Marcar como assinado"', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, draftOf('Bolonha'))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar reserva' })
    expect(within(dialog).getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Marcar como assinado' })).toBeInTheDocument()
  })

  it('marcar assinado + sinal de 50% confirma e o Histórico mostra "Confirmada"', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, draftOf('Capri'))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar reserva' })
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como assinado' }))
    const sign = await screen.findByRole('dialog', { name: 'Marcar contrato como assinado' })
    await user.click(within(sign).getByRole('button', { name: 'Marcar como assinado' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Marcar contrato como assinado' })).toBeNull())
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirmar reserva' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }))
    expect(await screen.findByText('Reserva confirmada')).toBeInTheDocument()
    await user.click(await screen.findByRole('tab', { name: 'Histórico' }))
    const panel = await screen.findByRole('tabpanel')
    expect(await within(panel).findByText('Confirmada')).toBeInTheDocument()
  })

  it('confirmação recusada (Bolonha): modal "Confirmação recusada" com "nada foi alterado"', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, draftOf('Bolonha'))
    await signed(source, row.id)
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar reserva' })
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }))
    const refused = await screen.findByRole('dialog', { name: 'Confirmação recusada' })
    expect(within(refused).getByText(new RegExp(`${row.code} · nada foi alterado`))).toBeInTheDocument()
    expect(within(refused).getByText(/O rascunho continua intacto\./)).toBeInTheDocument()
    await user.click(within(refused).getByRole('button', { name: 'Entendi' }))
    expect((await source.getReservation(row.id))!.state).toBe('rascunho')
  })

  it('sinal abaixo do mínimo troca o botão para "Dispensar sinal mínimo e confirmar"', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, draftOf('Capri'))
    await signed(source, row.id)
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar reserva' })
    fireEvent.change(within(dialog).getByLabelText('Valor do sinal (R$)'), { target: { value: '100' } })
    expect(within(dialog).getByRole('button', { name: 'Dispensar sinal mínimo e confirmar' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Sinal abaixo do mínimo/)).toBeInTheDocument()
  })

  it('reserva com saldo: retirada pede PIN ("Autorizar e entregar") e passa para Em uso', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Sorrento')(r))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Registrar retirada' }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar retirada' })
    expect(within(dialog).getByText(/Retirada com saldo pendente exige autorização\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Autorizar e entregar' }))
    const pin = await screen.findByRole('dialog', { name: 'Autorizar exceção' })
    await user.selectOptions(within(pin).getByLabelText('Administrador'), await within(pin).findByRole('option', { name: /Júlia Senzi/ }))
    await user.type(within(pin).getByLabelText('PIN'), '1234')
    await user.type(within(pin).getByLabelText('Motivo'), 'Cliente conhecida')
    await user.click(within(pin).getByRole('button', { name: 'Autorizar' }))
    expect(await screen.findByText('Retirada autorizada')).toBeInTheDocument()
    await waitFor(async () => expect((await source.getReservation(row.id))!.state).toBe('em_uso'))
  })

  it('reserva atrasada mostra a faixa vermelha com a multa calculada e não oferece Cancelar', async () => {
    const source = newSource()
    const row = await find(source, (r) => r.daysLate === 2)
    renderPreview(`/preview/reservas/${row.id}`, source)
    const band = await screen.findByText(/Devolução atrasada em 2 dia\(s\)\./)
    const note = band.closest('.note') as HTMLElement
    expect(note).toHaveClass('red')
    expect(note.textContent).toMatch(/multa contratual é de 20% ao dia sobre R\$\s1\.250,00 — R\$\s500,00 até agora/)
    expect(actionNames()).toContain('Registrar devolução')
    expect(actionNames()).not.toContain('Cancelar')
  })

  it('devolução confirmada leva à Operação', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.daysLate === 2)
    const { router } = renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Registrar devolução' }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar devolução' })
    expect(within(dialog).getByText(/2 dia\(s\) de atraso\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar devolução' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/operacao'))
    expect((await source.getReservation(row.id))!.state).toBe('em_inspecao')
  })

  it('Atendimento vê os valores da reserva, mas nenhum texto de custo da peça', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Sorrento')(r))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await screen.findByRole('heading', { level: 1, name: row.code })
    await user.click(screen.getByRole('button', { name: 'Atendimento' }))
    expect(screen.getAllByText('Saldo').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: /Pagamentos/ })).toBeInTheDocument()
    for (const t of [/Custo/, /Payback/, /Resultado/]) expect(screen.queryByText(t)).toBeNull()
  })

  it('Pagamentos lista os lançamentos e oferece "Receber" no saldo pendente (Sorrento)', async () => {
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Sorrento')(r))
    renderPreview(`/preview/reservas/${row.id}`, source)
    const panel = await screen.findByRole('tabpanel')
    expect(await within(panel).findByText('Sinal')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Receber' })).toBeInTheDocument()
  })

  it('rota de contrato: texto do contrato com "Senzi Club", sem grafia errada da marca, e botão de imprimir', async () => {
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Verona')(r))
    renderPreview(`/preview/reservas/${row.id}/contrato`, source)
    expect(await screen.findByText(/CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº CT-/)).toBeInTheDocument()
    expect(document.body.textContent).toContain('Senzi Club')
    expect(document.body.textContent).not.toContain(['Senzi', 'e'].join(''))
    expect(screen.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeInTheDocument()
  })

  it('rota da OS: cabeçalho, peças, valores e dados da loja a configurar', async () => {
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Verona')(r))
    renderPreview(`/preview/reservas/${row.id}/os`, source)
    expect(await screen.findByRole('heading', { name: 'Ordem de Serviço / Confirmação de Reserva' })).toBeInTheDocument()
    expect(screen.getByText(/Vestido Verona/)).toBeInTheDocument()
    expect(screen.getByText('Saldo')).toBeInTheDocument()
    expect(screen.getByText(/razão social, CNPJ e endereço a configurar/)).toBeInTheDocument()
  })

  it('WhatsApp: botão abre o modal com a mensagem e o link wa.me', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Verona')(r))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Enviar no WhatsApp' }))
    const dialog = await screen.findByRole('dialog', { name: 'Enviar no WhatsApp' })
    expect(within(dialog).getByLabelText('Texto da mensagem').textContent).toMatch(/^Olá, Mariana! Sua reserva .* está confirmada\./)
    expect(within(dialog).getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/)
  })

  it('retirada: "Observação da retirada" vira nota de atendimento da cliente (só com cliente.note)', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'pronta_retirada')
    const d = (await source.getReservation(row.id))!
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: /Registrar retirada|Retirar o restante/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar retirada' })
    await user.type(within(dialog).getByLabelText('Observação da retirada'), 'Entregue com capa')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar retirada' }))
    await waitFor(async () => {
      const c = (await source.getCustomer(d.customerId))!
      expect(c.interactions.some((i) => i.content === 'Retirada — Entregue com capa' && i.channel === 'presencial' && !i.pinned)).toBe(true)
    })
  })

  it('Devolver caução pergunta a forma (padrão PIX) e lança o estorno com ela', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'finalizada')
    await source.registerPayment(row.id, { kind: 'caucao', method: 'pix', amount: 100, reference: null, notes: null })
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Devolver caução' }))
    const dialog = await screen.findByRole('dialog', { name: 'Devolver caução' })
    const select = within(dialog).getByLabelText('Forma da devolução')
    expect(select).toHaveValue('pix')
    await user.selectOptions(select, 'dinheiro')
    await user.click(within(dialog).getByRole('button', { name: 'Devolver caução' }))
    await waitFor(async () => {
      const p = (await source.getReservation(row.id))!.payments.find((x) => x.kind === 'estorno')
      expect(p).toMatchObject({ method: 'dinheiro', refersTo: 'caucao', amount: 100 })
    })
  })

  it('aba Contrato: "Enviar no WhatsApp" abre com a mensagem do contrato', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Verona')(r))
    renderPreview(`/preview/reservas/${row.id}?aba=contrato`, source)
    const panel = await screen.findByRole('tabpanel')
    await user.click(await within(panel).findByRole('button', { name: 'Enviar no WhatsApp' }))
    const dialog = await screen.findByRole('dialog', { name: 'Enviar no WhatsApp' })
    expect(within(dialog).getByLabelText('Mensagem')).toHaveValue('contrato')
  })

  it('cancelar → "Lançar estorno" abre o lançamento de estorno de receita com o valor pago', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const row = await find(source, (r) => r.state === 'confirmada' && has('Sorrento')(r))
    renderPreview(`/preview/reservas/${row.id}`, source)
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    const cancel = await screen.findByRole('dialog', { name: 'Cancelar reserva' })
    await user.click(within(cancel).getByRole('button', { name: 'Lançar estorno' }))
    const pay = await screen.findByRole('dialog', { name: 'Lançar pagamento' })
    expect(within(pay).getByLabelText('Tipo')).toHaveValue('estorno')
    expect(within(pay).getByLabelText('Valor (R$)')).toHaveValue(400)
  })

  it('reserva inexistente mostra "Reserva não encontrada"', async () => {
    renderPreview('/preview/reservas/nao-existe', newSource())
    expect(await screen.findByRole('heading', { name: 'Reserva não encontrada' })).toBeInTheDocument()
  })
})

describe('Reservas — abas nas fichas da peça e da cliente', () => {
  it('ficha da peça: aba Reservas com contador e link para a ficha da reserva', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107', newSource())
    await user.click(await screen.findByRole('tab', { name: /^Reservas/ }))
    const list = await screen.findByRole('list', { name: 'Reservas' })
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: /^Reservas \(\d+\)$/ })).toBeInTheDocument()
  })

  it('ficha da cliente: aba Reservas', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const c = (await source.searchCustomers('Mariana', 'nome', { limit: 1, offset: 0 })).items[0]!
    renderPreview(`/preview/clientes/${c.id}`, source)
    await user.click(await screen.findByRole('tab', { name: /^Reservas/ }))
    const list = await screen.findByRole('list', { name: 'Reservas' })
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(0)
  })
})
