import { allReceivables, falta, isOpenReceivable } from '@/domain/finance'
import { lateFee, minSignal, openReceivableDue, round2 } from '@/domain/money'
import { addDays } from '@/lib/format'
import { createMockSource } from '../mockSource'
import type { DataSource } from '../source'
import type { Reservation } from '../types'
import { createMockCtx } from './context'

const TODAY = '2026-10-24'
const D = (n: number) => addDays(TODAY, n)
const ALL = { status: 'todas', origin: 'todas', categoryId: null, q: '', range: 'tudo' } as const

/**
 * "A receber" é um número só (regra `openReceivableDue` / parcelas abertas de reserva):
 * - Financeiro · Visão geral `toReceive` = Contas a receber `totals.open` (parcelas de reserva + avulsos em aberto);
 * - Reservas (cabeçalho) `toReceive` = Visão geral `toReceiveReservations` = `toReceive` − avulsos em aberto;
 * - Σ "Falta" das linhas da Visão geral = `toReceiveReservations`.
 */
async function expectConsistent(src: DataSource) {
  const o = await src.financeOverview('30')
  const rec = await src.listReceivables(ALL)
  const res = await src.reservationSummary()
  const avulsos = round2(rec.rows.filter((r) => r.source === 'avulso' && isOpenReceivable(r)).reduce((s, r) => s + falta(r), 0))
  expect(o.toReceive).toBe(rec.totals.open)
  expect(res.toReceive).toBe(o.toReceiveReservations)
  expect(round2(o.toReceive - avulsos)).toBe(res.toReceive)
  expect(round2(o.receivableRows.reduce((s, r) => s + r.due, 0))).toBe(o.toReceiveReservations)
  // "Cobranças lançadas e pendentes" nunca repete o que já está na "Falta" de uma linha
  const inRows = new Set(o.receivableRows.map((r) => r.code))
  const pendingFromRows = rec.rows.filter((r) => r.source === 'reserva' && isOpenReceivable(r) && inRows.has(r.reservationCode!))
  expect(o.pendingCharges.filter((c) => pendingFromRows.some((p) => p.kind === c.kind && p.amount === c.amount && p.customerName === c.customerName))).toEqual([])
  return o
}

describe('A receber — um número só em Financeiro, Contas a receber e Reservas', () => {
  it('mundo padrão: Σ parcelas abertas de cada reserva = openReceivableDue (0 em rascunho/cancelada/no-show)', () => {
    const ctx = createMockCtx({ latencyMs: 0, today: TODAY })
    const parcels = allReceivables(ctx.db).filter((r) => r.source === 'reserva' && isOpenReceivable(r))
    for (const r of ctx.db.reservations) {
      const open = round2(parcels.filter((p) => p.reservationId === r.id).reduce((s, p) => s + falta(p), 0))
      expect({ code: r.code, state: r.state, open }).toEqual({ code: r.code, state: r.state, open: openReceivableDue(r) })
    }
    for (const r of ctx.db.reservations.filter((x) => x.state === 'cancelada' || x.state === 'no_show' || x.state === 'rascunho')) expect(openReceivableDue(r)).toBe(0)
  })

  it('confirmar, pagar, retirar, devolver com atraso e cancelar mantêm os três números iguais', async () => {
    const src = createMockSource({ latencyMs: 0, today: TODAY })
    await expectConsistent(src)

    const garments = (await src.searchGarments({ q: 'Turim' }, { limit: 5, offset: 0 })).items
    const turim = garments.find((g) => g.name.endsWith(' Turim'))!
    const customers = (await src.searchCustomers('', 'nome', { limit: 1, offset: 0 })).items
    const draft = await src.createDraft({
      customerId: customers[0]!.id,
      pickupDate: D(-1),
      eventDate: D(-1),
      returnDueDate: D(-1),
      eventType: 'Casamento',
      discount: 0,
      items: [{ garmentId: turim.id, unitPrice: turim.rentalPrice }],
    })
    await expectConsistent(src)

    await src.markContractSigned(draft.id, { signedAt: TODAY, signerName: 'Cliente', notes: null })
    const sinal = minSignal(draft.totalNet, 50)
    const conf = await src.confirmReservation(draft.id, { amount: sinal, method: 'pix', reference: null, notes: null })
    expect(conf.ok).toBe(true)
    let o = await expectConsistent(src)
    expect(o.receivableRows.find((r) => r.reservationId === draft.id)?.due).toBe(round2(draft.totalNet - sinal))

    await src.registerPayment(draft.id, { kind: 'saldo', method: 'pix', amount: round2(draft.totalNet - sinal), reference: null, notes: null })
    o = await expectConsistent(src)
    expect(o.receivableRows.some((r) => r.reservationId === draft.id)).toBe(false)

    const picked = await src.pickupItems(draft.id, draft.items.map((i) => ({ itemId: i.id, delivered: true })))
    await expectConsistent(src)

    // devolução completa com 1 dia de atraso: em_inspecao com multa pendente — continua "a receber" em todo lugar
    const back: Reservation = await src.returnItems(draft.id, picked.items.map((i) => ({ itemId: i.id, returned: true })))
    expect(back.state).toBe('em_inspecao')
    const fee = lateFee(draft.totalNet, back.contract!.terms.lateFeeDailyPercent, 1)
    o = await expectConsistent(src)
    expect(o.receivableRows.find((r) => r.reservationId === draft.id)?.due).toBe(fee)
    expect((await src.listReceivables(ALL)).rows.some((r) => r.reservationId === draft.id && r.kind === 'multa' && r.status === 'aberto')).toBe(true)

    // cancelar uma reserva confirmada com saldo: sai dos três
    const conf2 = (await src.listReservations('ativas', { limit: 500, offset: 0 })).items.find((r) => r.state === 'confirmada' && r.due > 0)!
    await src.cancelReservation(conf2.id, 'Cliente desistiu')
    o = await expectConsistent(src)
    expect(o.receivableRows.some((r) => r.reservationId === conf2.id)).toBe(false)
  })

  it('devolução parcial atrasada: a multa fica na "Falta" da linha e não se repete em "Cobranças lançadas e pendentes"', async () => {
    const src = createMockSource({ latencyMs: 0, today: TODAY })
    const row = (await src.listReservations('todas', { limit: 500, offset: 0 })).items.find((r) => r.state === 'aguardando_devolucao')!
    const o = await expectConsistent(src)
    expect(o.receivableRows.some((r) => r.reservationId === row.id)).toBe(true)
    expect(o.pendingCharges.some((c) => c.kind === 'multa' && c.customerName === row.customerName)).toBe(false)
  })
})
