/**
 * Lançamentos da reserva na fonte em memória (spec reservas §3.4, §4.3, Decisão 6): sinal, saldo, integral,
 * caução, multa e estorno; parcela pendente do mesmo tipo é quitada em vez de duplicada; estorno da caução
 * (`refersTo: 'caucao'`) não mexe no saldo.
 */
import { CLOSED_RESERVATION_STATES } from '@/data/labels'
import { balance, round2 } from '@/domain/money'
import { brl } from '@/lib/format'
import type { ReservasSource } from '../source-reservas'
import { SourceError, type Payment, type PaymentInput, type Reservation } from '../types'
import type { MockCtx } from './context'
import type { ReservaKit } from './reservas-shared'

type Payments = Pick<ReservasSource, 'registerPayment' | 'returnDeposit'>

export function reservasPayments(ctx: MockCtx, kit: ReservaKit): Payments {
  const { run, fail } = ctx

  function paid(r: Reservation, input: PaymentInput): Payment {
    const now = ctx.now()
    return {
      id: ctx.newId('pay'),
      reservationId: r.id,
      kind: input.kind,
      method: input.method,
      amount: round2(input.amount),
      state: 'pago',
      paidAt: now,
      dueAt: null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      refersTo: input.refersTo ?? null,
      createdBy: ctx.userId(),
      createdAt: now,
    }
  }

  return {
    registerPayment: (id, input) =>
      run(() => {
        const r = ctx.reservation(id)
        if (r.state === 'rascunho' || ((r.state === 'cancelada' || r.state === 'no_show') && input.kind !== 'estorno')) throw new SourceError('ESTADO_INVALIDO')
        if (!Number.isFinite(input.amount) || input.amount <= 0) fail([{ code: 'VALOR_INVALIDO', field: 'amount' }])
        if (input.refersTo === 'caucao' && input.kind !== 'estorno') fail([{ code: 'PARAMETRO_INVALIDO', field: 'refersTo' }])
        const b = balance(r.totalNet, r.lateFee, r.payments)
        const limit = input.kind === 'caucao' ? Infinity : input.kind !== 'estorno' ? b.due : input.refersTo === 'caucao' ? b.caucao : b.pago
        if (input.amount > limit + 0.005) fail([{ code: 'VALOR_EXCEDE_SALDO', field: 'amount' }], brl(limit))

        const pending = input.kind === 'saldo' || input.kind === 'multa' ? r.payments.find((p) => p.kind === input.kind && p.state === 'pendente') : undefined
        if (pending && input.amount >= pending.amount - 0.005) Object.assign(pending, { ...paid(r, input), id: pending.id, dueAt: pending.dueAt, createdAt: pending.createdAt })
        else r.payments.push(paid(r, input))
        kit.syncPending(r)
        return kit.refresh(r)
      }),

    returnDeposit: (id, method) =>
      run(() => {
        const r = ctx.reservation(id)
        if (!CLOSED_RESERVATION_STATES.includes(r.state)) throw new SourceError('ESTADO_INVALIDO')
        const held = balance(r.totalNet, r.lateFee, r.payments).caucao
        if (held <= 0) fail([{ code: 'VALOR_INVALIDO', field: 'amount' }])
        r.payments.push(paid(r, { kind: 'estorno', method, amount: held, reference: null, notes: 'Devolução da caução', refersTo: 'caucao' }))
        return kit.refresh(r)
      }),
  }
}
