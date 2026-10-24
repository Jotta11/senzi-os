/**
 * Regras do Financeiro em regime de caixa (spec `operacao-financeiro.md` §2.4): parcelas de reserva derivadas,
 * status derivados, recorrência e visão geral. Funções puras sobre o mundo; "hoje" sempre vem de fora.
 */
import { ACTIVE_RESERVATION_STATES, PAYMENT_METHOD } from '@/data/labels-ops'
import type { World } from '@/data/fixture'
import { FIN_CAT } from '@/data/fixture/finance'
import type { FinanceOverview, FinanceRange, Payable, Payment, PaymentMethod, Receivable, ReceivableStatus, Recurrence, Reservation } from '@/data/types'
import { addDays } from '@/lib/format'
import { balance, round2 } from './money'

type FinanceWorld = Pick<World, 'reservations' | 'customers' | 'receivables' | 'payables'>

const day = (iso: string): string => iso.slice(0, 10)
const OPERATING_CATEGORIES: string[] = [FIN_CAT.higienizacao, FIN_CAT.ajuste, FIN_CAT.manutencao]
const REVENUE_KINDS = ['sinal', 'saldo', 'integral', 'multa']

/** `vencido` = aberto/parcial com vencimento antes de hoje. */
export function receivableStatus(r: { status: ReceivableStatus; dueDate: string }, today: string): ReceivableStatus | 'vencido' {
  return (r.status === 'aberto' || r.status === 'parcial') && r.dueDate < today ? 'vencido' : r.status
}

/** `vencida` = aberta com vencimento antes de hoje. */
export function payableStatus(p: Pick<Payable, 'status' | 'dueDate'>, today: string): Payable['status'] | 'vencida' {
  return p.status === 'aberta' && p.dueDate < today ? 'vencida' : p.status
}

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Próximo vencimento. Mensal/anual preservam o dia e caem no último dia do mês quando ele não existe
 * (31/01 → 28/02); `anchorDay` (dia da 1ª ocorrência) devolve o dia 31 em março. `nenhuma` → `null`.
 */
export function nextRecurrence(dueDate: string, recurrence: Recurrence, anchorDay?: number): string | null {
  if (recurrence === 'nenhuma') return null
  if (recurrence === 'semanal') return addDays(dueDate, 7)
  const y = Number(dueDate.slice(0, 4))
  const m = Number(dueDate.slice(5, 7))
  const d = Math.max(anchorDay ?? 0, Number(dueDate.slice(8, 10)))
  const ny = recurrence === 'anual' ? y + 1 : m === 12 ? y + 1 : y
  const nm = recurrence === 'anual' ? m : m === 12 ? 1 : m + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`
}

/** Pagamentos de reserva que viram parcela (estorno não é parcela). */
const PARCEL_KINDS = ['sinal', 'saldo', 'integral', 'caucao', 'multa']
const KIND_LABEL: Record<string, string> = { sinal: 'Sinal', saldo: 'Saldo', integral: 'Integral', caucao: 'Caução', multa: 'Multa por atraso' }

function parcel(r: Reservation, p: Payment, customerName: string | null): Receivable {
  const cancelled = p.state === 'cancelado' || p.state === 'estornado' || (p.state === 'pendente' && (r.state === 'cancelada' || r.state === 'no_show'))
  const paid = p.state === 'pago'
  return {
    id: p.id,
    source: 'reserva',
    kind: p.kind,
    description: `${KIND_LABEL[p.kind]} · ${r.code}`,
    categoryId: p.kind === 'caucao' ? null : FIN_CAT.locacao,
    reservationId: r.id,
    reservationCode: r.code,
    customerId: r.customerId,
    customerName,
    payerName: null,
    amount: p.amount,
    paidAmount: paid ? p.amount : 0,
    dueDate: paid ? day(p.paidAt ?? p.createdAt) : (p.dueAt ?? r.pickupDate),
    status: cancelled ? 'cancelado' : paid ? 'pago' : 'aberto',
    receivedAt: paid ? p.paidAt : null,
    method: paid ? p.method : null,
    isCustody: p.kind === 'caucao',
    notes: p.notes,
  }
}

/**
 * Parcelas das reservas (não ficam guardadas): sinal (pago na confirmação), saldo (pendente, vence na retirada),
 * multa (pendente) e caução (`isCustody`). Rascunho não gera parcela; pendências de reserva cancelada/no-show viram `cancelado`.
 */
export function reservationReceivables(world: FinanceWorld): Receivable[] {
  const names = new Map(world.customers.map((c) => [c.id, c.fullName]))
  return world.reservations
    .filter((r) => r.state !== 'rascunho')
    .flatMap((r) => r.payments.filter((p) => PARCEL_KINDS.includes(p.kind)).map((p) => parcel(r, p, names.get(r.customerId) ?? null)))
}

/** Parcelas de reserva + avulsos. */
export function allReceivables(world: FinanceWorld, today: string): Receivable[] {
  return [...reservationReceivables(world), ...world.receivables]
}

export const falta = (r: Pick<Receivable, 'amount' | 'paidAmount'>): number => Math.max(0, round2(r.amount - r.paidAmount))
export const isOpenReceivable = (r: Receivable): boolean => !r.isCustody && (r.status === 'aberto' || r.status === 'parcial')

/** Janela do período: `from = hoje − dias + 1`, `to = hoje`. */
export function rangeBounds(range: FinanceRange, today: string): { from: string; to: string } {
  return { from: addDays(today, -Number(range) + 1), to: today }
}

const inRange = (iso: string | null, from: string, to: string): boolean => !!iso && day(iso) >= from && day(iso) <= to

type Receipt = { paidAt: string; method: PaymentMethod; amount: number }

/** Entradas de receita do período (reservas e avulsos), já descontados os estornos de receita (valor negativo). */
function receipts(world: FinanceWorld, from: string, to: string): { revenue: Receipt[]; count: number } {
  const revenue: Receipt[] = []
  let count = 0
  for (const r of world.reservations) {
    for (const p of r.payments) {
      if (p.state !== 'pago' || !inRange(p.paidAt, from, to)) continue
      if (REVENUE_KINDS.includes(p.kind)) {
        revenue.push({ paidAt: p.paidAt!, method: p.method, amount: p.amount })
        count++
      } else if (p.kind === 'estorno' && p.refersTo !== 'caucao') revenue.push({ paidAt: p.paidAt!, method: p.method, amount: -p.amount })
    }
  }
  for (const a of world.receivables) {
    if (a.paidAmount > 0 && a.method && inRange(a.receivedAt, from, to)) {
      revenue.push({ paidAt: a.receivedAt!, method: a.method, amount: a.paidAmount })
      count++
    }
  }
  return { revenue, count }
}

const sum = (xs: number[]): number => round2(xs.reduce((s, x) => s + x, 0))
const paidValue = (p: Payable): number => p.paidAmount ?? p.amount

/** Visão geral do período (`range` dias) em regime de caixa. Caução nunca é receita. */
export function financeOverview(world: FinanceWorld, range: FinanceRange, today: string): FinanceOverview {
  const { from, to } = rangeBounds(range, today)
  const { revenue, count } = receipts(world, from, to)
  const received = sum(revenue.map((x) => x.amount))
  const paidList = world.payables.filter((p) => p.status === 'paga' && inRange(p.paidAt, from, to))
  const paid = sum(paidList.map(paidValue))
  const operatingCost = sum(paidList.filter((p) => OPERATING_CATEGORIES.includes(p.categoryId)).map(paidValue))
  const acquisitionInvested = sum(paidList.filter((p) => p.categoryId === FIN_CAT.aquisicao).map(paidValue))

  const live = world.reservations.filter((r) => ACTIVE_RESERVATION_STATES.includes(r.state))
  const bal = (r: Reservation) => balance(r.totalNet, r.lateFee, r.payments)
  const toReceiveReservations = sum(live.map((r) => bal(r).due))
  const avulsosOpen = sum(world.receivables.filter(isOpenReceivable).map(falta))

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m0 = Number(today.slice(5, 7)) - 1 - (11 - i)
    const y = Number(today.slice(0, 4)) + Math.floor(m0 / 12)
    const k = `${y}-${pad((((m0 % 12) + 12) % 12) + 1)}`
    const start = `${k}-01`
    const end = k === today.slice(0, 7) ? today : `${k}-${pad(daysInMonth(y, Number(k.slice(5))))}`
    const v = sum(receipts(world, start, end).revenue.map((x) => x.amount))
    const pd = sum(world.payables.filter((p) => p.status === 'paga' && inRange(p.paidAt, start, end)).map(paidValue))
    return { k, v, paid: pd }
  })

  const methods = new Map<PaymentMethod, { total: number; count: number }>()
  for (const x of revenue) {
    const cur = methods.get(x.method) ?? { total: 0, count: 0 }
    methods.set(x.method, { total: round2(cur.total + x.amount), count: cur.count + (x.amount > 0 ? 1 : 0) })
  }
  const byMethod = [...methods].map(([method, v]) => ({ method, label: PAYMENT_METHOD[method], ...v })).filter((m) => m.total > 0).sort((a, b) => b.total - a.total)

  const name = (r: Reservation) => world.customers.find((c) => c.id === r.customerId)?.fullName ?? '—'
  const receivableRows = live
    .map((r) => ({ r, b: bal(r) }))
    .filter(({ b }) => b.due > 0)
    .sort((a, b) => a.r.pickupDate.localeCompare(b.r.pickupDate))
    .map(({ r, b }) => ({ reservationId: r.id, code: r.code, customerName: name(r), pickupDate: r.pickupDate, devido: b.devido, due: b.due }))

  const pendingCharges = world.reservations
    .filter((r) => ACTIVE_RESERVATION_STATES.includes(r.state) || r.state === 'devolvida' || r.state === 'em_inspecao')
    .flatMap((r) => r.payments.filter((p) => p.state === 'pendente' && p.kind !== 'saldo').map((p) => ({ kind: p.kind, customerName: name(r), notes: p.notes, amount: p.amount })))

  const latest = world.reservations
    .flatMap((r) => r.payments.filter((p) => p.state === 'pago' && inRange(p.paidAt, from, to)).map((p) => ({ r, p })))
    .sort((a, b) => b.p.paidAt!.localeCompare(a.p.paidAt!))
    .slice(0, 30)
    .map(({ r, p }) => ({ paidAt: p.paidAt!, reservationId: r.id, code: r.code, customerName: name(r), kind: p.kind, method: p.method, amount: p.kind === 'estorno' ? -p.amount : p.amount }))

  const custody = sum(world.reservations.filter((r) => r.state !== 'rascunho').map((r) => bal(r).caucao))

  return {
    range,
    from,
    to,
    received,
    receivedCount: count,
    toReceive: round2(toReceiveReservations + avulsosOpen),
    toReceiveReservations,
    paid,
    operatingCost,
    operatingMargin: received > 0 ? 1 - operatingCost / received : null,
    acquisitionInvested,
    result: round2(received - paid),
    operatingResult: round2(received - (paid - acquisitionInvested)),
    custody,
    monthly,
    byMethod,
    receivableRows,
    pendingCharges,
    latest,
  }
}
