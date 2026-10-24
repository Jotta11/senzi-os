/** Contas a pagar em memória (spec §2.3.4, §2.3.5): lançamento manual, baixa integral e recorrência. Despesas automáticas são somente leitura. */
import { nextRecurrence, payableStatus } from '@/domain/finance'
import { round2 } from '@/domain/money'
import type { FinanceiroSource, PayableInput } from '../source-financeiro'
import { SourceError, type Payable } from '../types'
import { at } from './constants'
import { storeTime, type MockCtx } from './context'
import { commonIssues, dueIn7, failWith, inWindow, matches, settleDateIssue } from './financeiro-shared'

type Pagar = Pick<FinanceiroSource, 'listPayables' | 'createPayable' | 'updatePayable' | 'payPayable' | 'deletePayable'>

const paidValue = (p: Payable): number => p.paidAmount ?? p.amount

export function financeiroPagar(ctx: MockCtx): Pagar {
  const { db, today, run, newId } = ctx
  const find = (id: string): Payable => {
    const p = db.payables.find((x) => x.id === id)
    if (!p) throw new SourceError('NAO_ENCONTRADO')
    return p
  }
  const manualOpen = (id: string): Payable => {
    const p = find(id)
    if (p.source !== 'manual' || p.status !== 'aberta') throw new SourceError('ESTADO_INVALIDO')
    return p
  }
  const sum = (rows: Payable[], v: (p: Payable) => number) => round2(rows.reduce((s, p) => s + v(p), 0))

  /** Valida a recorrência: data final anterior ao vencimento é erro. */
  const endIssue = (i: { recurrence?: PayableInput['recurrence']; recurrenceEnd?: string | null; dueDate?: string }) =>
    i.recurrence && i.recurrence !== 'nenhuma' && i.recurrenceEnd && i.dueDate && i.recurrenceEnd < i.dueDate ? [{ code: 'RECORRENCIA_FIM_INVALIDO' as const, field: 'recurrenceEnd' }] : []

  /** Ao pagar uma ocorrência recorrente nasce a próxima (mesma descrição/valor), até a data final. */
  function spawnNext(p: Payable): void {
    if (p.recurrence === 'nenhuma') return
    const rootId = p.recurrenceParentId ?? p.id
    const root = db.payables.find((x) => x.id === rootId) ?? p
    const next = nextRecurrence(p.dueDate, p.recurrence, Number(root.dueDate.slice(8, 10)))
    if (!next || (p.recurrenceEnd && next > p.recurrenceEnd)) return
    if (db.payables.some((x) => (x.id === rootId || x.recurrenceParentId === rootId) && x.dueDate === next && x.status !== 'cancelada')) return
    db.payables.push({ ...p, id: newId('pg'), dueDate: next, status: 'aberta', paidAt: null, paidAmount: null, method: null, recurrenceParentId: rootId, createdAt: ctx.now(), createdBy: ctx.userId() })
  }

  return {
    listPayables: (f) =>
      run(() => {
        const all = db.payables
        const open = all.filter((p) => p.status === 'aberta')
        const paid = all.filter((p) => p.status === 'paga')
        const rows = all
          .filter((p) => {
            const st = payableStatus(p, today)
            if (f.status === 'abertas' && p.status !== 'aberta') return false
            if (f.status === 'vencidas' && st !== 'vencida') return false
            if (f.status === 'pagas' && p.status !== 'paga') return false
            if (f.categoryId && p.categoryId !== f.categoryId) return false
            if (f.recurrence === 'unica' && p.recurrence !== 'nenhuma') return false
            if (f.recurrence === 'recorrente' && p.recurrence === 'nenhuma') return false
            if ((f.status === 'pagas' || f.status === 'todas') && !inWindow(p.paidAt ?? p.dueDate, p.status === 'paga', f.range, today)) return false
            return matches(f.q, p.description, p.supplier)
          })
          .sort((a, b) => (f.status === 'pagas' ? (b.paidAt ?? '').localeCompare(a.paidAt ?? '') : f.status === 'todas' ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate)))
        return {
          rows,
          total: rows.length,
          today,
          totals: {
            open: sum(open, (p) => p.amount),
            overdue: sum(open.filter((p) => p.dueDate < today), (p) => p.amount),
            dueIn7: sum(open.filter((p) => dueIn7(p.dueDate, today)), (p) => p.amount),
            paidInRange: sum(paid.filter((p) => inWindow(p.paidAt ?? p.dueDate, true, f.range, today)), paidValue),
          },
        }
      }),

    createPayable: (i) =>
      run(() => {
        const issues = [...commonIssues(ctx, i, 'despesa'), ...endIssue(i)]
        const d = i.paid ? settleDateIssue(ctx, i.paidAt, 'paidAt') : null
        failWith(d ? [...issues, d] : issues)
        const recurrence = i.recurrence ?? 'nenhuma'
        const amount = round2(i.amount)
        const p: Payable = {
          id: newId('pg'),
          description: i.description.trim(),
          supplier: i.supplier?.trim() || null,
          categoryId: i.categoryId,
          amount,
          dueDate: i.dueDate,
          status: i.paid ? 'paga' : 'aberta',
          paidAt: i.paid ? at(i.paidAt!, storeTime()) : null,
          paidAmount: i.paid ? amount : null,
          method: i.paid ? (i.method ?? 'pix') : null,
          recurrence,
          recurrenceEnd: recurrence === 'nenhuma' ? null : i.recurrenceEnd || null,
          recurrenceParentId: null,
          source: 'manual',
          garmentId: null,
          maintenanceId: null,
          reservationId: null,
          notes: i.notes?.trim() || null,
          createdBy: ctx.userId(),
          createdAt: ctx.now(),
        }
        db.payables.push(p)
        if (i.paid) spawnNext(p)
        return p
      }),

    updatePayable: (id, input) =>
      run(() => {
        const p = manualOpen(id)
        const next = { ...p, ...input }
        failWith([...commonIssues(ctx, next, 'despesa'), ...endIssue(next)])
        Object.assign(p, {
          description: next.description.trim(),
          supplier: next.supplier?.trim() || null,
          categoryId: next.categoryId,
          amount: round2(next.amount),
          dueDate: next.dueDate,
          recurrence: next.recurrence ?? 'nenhuma',
          recurrenceEnd: next.recurrence && next.recurrence !== 'nenhuma' ? next.recurrenceEnd || null : null,
          notes: next.notes?.trim() || null,
        })
        return p
      }),

    payPayable: (id, i) =>
      run(() => {
        const p = find(id)
        if (p.status !== 'aberta') throw new SourceError('ESTADO_INVALIDO')
        const issues = []
        if (!Number.isFinite(i.paidAmount) || i.paidAmount <= 0) issues.push({ code: 'VALOR_INVALIDO' as const, field: 'paidAmount' })
        const d = settleDateIssue(ctx, i.paidAt, 'paidAt')
        failWith(d ? [...issues, d] : issues)
        Object.assign(p, { status: 'paga', paidAt: at(i.paidAt, storeTime()), paidAmount: round2(i.paidAmount), method: i.method, notes: i.notes?.trim() || p.notes })
        spawnNext(p)
        return p
      }),

    deletePayable: (id) =>
      run(() => {
        const p = find(id)
        if (p.source !== 'manual') throw new SourceError('ESTADO_INVALIDO')
        db.payables.splice(db.payables.indexOf(p), 1)
      }),
  }
}
