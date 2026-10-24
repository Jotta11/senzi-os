/** Contas a receber em memória: parcelas das reservas (derivadas) + lançamentos avulsos (spec §2.3.2, §2.3.3). */
import { allReceivables, falta, isOpenReceivable, receivableStatus } from '@/domain/finance'
import { round2 } from '@/domain/money'
import { brl } from '@/lib/format'
import type { FinanceiroSource } from '../source-financeiro'
import { SourceError, type Receivable, type SourceIssue } from '../types'
import { at } from './constants'
import { storeTime, type MockCtx } from './context'
import { commonIssues, dueIn7, failWith, inWindow, matches, settleDateIssue } from './financeiro-shared'

type Receber = Pick<FinanceiroSource, 'listReceivables' | 'createReceivable' | 'updateReceivable' | 'receiveReceivable' | 'cancelReceivable'>

export function financeiroReceber(ctx: MockCtx): Receber {
  const { db, today, run, newId } = ctx
  const sum = (rows: Receivable[]) => round2(rows.reduce((s, r) => s + falta(r), 0))
  const avulso = (id: string): Receivable => {
    const r = db.receivables.find((x) => x.id === id)
    if (r) return r
    if (allReceivables(db, today).some((x) => x.id === id)) throw new SourceError('ESTADO_INVALIDO')
    throw new SourceError('NAO_ENCONTRADO')
  }
  const dayKey = (r: Receivable) => r.receivedAt ?? r.dueDate

  return {
    listReceivables: (f) =>
      run(() => {
        const all = allReceivables(db, today)
        const money = all.filter((r) => !r.isCustody)
        const open = money.filter(isOpenReceivable)
        const overdue = open.filter((r) => receivableStatus(r, today) === 'vencido')
        const received = money.filter((r) => r.paidAmount > 0 && r.status !== 'cancelado' && inWindow(dayKey(r), true, f.range, today))
        const rows = all
          .filter((r) => {
            const st = receivableStatus(r, today)
            if (f.status === 'abertas' && !(isOpenReceivable(r) && !r.isCustody)) return false
            if (f.status === 'vencidas' && !(st === 'vencido' && !r.isCustody)) return false
            if (f.status === 'recebidas' && r.status !== 'pago') return false
            if (f.origin === 'reservas' && r.source !== 'reserva') return false
            if (f.origin === 'avulsas' && r.source !== 'avulso') return false
            if (f.categoryId && r.categoryId !== f.categoryId) return false
            if (f.status === 'recebidas' || f.status === 'todas') {
              if (!inWindow(dayKey(r), r.status === 'pago', f.range, today)) return false
            }
            return matches(f.q, r.description, r.customerName, r.payerName, r.reservationCode)
          })
          .sort((a, b) => (f.status === 'recebidas' ? (b.receivedAt ?? '').localeCompare(a.receivedAt ?? '') : f.status === 'todas' ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate)))
        return {
          rows,
          total: rows.length,
          today,
          totals: {
            open: sum(open),
            overdue: sum(overdue),
            dueIn7: sum(open.filter((r) => dueIn7(r.dueDate, today))),
            receivedInRange: round2(received.reduce((s, r) => s + r.paidAmount, 0)),
          },
        }
      }),

    createReceivable: (i) =>
      run(() => {
        const issues = commonIssues(ctx, i, 'receita')
        const d = i.received ? settleDateIssue(ctx, i.receivedAt, 'receivedAt') : null
        failWith(d ? [...issues, d] : issues)
        const cust = i.customerId ? ctx.customer(i.customerId) : null
        const amount = round2(i.amount)
        const r: Receivable = {
          id: newId('rc'),
          source: 'avulso',
          kind: 'avulso',
          description: i.description.trim(),
          categoryId: i.categoryId,
          reservationId: null,
          reservationCode: null,
          customerId: cust?.id ?? null,
          customerName: cust?.fullName ?? null,
          payerName: cust ? null : i.payerName?.trim() || null,
          amount,
          paidAmount: i.received ? amount : 0,
          dueDate: i.dueDate,
          status: i.received ? 'pago' : 'aberto',
          receivedAt: i.received ? at(i.receivedAt!, storeTime()) : null,
          method: i.received ? (i.method ?? 'pix') : null,
          isCustody: false,
          notes: i.notes?.trim() || null,
        }
        db.receivables.push(r)
        return r
      }),

    updateReceivable: (id, input) =>
      run(() => {
        const r = avulso(id)
        if (r.status !== 'aberto' && r.status !== 'parcial') throw new SourceError('ESTADO_INVALIDO')
        const next = { description: r.description, categoryId: r.categoryId ?? undefined, amount: r.amount, dueDate: r.dueDate, ...input }
        const issues = commonIssues(ctx, next, 'receita')
        if (!issues.some((x) => x.field === 'amount') && next.amount < r.paidAmount) issues.push({ code: 'VALOR_INVALIDO', field: 'amount' })
        failWith(issues)
        const cust = input.customerId === undefined ? undefined : input.customerId ? ctx.customer(input.customerId) : null
        Object.assign(r, {
          description: next.description.trim(),
          categoryId: next.categoryId,
          amount: round2(next.amount),
          dueDate: next.dueDate,
          ...(cust !== undefined ? { customerId: cust?.id ?? null, customerName: cust?.fullName ?? null } : {}),
          ...(input.payerName !== undefined ? { payerName: input.payerName?.trim() || null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        })
        if (r.paidAmount >= r.amount - 0.005) r.status = 'pago'
        return r
      }),

    receiveReceivable: (id, i) =>
      run(() => {
        const r = avulso(id)
        if (r.status !== 'aberto' && r.status !== 'parcial') throw new SourceError('ESTADO_INVALIDO')
        const issues: SourceIssue[] = []
        if (!Number.isFinite(i.amount) || i.amount <= 0) issues.push({ code: 'VALOR_INVALIDO', field: 'amount' })
        else if (i.amount > falta(r) + 0.005) issues.push({ code: 'VALOR_EXCEDE_SALDO', field: 'amount' })
        const d = settleDateIssue(ctx, i.receivedAt, 'receivedAt')
        if (d) issues.push(d)
        if (issues.length) ctx.fail(issues, brl(falta(r)))
        r.paidAmount = round2(r.paidAmount + i.amount)
        r.status = r.paidAmount >= r.amount - 0.005 ? 'pago' : 'parcial'
        r.receivedAt = at(i.receivedAt, storeTime())
        r.method = i.method
        if (i.notes?.trim()) r.notes = i.notes.trim()
        return r
      }),

    cancelReceivable: (id) =>
      run(() => {
        const r = avulso(id)
        if (r.status !== 'aberto' && r.status !== 'parcial') throw new SourceError('ESTADO_INVALIDO')
        r.status = 'cancelado'
        return r
      }),
  }
}
