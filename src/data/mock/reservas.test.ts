import { addDays } from '@/lib/format'
import { lateFee, lateFeePercent, minSignal } from '@/domain/money'
import { createMockCtx, type MockCtx } from './context'
import { exceptionsMock } from './exceptions'
import { reservas } from './reservas'
import { SourceError, type Garment, type Reservation, type ReservationInput } from '../types'

const TODAY = '2026-10-24'
const D = (n: number) => addDays(TODAY, n)

function setup() {
  const ctx = createMockCtx({ latencyMs: 0, today: TODAY })
  return { ctx, src: reservas(ctx), auth: exceptionsMock(ctx) }
}

async function errorOf(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(SourceError)
    return e as SourceError
  }
  throw new Error('esperava erro')
}

const byName = (ctx: MockCtx, n: string): Garment => ctx.db.garments.find((g) => g.name.endsWith(` ${n}`))!
/** Reserva da situação atual pela peça e pelo estado (códigos variam com o histórico). */
const resOf = (ctx: MockCtx, garment: string, state: Reservation['state']): Reservation =>
  ctx.db.reservations.find((r) => r.state === state && r.items.some((i) => i.garmentId === byName(ctx, garment).id))!

function input(ctx: MockCtx, names: string[], d: [number, number, number], extra: Partial<ReservationInput> = {}): ReservationInput {
  return {
    customerId: ctx.db.customers[5]!.id,
    pickupDate: D(d[0]),
    eventDate: D(d[1]),
    returnDueDate: D(d[2]),
    eventType: 'Casamento',
    discount: 0,
    items: names.map((n) => ({ garmentId: byName(ctx, n).id, unitPrice: byName(ctx, n).rentalPrice })),
    ...extra,
  }
}

/** Fatia do mundo que a confirmação pode tocar. */
const snapshot = (ctx: MockCtx) =>
  structuredClone({
    reservations: ctx.db.reservations,
    garments: ctx.db.garments.map((g) => ({ id: g.id, state: g.state, blocks: g.blocks, history: g.history })),
    appointments: ctx.db.appointments,
    exceptions: ctx.db.exceptions,
  })

async function signed(src: ReturnType<typeof reservas>, ctx: MockCtx, id: string) {
  await src.markContractSigned(id, { signedAt: TODAY, signerName: 'Cliente', notes: null })
  return ctx.reservation(id)
}

async function authorize(auth: ReturnType<typeof exceptionsMock>, kind: Parameters<typeof auth.authorize>[0]['kind'], refType: string, refId: string, maxAmount?: number) {
  const r = await auth.authorize({ email: 'julia@senzi.com.br', pin: '1234', kind, reason: 'Cliente antiga', refType, refId, maxAmount })
  if (!r.ok) throw new Error(r.error)
  return r.id
}

describe('reservas — rascunho', () => {
  it('rascunho com peça em conflito é criado: estado rascunho, peça continua disponível e sem blocos novos', async () => {
    const { ctx, src } = setup()
    const bolonha = byName(ctx, 'Bolonha')
    const blocksBefore = structuredClone(bolonha.blocks)
    const r = await src.createDraft(input(ctx, ['Bolonha'], [11, 12, 13]))
    expect(r.state).toBe('rascunho')
    expect(r.code).toMatch(/^RS-2026-\d{4}$/)
    expect(r.contract?.number).toBe(r.code.replace('RS', 'CT'))
    expect(r.contract?.bodyRendered).toContain('Senzi Club')
    expect(r.contract?.signedAt).toBeNull()
    expect(bolonha.state).toBe('disponivel')
    expect(bolonha.blocks).toEqual(blocksBefore)
    const detail = await src.getReservation(r.id)
    expect(detail!.conflicts).toHaveLength(1)
    expect(detail!.conflicts[0]!.conflicts.some((c) => c.kind === 'bloqueio_manual')).toBe(true)
  })

  it('coleta todos os problemas de validação com o campo de cada um', async () => {
    const { src } = setup()
    const err = await errorOf(src.createDraft({ customerId: '', eventDate: '', pickupDate: D(-5), returnDueDate: D(-7), discount: -1, items: [] }))
    expect(err.issues!.map((i) => [i.code, i.field])).toEqual([
      ['RESERVA_SEM_CLIENTE', 'customerId'],
      ['RESERVA_SEM_PECAS', 'items'],
      ['DATA_EVENTO_OBRIGATORIA', 'eventDate'],
      ['DEVOLUCAO_ANTES_RETIRADA', 'returnDueDate'],
      ['RETIRADA_NO_PASSADO', 'pickupDate'],
      ['DESCONTO_NEGATIVO', 'discount'],
    ])
  })

  it('desconto de 16% sem exceção → DESCONTO_ACIMA_LIMITE; com exceção válida cria e religa a exceção', async () => {
    const { ctx, src, auth } = setup()
    const base = input(ctx, ['Turim', 'Nápoles'], [5, 6, 8])
    const discount = Math.round(880 * 0.16 * 100) / 100
    const err = await errorOf(src.createDraft({ ...base, discount }))
    expect(err.code).toBe('DESCONTO_ACIMA_LIMITE')
    expect(err.field).toBe('discount')
    expect(ctx.db.reservations.some((r) => r.items.some((i) => i.garmentId === byName(ctx, 'Turim').id))).toBe(false)

    const exId = await authorize(auth, 'desconto_acima_limite', 'reserva_rascunho', 'tmp-1', discount)
    const r = await src.createDraft({ ...base, discount }, exId)
    expect(r.totalNet).toBe(880 - discount)
    expect(r.items.reduce((s, i) => s + i.netRevenue, 0)).toBeCloseTo(r.totalNet, 2)
    expect(r.authorizations).toEqual([expect.objectContaining({ id: exId, kind: 'desconto_acima_limite', amount: discount, reservationId: r.id })])
    expect(ctx.db.exceptions.find((e) => e.id === exId)!.reservationId).toBe(r.id)
    // A mesma exceção não serve duas vezes.
    expect((await errorOf(src.createDraft({ ...base, discount }, exId))).code).toBe('DESCONTO_ACIMA_LIMITE')
  })

  it('criar a partir da prova converte a prova e conclui o compromisso dela', async () => {
    const { ctx, src } = setup()
    const f = ctx.db.fittings.find((x) => x.state === 'em_curso')!
    const r = await src.createDraft({ ...input(ctx, ['Siena'], [3, 4, 5]), customerId: f.customerId, fittingId: f.id })
    expect(r.fittingId).toBe(f.id)
    expect(f.state).toBe('convertida')
    expect(f.reservationId).toBe(r.id)
    expect(f.endedAt).not.toBeNull()
    expect(ctx.db.appointments.filter((a) => a.fittingId === f.id).every((a) => a.state === 'concluido')).toBe(true)
  })

  it('remover a única peça do rascunho → RESERVA_SEM_PECAS', async () => {
    const { ctx, src } = setup()
    const capri = resOf(ctx, 'Capri', 'rascunho')
    expect((await errorOf(src.removeDraftItem(capri.id, capri.items[0]!.id))).code).toBe('RESERVA_SEM_PECAS')
    const r = await src.addDraftItem(capri.id, byName(ctx, 'Rimini').id)
    expect(r.items).toHaveLength(2)
    expect(r.contract?.version).toBe(1)
    const after = await src.removeDraftItem(capri.id, r.items[1]!.id)
    expect(after.items).toHaveLength(1)
    expect(after.contract!.version).toBe(2)
  })
})

describe('reservas — confirmação', () => {
  it('sem contrato assinado → CONTRATO_NAO_ASSINADO', async () => {
    const { ctx, src } = setup()
    const capri = resOf(ctx, 'Capri', 'rascunho')
    const err = await errorOf(src.confirmReservation(capri.id, { amount: capri.totalNet, method: 'pix', reference: null, notes: null }))
    expect(err.code).toBe('CONTRATO_NAO_ASSINADO')
  })

  it('uma das duas peças em conflito → { ok: false } e o mundo fica idêntico', async () => {
    const { ctx, src } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim', 'Bolonha'], [11, 12, 13]))
    await signed(src, ctx, draft.id)
    const before = snapshot(ctx)
    const res = await src.confirmReservation(draft.id, { amount: minSignal(draft.totalNet, 50), method: 'pix', reference: null, notes: null })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.conflicts.map((c) => c.garmentId)).toEqual([byName(ctx, 'Bolonha').id])
    expect(snapshot(ctx)).toEqual(before)
  })

  it('confirmar ok: blocos locação + higienização, sinal pago, saldo pendente na retirada e 3 compromissos', async () => {
    const { ctx, src } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim', 'Nápoles'], [5, 6, 8]))
    await signed(src, ctx, draft.id)
    const sinal = minSignal(draft.totalNet, 50)
    const res = await src.confirmReservation(draft.id, { amount: sinal, method: 'pix', reference: 'E2E123', notes: null })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const r = res.reservation
    expect(r.state).toBe('confirmada')
    for (const name of ['Turim', 'Nápoles']) {
      const g = byName(ctx, name)
      const mine = g.blocks.filter((b) => b.reservationId === r.id)
      expect(mine.map((b) => b.kind)).toEqual(['locacao', 'higienizacao'])
      expect(mine[0]).toMatchObject({ from: D(5), to: D(8) })
      expect(g.state).toBe('reservado')
      expect(g.history[0]!.reason).toBe(`Reserva ${r.code} confirmada`)
    }
    expect(r.payments).toEqual([
      expect.objectContaining({ kind: 'sinal', state: 'pago', amount: sinal, reference: 'E2E123' }),
      expect.objectContaining({ kind: 'saldo', state: 'pendente', amount: r.totalNet - sinal, dueAt: D(5), paidAt: null }),
    ])
    expect(r.balance).toMatchObject({ pago: sinal, due: r.totalNet - sinal, status: 'parcial' })
    const appts = ctx.db.appointments.filter((a) => a.reservationId === r.id)
    expect(appts.map((a) => [a.kind, a.startsAt.slice(0, 16), a.state])).toEqual([
      ['retirada', `${D(5)}T10:00`, 'agendado'],
      ['evento', `${D(6)}T19:00`, 'agendado'],
      ['devolucao', `${D(8)}T11:00`, 'agendado'],
    ])
    expect(r.history.at(-1)).toMatchObject({ fromState: 'rascunho', toState: 'confirmada', reason: 'Confirmação da reserva' })
  })

  it('sinal abaixo de 50% sem exceção → SINAL_INSUFICIENTE; com dispensa autorizada confirma', async () => {
    const { ctx, src, auth } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim'], [5, 6, 8]))
    await signed(src, ctx, draft.id)
    const pay = { amount: 100, method: 'pix' as const, reference: null, notes: null }
    const err = await errorOf(src.confirmReservation(draft.id, pay))
    expect(err.code).toBe('SINAL_INSUFICIENTE')
    expect(ctx.reservation(draft.id).state).toBe('rascunho')
    expect((await errorOf(src.confirmReservation(draft.id, { ...pay, amount: 0 }))).code).toBe('VALOR_INVALIDO')
    expect((await errorOf(src.confirmReservation(draft.id, { ...pay, amount: 601 }))).code).toBe('VALOR_EXCEDE_SALDO')

    const exId = await authorize(auth, 'dispensa_sinal_minimo', 'reserva', draft.id)
    const res = await src.confirmReservation(draft.id, pay, exId)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reservation.authorizations).toEqual([expect.objectContaining({ id: exId, amount: 200 })])
  })
})

describe('reservas — retirada, devolução e cancelamento', () => {
  it('retirada com saldo sem exceção → SALDO_EM_ABERTO', async () => {
    const { ctx, src } = setup()
    const sorrento = resOf(ctx, 'Sorrento', 'confirmada')
    expect(sorrento.balance.due).toBeGreaterThan(0)
    const err = await errorOf(src.pickupItems(sorrento.id, [{ itemId: sorrento.items[0]!.id, delivered: true }]))
    expect(err.code).toBe('SALDO_EM_ABERTO')
    expect(sorrento.items[0]!.itemState).toBe('pendente')
  })

  it('devolução parcial de 1 de 2 peças atrasada 1 dia: uma multa pendente de 20% × total e aguardando_devolucao', async () => {
    const { ctx, src } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim', 'Nápoles'], [-1, -1, -1]))
    await signed(src, ctx, draft.id)
    const conf = await src.confirmReservation(draft.id, { amount: draft.totalNet, method: 'pix', reference: null, notes: null })
    expect(conf.ok).toBe(true)
    const picked = await src.pickupItems(draft.id, draft.items.map((i) => ({ itemId: i.id, delivered: true })))
    expect(picked.state).toBe('em_uso')
    expect(byName(ctx, 'Turim').state).toBe('em_uso')

    const [first, second] = picked.items
    const r = await src.returnItems(draft.id, [
      { itemId: first!.id, returned: true, note: 'ok' },
      { itemId: second!.id, returned: false },
    ])
    expect(r.state).toBe('aguardando_devolucao')
    const fee = lateFee(r.totalNet, 20, 1)
    expect(r.lateFee).toBe(fee)
    const multas = r.payments.filter((p) => p.kind === 'multa')
    expect(multas).toEqual([expect.objectContaining({ state: 'pendente', amount: fee, dueAt: TODAY })])
    expect(r.balance.due).toBe(fee)
    expect(byName(ctx, 'Turim').state).toBe('inspecao')
    expect(byName(ctx, 'Nápoles').state).toBe('aguardando_devolucao')
    expect(ctx.reservation(draft.id).history.at(-1)!.toState).toBe('aguardando_devolucao')

    // Segunda devolução no mesmo dia: continua uma única multa, reserva completa vai para inspeção.
    const done = await src.returnItems(draft.id, [{ itemId: second!.id, returned: true }])
    expect(done.state).toBe('em_inspecao')
    expect(done.payments.filter((p) => p.kind === 'multa')).toHaveLength(1)
  })

  it('multa por atraso usa o % do contrato assinado, não a configuração atual (sem contrato, a configuração)', async () => {
    const { ctx, src } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim'], [-1, -1, -1]))
    await signed(src, ctx, draft.id)
    expect(ctx.reservation(draft.id).contract!.terms.lateFeeDailyPercent).toBe(20)
    await src.confirmReservation(draft.id, { amount: draft.totalNet, method: 'pix', reference: null, notes: null })
    const picked = await src.pickupItems(draft.id, draft.items.map((i) => ({ itemId: i.id, delivered: true })))
    ctx.db.settings.lateFeeDailyPercent = 5 // mudou depois da assinatura
    const r = await src.returnItems(draft.id, picked.items.map((i) => ({ itemId: i.id, returned: true })))
    expect(r.lateFee).toBe(lateFee(r.totalNet, 20, 1))
    expect(r.payments.find((p) => p.kind === 'multa')).toMatchObject({ state: 'pendente', amount: lateFee(r.totalNet, 20, 1) })
    expect(lateFeePercent({ contract: null }, ctx.db.settings)).toBe(5)
  })

  it('cancelar sem motivo → MOTIVO_OBRIGATORIO; com motivo libera blocos e compromissos', async () => {
    const { ctx, src } = setup()
    const verona = resOf(ctx, 'Verona', 'confirmada')
    expect((await errorOf(src.cancelReservation(verona.id, '  '))).code).toBe('MOTIVO_OBRIGATORIO')
    const g = byName(ctx, 'Verona')
    expect(g.blocks.some((b) => b.reservationId === verona.id)).toBe(true)
    const r = await src.cancelReservation(verona.id, 'Cliente desistiu')
    expect(r.state).toBe('cancelada')
    expect(r.cancelReason).toBe('Cliente desistiu')
    expect(g.blocks.some((b) => b.reservationId === verona.id)).toBe(false)
    expect(g.state).toBe('disponivel')
    expect(ctx.db.appointments.filter((a) => a.reservationId === verona.id).every((a) => a.state === 'cancelado')).toBe(true)
  })

  it('estado errado → ESTADO_INVALIDO', async () => {
    const { ctx, src } = setup()
    const capri = resOf(ctx, 'Capri', 'rascunho')
    expect((await errorOf(src.markReady(capri.id))).code).toBe('ESTADO_INVALIDO')
    expect((await errorOf(src.markNoShow(capri.id))).code).toBe('ESTADO_INVALIDO')
  })
})

describe('reservas — segurança (auditoria)', () => {
  it('preço da peça vem da loja: unitPrice da entrada é ignorado (novo = preço de locação; existente = congelado)', async () => {
    const { ctx, src } = setup()
    const turim = byName(ctx, 'Turim')
    const r = await src.createDraft({ ...input(ctx, ['Turim'], [5, 6, 8]), items: [{ garmentId: turim.id, unitPrice: 1 }] })
    expect(r.items[0]!.unitPrice).toBe(turim.rentalPrice)
    expect(r.totalNet).toBe(turim.rentalPrice)
    // O preço de locação muda depois: a peça que já estava mantém o preço congelado, a nova entra pelo preço atual.
    const frozen = turim.rentalPrice
    turim.rentalPrice = frozen + 100
    const napoles = byName(ctx, 'Nápoles')
    const u = await src.updateDraft(r.id, { ...input(ctx, ['Turim', 'Nápoles'], [5, 6, 8]), items: [{ garmentId: turim.id, unitPrice: 1 }, { garmentId: napoles.id, unitPrice: 1 }] })
    expect(u.items.map((i) => i.unitPrice)).toEqual([frozen, napoles.rentalPrice])
  })

  it('preço baixo na entrada não escapa do limite de desconto', async () => {
    const { ctx, src } = setup()
    const turim = byName(ctx, 'Turim')
    // 16% do preço real: com unitPrice inflado o desconto pareceria pequeno; com o real, passa do limite.
    const discount = Math.round(turim.rentalPrice * 0.16 * 100) / 100
    const err = await errorOf(src.createDraft({ ...input(ctx, ['Turim'], [5, 6, 8]), discount, items: [{ garmentId: turim.id, unitPrice: 100000 }] }))
    expect(err.code).toBe('DESCONTO_ACIMA_LIMITE')
  })

  it('exceção de desconto vale até o valor autorizado (maxAmount); sem valor não é concedida', async () => {
    const { ctx, src, auth } = setup()
    const base = input(ctx, ['Turim', 'Nápoles'], [5, 6, 8])
    expect(await auth.authorize({ email: 'julia@senzi.com.br', pin: '1234', kind: 'desconto_acima_limite', reason: 'x', refType: 'reserva_rascunho', refId: 'tmp-1' })).toEqual({ ok: false, error: 'PARAMETRO_INVALIDO' })
    const exId = await authorize(auth, 'desconto_acima_limite', 'reserva_rascunho', 'tmp-1', 150)
    const err = await errorOf(src.createDraft({ ...base, discount: 400 }, exId))
    expect([err.code, err.field]).toEqual(['DESCONTO_ACIMA_LIMITE', 'discount'])
    const r = await src.createDraft({ ...base, discount: 150 }, exId)
    expect(r.authorizations).toEqual([expect.objectContaining({ id: exId, amount: 150, maxAmount: 150 })])
  })

  it('dispensa de sinal vale até o valor autorizado', async () => {
    const { ctx, src, auth } = setup()
    const draft = await src.createDraft(input(ctx, ['Turim'], [5, 6, 8]))
    await signed(src, ctx, draft.id)
    const pay = { amount: 100, method: 'pix' as const, reference: null, notes: null }
    const exId = await authorize(auth, 'dispensa_sinal_minimo', 'reserva', draft.id, 50)
    expect((await errorOf(src.confirmReservation(draft.id, pay, exId))).code).toBe('SINAL_INSUFICIENTE')
    expect((await src.confirmReservation(draft.id, { ...pay, amount: 250 }, exId)).ok).toBe(true)
  })

  it('PIN: 10 erros em 24 h (fora da janela de 15 min) bloqueiam mesmo depois de 24 h; 9 não', async () => {
    const args = { email: 'julia@senzi.com.br', kind: 'retirada_com_saldo' as const, reason: 'teste', refType: 'reserva', refId: 'r-1' }
    const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    const nine = setup()
    for (let i = 0; i < 9; i++) nine.ctx.db.pinAttempts.push({ email: args.email, at: ago(10 - i), ok: false })
    expect((await nine.auth.authorize({ ...args, pin: '1234' })).ok).toBe(true)
    const ten = setup()
    // 10 erros entre 40 h e 31 h atrás: dentro de 24 h entre si, já fora da janela de 24 h de agora.
    for (let i = 0; i < 10; i++) ten.ctx.db.pinAttempts.push({ email: args.email, at: ago(40 - i), ok: false })
    expect(await ten.auth.authorize({ ...args, pin: '1234' })).toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
  })
})

describe('reservas — leitura', () => {
  it('lista por filtro com a ordenação da spec e resumo das ativas', async () => {
    const { src } = setup()
    const drafts = await src.listReservations('rascunhos', { limit: 50, offset: 0 })
    expect(drafts.total).toBe(2)
    expect(drafts.items.every((r) => r.payStatus === null)).toBe(true)
    const ativas = await src.listReservations('ativas', { limit: 100, offset: 0 })
    const picks = ativas.items.map((r) => r.pickupDate)
    expect([...picks].sort()).toEqual(picks)
    const closed = await src.listReservations('encerradas', { limit: 200, offset: 0 })
    const cp = closed.items.map((r) => r.pickupDate)
    expect([...cp].sort().reverse()).toEqual(cp)
    const late = (await src.listReservations('rua', { limit: 50, offset: 0 })).items.find((r) => r.daysLate > 0)!
    expect(late.daysLate).toBe(2)
    const s = await src.reservationSummary()
    expect(s.active).toBeGreaterThan(0)
    expect(s.toReceive).toBeGreaterThan(0)
  })
})

describe('autorizador de exceções da prévia', () => {
  it('PIN errado 5× → PIN_BLOQUEADO mesmo com o PIN certo na 6ª', async () => {
    const { auth } = setup()
    const args = { email: 'julia@senzi.com.br', kind: 'retirada_com_saldo' as const, reason: 'teste', refType: 'reserva', refId: 'r-1' }
    expect(await auth.listActiveAdmins()).toEqual([{ id: 'u-julia', full_name: 'Júlia Senzi', email: 'julia@senzi.com.br' }])
    for (let i = 0; i < 5; i++) expect(await auth.authorize({ ...args, pin: '0000' })).toEqual({ ok: false, error: 'AUTORIZACAO_INVALIDA' })
    expect(await auth.authorize({ ...args, pin: '1234' })).toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
  })

  it('motivo vazio → MOTIVO_OBRIGATORIO; e-mail que não é admin → AUTORIZACAO_INVALIDA', async () => {
    const { auth } = setup()
    const args = { kind: 'retirada_com_saldo' as const, refType: 'reserva', refId: 'r-1', pin: '1234' }
    expect(await auth.authorize({ ...args, email: 'julia@senzi.com.br', reason: ' ' })).toEqual({ ok: false, error: 'MOTIVO_OBRIGATORIO' })
    expect(await auth.authorize({ ...args, email: 'ana@senzi.com.br', reason: 'x' })).toEqual({ ok: false, error: 'AUTORIZACAO_INVALIDA' })
    const ok = await auth.authorize({ ...args, email: 'julia@senzi.com.br', reason: 'x' })
    expect(ok.ok).toBe(true)
  })
})

/** Rascunho assinado e confirmado com o sinal dado (padrão: o mínimo). */
async function confirmed(ctx: MockCtx, src: ReturnType<typeof reservas>, names: string[], d: [number, number, number], amount?: (net: number) => number) {
  const draft = await src.createDraft(input(ctx, names, d))
  await signed(src, ctx, draft.id)
  const res = await src.confirmReservation(draft.id, { amount: amount ? amount(draft.totalNet) : minSignal(draft.totalNet, 50), method: 'pix', reference: null, notes: null })
  if (!res.ok) throw new Error('confirmação recusada')
  return res.reservation
}
const pendings = (r: Reservation, kind: string) => r.payments.filter((p) => p.kind === kind && p.state === 'pendente')

describe('reservas — pagamentos', () => {
  it('saldo pago em parte atualiza a parcela pendente; pago no resto, quita sem duplicar', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8])
    expect(pendings(r0, 'saldo')).toEqual([expect.objectContaining({ amount: 300 })])
    const pay = { kind: 'saldo' as const, method: 'pix' as const, reference: null, notes: null }
    const r1 = await src.registerPayment(r0.id, { ...pay, amount: 100 })
    expect(pendings(r1, 'saldo')).toEqual([expect.objectContaining({ amount: 200, dueAt: D(5) })])
    expect(r1.balance).toMatchObject({ due: 200, status: 'parcial' })
    const r2 = await src.registerPayment(r0.id, { ...pay, amount: 200 })
    expect(pendings(r2, 'saldo')).toHaveLength(0)
    expect(r2.payments.filter((p) => p.kind === 'saldo').map((p) => [p.state, p.amount])).toEqual([
      ['pago', 200],
      ['pago', 100],
    ])
    expect(r2.balance).toMatchObject({ due: 0, status: 'pago' })
  })

  it('multa pendente de reserva quitada é paga como "saldo": due 0, sem multa pendente, e a devolução seguinte não a ressuscita', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim', 'Nápoles'], [-1, -1, -1], (n) => n)
    const picked = await src.pickupItems(r0.id, r0.items.map((i) => ({ itemId: i.id, delivered: true })))
    const r1 = await src.returnItems(r0.id, [{ itemId: picked.items[0]!.id, returned: true }])
    const fee = lateFee(r1.totalNet, 20, 1)
    expect(pendings(r1, 'multa')).toEqual([expect.objectContaining({ amount: fee })])
    const r2 = await src.registerPayment(r0.id, { kind: 'saldo', method: 'pix', amount: fee, reference: null, notes: null })
    expect(r2.balance).toMatchObject({ due: 0, status: 'pago' })
    expect(pendings(r2, 'multa')).toHaveLength(0)
    const r3 = await src.returnItems(r0.id, [{ itemId: picked.items[1]!.id, returned: true }])
    expect(r3.state).toBe('em_inspecao')
    expect(r3.lateFee).toBe(fee)
    expect(pendings(r3, 'multa')).toHaveLength(0)
    expect(r3.balance.due).toBe(0)
  })

  it('VALOR_EXCEDE_SALDO: tipos normais até o saldo, caução livre, estorno de caução até a retida, estorno de receita até o pago', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8])
    const p = (kind: 'saldo' | 'caucao' | 'estorno' | 'multa', amount: number, refersTo: 'caucao' | null = null) => ({ kind, method: 'pix' as const, amount, reference: null, notes: null, refersTo })
    const over = await errorOf(src.registerPayment(r0.id, p('saldo', 300.01)))
    expect(over.code).toBe('VALOR_EXCEDE_SALDO')
    expect(over.hint).toBe('R$ 300,00')
    expect((await errorOf(src.registerPayment(r0.id, p('multa', 301)))).code).toBe('VALOR_EXCEDE_SALDO')
    const withDeposit = await src.registerPayment(r0.id, p('caucao', 5000))
    expect(withDeposit.balance).toMatchObject({ caucao: 5000, due: 300 })
    expect((await errorOf(src.registerPayment(r0.id, p('estorno', 5000.01, 'caucao')))).code).toBe('VALOR_EXCEDE_SALDO')
    expect((await errorOf(src.registerPayment(r0.id, p('estorno', 300.01)))).code).toBe('VALOR_EXCEDE_SALDO')
    const refunded = await src.registerPayment(r0.id, p('estorno', 100))
    expect(refunded.balance).toMatchObject({ pago: 200, due: 400, caucao: 5000 })
    expect(pendings(refunded, 'saldo')).toEqual([expect.objectContaining({ amount: 400 })])
    expect((await errorOf(src.registerPayment(r0.id, p('saldo', 0)))).code).toBe('VALOR_INVALIDO')
  })

  it('devolver caução: só depois de encerrada; reduz a caução e não mexe no saldo', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8])
    await src.registerPayment(r0.id, { kind: 'caucao', method: 'pix', amount: 150, reference: null, notes: null })
    expect((await errorOf(src.returnDeposit(r0.id, 'pix'))).code).toBe('ESTADO_INVALIDO')
    const cancelled = await src.cancelReservation(r0.id, 'Cliente desistiu')
    expect(cancelled.balance.caucao).toBe(150)
    const back = await src.returnDeposit(r0.id, 'pix')
    expect(back.balance.caucao).toBe(0)
    expect(back.balance.due).toBe(cancelled.balance.due)
    expect(back.balance.pago).toBe(cancelled.balance.pago)
    expect(back.payments.at(-1)).toMatchObject({ kind: 'estorno', refersTo: 'caucao', amount: 150, state: 'pago' })
    expect((await errorOf(src.returnDeposit(r0.id, 'pix'))).code).toBe('VALOR_INVALIDO')
  })

  it('devolver caução retendo parte: estorna o resto, zera a custódia e lança a retenção como receita', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8])
    await src.registerPayment(r0.id, { kind: 'caucao', method: 'dinheiro', amount: 300, reference: null, notes: null })
    const cancelled = await src.cancelReservation(r0.id, 'Cliente desistiu')
    expect((await errorOf(src.returnDeposit(r0.id, 'pix', { amount: 80, reason: ' ' }))).code).toBe('MOTIVO_OBRIGATORIO')
    expect((await errorOf(src.returnDeposit(r0.id, 'pix', { amount: 300.01, reason: 'Mancha' }))).code).toBe('VALOR_EXCEDE_SALDO')
    const back = await src.returnDeposit(r0.id, 'pix', { amount: 80, reason: 'Mancha de vinho na barra' })
    expect(back.balance).toMatchObject({ caucao: 0, pago: cancelled.balance.pago, due: cancelled.balance.due })
    expect(back.payments.slice(-2)).toEqual([
      expect.objectContaining({ kind: 'estorno', refersTo: 'caucao', method: 'pix', amount: 220 }),
      expect.objectContaining({ kind: 'estorno', refersTo: 'caucao', amount: 80 }),
    ])
    expect(ctx.db.receivables.at(-1)).toMatchObject({ description: `Retenção de caução · ${r0.code}`, reservationId: r0.id, amount: 80, paidAmount: 80, status: 'pago', method: 'dinheiro', isCustody: false })
  })

  it('reter a caução inteira não lança estorno para a cliente', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8])
    await src.registerPayment(r0.id, { kind: 'caucao', method: 'pix', amount: 150, reference: null, notes: null })
    await src.cancelReservation(r0.id, 'Cliente desistiu')
    const before = (await src.getReservation(r0.id))!.payments.length
    const back = await src.returnDeposit(r0.id, 'pix', { amount: 150, reason: 'Peça não devolvida' })
    expect(back.payments).toHaveLength(before + 1)
    expect(back.balance.caucao).toBe(0)
  })
})

describe('reservas — revisão', () => {
  it('devolução completa com peça que nunca saiu: item vira não entregue e a agenda da peça é liberada', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim', 'Nápoles'], [-1, 0, 1], (n) => n)
    expect(byName(ctx, 'Nápoles').state).toBe('reservado')
    const [turim, napoles] = r0.items
    const partial = await src.pickupItems(r0.id, [{ itemId: turim!.id, delivered: true }])
    expect(partial.state).toBe('retirada')
    const done = await src.returnItems(r0.id, [{ itemId: turim!.id, returned: true }])
    expect(done.state).toBe('em_inspecao')
    expect(done.items.find((i) => i.id === napoles!.id)).toMatchObject({ itemState: 'nao_entregue', pickupNote: 'Não entregue na retirada' })
    const g = byName(ctx, 'Nápoles')
    expect(g.blocks.some((b) => b.reservationId === r0.id)).toBe(false)
    expect(g.state).toBe('disponivel')
  })

  it('retirada antecipada: a locação passa a começar hoje e a agenda mostra retirada e devolução quando aconteceram', async () => {
    const { ctx, src } = setup()
    const r0 = await confirmed(ctx, src, ['Turim'], [5, 6, 8], (n) => n)
    await src.pickupItems(r0.id, r0.items.map((i) => ({ itemId: i.id, delivered: true })))
    const loc = () => byName(ctx, 'Turim').blocks.find((b) => b.reservationId === r0.id && b.kind === 'locacao')!
    expect(loc().from).toBe(TODAY)
    const appt = (kind: string) => ctx.db.appointments.find((a) => a.reservationId === r0.id && a.kind === kind)!
    expect(appt('retirada')).toMatchObject({ state: 'concluido', startsAt: expect.stringMatching(new RegExp(`^${TODAY}`)) })
    await src.returnItems(r0.id, r0.items.map((i) => ({ itemId: i.id, returned: true })))
    expect(loc()).toMatchObject({ from: TODAY, to: TODAY })
    expect(appt('devolucao')).toMatchObject({ state: 'concluido', startsAt: expect.stringMatching(new RegExp(`^${TODAY}`)) })
    expect(appt('evento').startsAt.startsWith(D(6))).toBe(true)
  })

  it('retirada antecipada não passa por cima de outro compromisso da peça', async () => {
    const { ctx, src } = setup()
    await confirmed(ctx, src, ['Turim'], [1, 1, 2], (n) => n)
    const later = await confirmed(ctx, src, ['Turim'], [9, 10, 11], (n) => n)
    const err = await errorOf(src.pickupItems(later.id, later.items.map((i) => ({ itemId: i.id, delivered: true }))))
    expect(err.code).toBe('CONFLITO_AGENDA')
    expect(byName(ctx, 'Turim').blocks.find((b) => b.reservationId === later.id && b.kind === 'locacao')!.from).toBe(D(9))
  })

  it('editar rascunho com contrato assinado registra a troca de versão no histórico', async () => {
    const { ctx, src } = setup()
    const bolonha = resOf(ctx, 'Bolonha', 'rascunho')
    await signed(src, ctx, bolonha.id)
    const r = await src.updateDraft(bolonha.id, {
      customerId: bolonha.customerId,
      eventDate: bolonha.eventDate!,
      pickupDate: bolonha.pickupDate,
      returnDueDate: bolonha.returnDueDate,
      discount: 0,
      notes: 'Mudou o evento',
      items: bolonha.items.map((i) => ({ garmentId: i.garmentId, unitPrice: i.unitPrice })),
    })
    expect(r.contract).toMatchObject({ version: 2, signedAt: null })
    expect(r.history.at(-1)).toMatchObject({ fromState: null, toState: 'rascunho', reason: 'Contrato v1 assinado substituído pela v2' })
  })
})
