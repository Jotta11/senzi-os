/**
 * Lançamentos da reserva na fonte em memória (spec reservas §3.4, §4.3, Decisão 6): sinal, saldo, integral,
 * caução, multa e estorno; parcela pendente do mesmo tipo é quitada em vez de duplicada; estorno da caução
 * (`refersTo: 'caucao'`) não mexe no saldo. Caução retida (dano, perda) sai da custódia e vira receita avulsa
 * "Retenção de caução" da reserva, na categoria Locação.
 */
import { CLOSED_RESERVATION_STATES } from '@/data/labels'
import { systemCategoryId } from '@/domain/fin-categories'
import { balance, round2 } from '@/domain/money'
import { brl } from '@/lib/format'
import type { ReservasSource } from '../source-reservas'
import { SourceError, type Payment, type PaymentInput, type Reservation } from '../types'
import type { MockCtx } from './context'
import type { ReservaKit } from './reservas-shared'

type Payments = Pick<ReservasSource, 'registerPayment' | 'returnDeposit'>

export function reservasPayments(ctx: MockCtx, kit: ReservaKit): Payments {
  const { db, run, fail } = ctx

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

    returnDeposit: (id, method, retain) =>
      run(() => {
        const r = ctx.reservation(id)
        if (!CLOSED_RESERVATION_STATES.includes(r.state)) throw new SourceError('ESTADO_INVALIDO')
        const held = balance(r.totalNet, r.lateFee, r.payments).caucao
        if (held <= 0) fail([{ code: 'VALOR_INVALIDO', field: 'amount' }])
        const kept = round2(retain?.amount ?? 0)
        const reason = retain?.reason.trim() ?? ''
        if (!Number.isFinite(kept) || kept < 0) fail([{ code: 'VALOR_INVALIDO', field: 'retainAmount' }])
        if (kept > held + 0.005) fail([{ code: 'VALOR_EXCEDE_SALDO', field: 'retainAmount' }], brl(held))
        if (kept > 0 && !reason) fail([{ code: 'MOTIVO_OBRIGATORIO', field: 'retainReason' }])

        const back = round2(held - kept)
        if (back > 0) r.payments.push(paid(r, { kind: 'estorno', method, amount: back, reference: null, notes: 'Devolução da caução', refersTo: 'caucao' }))
        if (kept > 0) {
          // A parte retida não volta para a cliente: sai da custódia (sem caixa) e entra como receita da loja.
          r.payments.push(paid(r, { kind: 'estorno', method: 'outro', amount: kept, reference: null, notes: `Retida pela loja: ${reason}`, refersTo: 'caucao' }))
          const now = ctx.now()
          const caucaoMethod = r.payments.find((p) => p.kind === 'caucao' && p.state === 'pago')?.method ?? method
          db.receivables.push({
            id: ctx.newId('rc'),
            source: 'avulso',
            kind: 'avulso',
            description: `Retenção de caução · ${r.code}`,
            categoryId: systemCategoryId(db.finCategories, 'locacao'),
            reservationId: r.id,
            reservationCode: r.code,
            customerId: r.customerId,
            customerName: ctx.customer(r.customerId).fullName,
            payerName: null,
            amount: kept,
            paidAmount: kept,
            dueDate: now.slice(0, 10),
            status: 'pago',
            receivedAt: now,
            method: caucaoMethod,
            isCustody: false,
            notes: reason,
          })
        }
        return kit.refresh(r)
      }),
  }
}
