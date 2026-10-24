/**
 * Regras do Financeiro em regime de caixa (spec `operacao-financeiro.md` §2.4): parcelas de reserva derivadas,
 * status derivados, recorrência e visão geral. Funções puras sobre o mundo; "hoje" sempre vem de fora.
 */
import { PAYMENT_METHOD } from '@/data/labels-ops'
import type { FinanceOverview, FinanceRange, Payable, Payment, PaymentMethod, Receivable, ReceivableStatus, Recurrence, Reservation } from '@/data/types'
import type { World } from '@/data/types-world'
import { addDays } from '@/lib/format'
import { daysInMonth, lastMonths } from './dates'
import { systemCategoryId, systemCategoryIds } from './fin-categories'
import { balance, hasReceivable, round2 } from './money'

type FinanceWorld = Pick<World, 'reservations' | 'customers' | 'receivables' | 'payables' | 'finCategories'>

const day = (iso: string): string => iso.slice(0, 10)
const REVENUE_KINDS = ['sinal', 'saldo', 'integral', 'multa']

/** `vencido` = aberto/parcial com vencimento antes de hoje. */
export function receivableStatus(r: { status: ReceivableStatus; dueDate: string }, today: string): ReceivableStatus | 'vencido' {
  return (r.status === 'aberto' || r.status === 'parcial') && r.dueDate < today ? 'vencido' : r.status
}

/** `vencida` = aberta com vencimento antes de hoje. */
export function payableStatus(p: Pick<Payable, 'status' | 'dueDate'>, today: string): Payable['status'] | 'vencida' {
  return p.status === 'aberta' && p.dueDate < today ? 'vencida' : p.status
}

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

function parcel(r: Reservation, p: Payment, customerName: string | null, rentalCategoryId: string | null): Receivable {
  const cancelled = p.state === 'cancelado' || p.state === 'estornado' || (p.state === 'pendente' && !hasReceivable(r))
  const paid = p.state === 'pago'
  return {
    id: p.id,
    source: 'reserva',
    kind: p.kind,
    description: `${KIND_LABEL[p.kind]} · ${r.code}`,
    categoryId: p.kind === 'caucao' ? null : rentalCategoryId,
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
  const rental = systemCategoryId(world.finCategories, 'locacao')
  return world.reservations
    .filter((r) => r.state !== 'rascunho')
    .flatMap((r) => r.payments.filter((p) => PARCEL_KINDS.includes(p.kind)).map((p) => parcel(r, p, names.get(r.customerId) ?? null, rental)))
}

/** Parcelas de reserva + avulsos. */
export function allReceivables(world: FinanceWorld): Receivable[] {
  return [...reservationReceivables(world), ...world.receivables]
}

export const falta = (r: Pick<Receivable, 'amount' | 'paidAmount'>): number => Math.max(0, round2(r.amount - r.paidAmount))
export const isOpenReceivable = (r: Receivable): boolean => !r.isCustody && (r.status === 'aberto' || r.status === 'parcial')

/**
 * Parcelas de reserva em aberto (sem caução) — a fonte única de "a receber" das reservas: Visão geral
 * (total e linhas), cabeçalho de Reservas e Contas a receber somam estas parcelas. Por construção (`syncPending`),
 * Σ parcelas abertas de cada reserva = `openReceivableDue(r)`; rascunho não gera parcela e cancelada/no-show as cancela.
 */
export function openReservationParcels(world: FinanceWorld): Receivable[] {
  return reservationReceivables(world).filter(isOpenReceivable)
}

/** Σ "falta" das parcelas de reserva em aberto (sem avulsos). */
export const reservationsToReceive = (world: FinanceWorld): number => round2(openReservationParcels(world).reduce((s, r) => s + falta(r), 0))

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

/** Faturamento recebido entre duas datas (inclusivas), já descontados os estornos de receita. Caução nunca entra. */
export const receivedBetween = (world: FinanceWorld, from: string, to: string): number => sum(receipts(world, from, to).revenue.map((x) => x.amount))
const paidValue = (p: Payable): number => p.paidAmount ?? p.amount

/** Visão geral do período (`range` dias) em regime de caixa. Caução nunca é receita. */
export function financeOverview(world: FinanceWorld, range: FinanceRange, today: string): FinanceOverview {
  const { from, to } = rangeBounds(range, today)
  const { revenue, count } = receipts(world, from, to)
  const received = sum(revenue.map((x) => x.amount))
  const paidList = world.payables.filter((p) => p.status === 'paga' && inRange(p.paidAt, from, to))
  const paid = sum(paidList.map(paidValue))
  const operating = systemCategoryIds(world.finCategories, ['higienizacao', 'ajuste', 'manutencao'])
  const acquisition = systemCategoryIds(world.finCategories, ['aquisicao'])
  const operatingCost = sum(paidList.filter((p) => operating.includes(p.categoryId)).map(paidValue))
  const acquisitionInvested = sum(paidList.filter((p) => acquisition.includes(p.categoryId)).map(paidValue))

  const bal = (r: Reservation) => balance(r.totalNet, r.lateFee, r.payments)
  const parcels = openReservationParcels(world)
  const toReceiveReservations = sum(parcels.map(falta))
  const avulsosOpen = sum(world.receivables.filter(isOpenReceivable).map(falta))

  const monthly = lastMonths(today, 12).map(({ month: k, from: start, to: end }) => {
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
  // Uma linha por reserva com parcela em aberto (qualquer estado com conta a receber); "Falta" = Σ dessas parcelas.
  const dueBy = new Map<string, number>()
  for (const p of parcels) dueBy.set(p.reservationId!, round2((dueBy.get(p.reservationId!) ?? 0) + falta(p)))
  const receivableRows = world.reservations
    .filter((r) => (dueBy.get(r.id) ?? 0) > 0)
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))
    .map((r) => ({ reservationId: r.id, code: r.code, customerName: name(r), pickupDate: r.pickupDate, devido: bal(r).devido, due: dueBy.get(r.id)! }))

  // Cobranças lançadas e pendentes que a "Falta" das linhas não cobre: caução pendente (custódia, fora do saldo).
  const pendingCharges = world.reservations
    .filter(hasReceivable)
    .flatMap((r) => r.payments.filter((p) => p.state === 'pendente' && PARCEL_KINDS.includes(p.kind) && (p.kind === 'caucao' || !dueBy.has(r.id))).map((p) => ({ kind: p.kind, customerName: name(r), notes: p.notes, amount: p.amount })))

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
