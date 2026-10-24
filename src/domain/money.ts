/** Dinheiro: arredondamento a centavos e regras de valores de reserva (spec reservas §4.2–§4.4). */
import { NO_RECEIVABLE_RESERVATION_STATES, OUT_RESERVATION_STATES } from '@/data/labels-ops'
import type { Garment, Payment, PayStatus, Reservation, ReservationBalance } from '@/data/types'
import { diffDays } from './dates'

/** O que as regras de saldo leem de um pagamento. */
type PaymentLike = Pick<Payment, 'kind' | 'amount' | 'state' | 'refersTo'>

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

const cents = (n: number): number => Math.round(n * 100)

/**
 * Rateia o desconto do pedido entre as peças, proporcional à base (bruto − desconto da peça).
 * Em centavos inteiros: cada peça leva o piso da sua parte e o resto vai para a de maior base (empate: a primeira).
 * Invariante: Σ net = Σ base − desconto aplicado.
 */
export function prorate(items: { gross: number; itemDiscount?: number }[], orderDiscount: number): { alloc: number; net: number }[] {
  const base = items.map((it) => Math.max(0, cents(it.gross) - cents(it.itemDiscount ?? 0)))
  const total = base.reduce((s, b) => s + b, 0)
  const desc = Math.min(Math.max(0, cents(orderDiscount)), total)
  if (total <= 0 || desc <= 0) return base.map((b) => ({ alloc: 0, net: b / 100 }))
  const alloc = base.map((b) => Math.floor((desc * b) / total))
  const rest = desc - alloc.reduce((s, a) => s + a, 0)
  if (rest > 0) {
    let top = 0
    base.forEach((b, i) => {
      if (b > base[top]!) top = i
    })
    alloc[top]! += rest
  }
  return base.map((b, i) => ({ alloc: alloc[i]! / 100, net: (b - alloc[i]!) / 100 }))
}

/**
 * Saldo da reserva. Só pagamentos `pago` contam; caução nunca abate. Estorno de receita subtrai do pago;
 * estorno com `refersTo: 'caucao'` abate a caução retida e não mexe no saldo (Decisão 6).
 */
export function balance(totalNet: number, lateFeeAmount: number, payments: PaymentLike[]): ReservationBalance {
  const devido = round2(totalNet + lateFeeAmount)
  const paid = payments.filter((p) => p.state === 'pago')
  const sum = (f: (p: PaymentLike) => boolean) => round2(paid.filter(f).reduce((s, p) => s + p.amount, 0))
  const bruto = sum((p) => p.kind !== 'caucao' && p.kind !== 'estorno')
  const estornoReceita = sum((p) => p.kind === 'estorno' && p.refersTo !== 'caucao')
  const estornoCaucao = sum((p) => p.kind === 'estorno' && p.refersTo === 'caucao')
  const pago = round2(bruto - estornoReceita)
  const caucao = Math.max(0, round2(sum((p) => p.kind === 'caucao') - estornoCaucao))
  const status: PayStatus = pago <= 0 ? 'nao_pago' : pago >= devido - 0.009 ? 'pago' : 'parcial'
  return { devido, pago, caucao, due: Math.max(0, round2(devido - pago)), status }
}

/** A reserva tem conta a receber? Não em rascunho (ainda não cobra) nem cancelada/no-show (o pendente caiu). */
export const hasReceivable = (r: Pick<Reservation, 'state'>): boolean => !NO_RECEIVABLE_RESERVATION_STATES.includes(r.state)

/**
 * Quanto ainda falta receber da reserva — a regra única de "a receber" (lista, ficha, financeiro, alertas):
 * `balance(...).due`, e 0 quando a reserva não tem conta a receber (`hasReceivable`).
 */
export function openReceivableDue(r: Pick<Reservation, 'state' | 'totalNet' | 'lateFee' | 'payments'>): number {
  return hasReceivable(r) ? balance(r.totalNet, r.lateFee, r.payments).due : 0
}

/**
 * Parcelas pendentes coerentes com o saldo: `saldo` = `min(due, líquido − pago da locação)`; `multa` = `due − saldo`.
 * Usada pela fonte (`syncPending`) e pelo fixture, para que Σ parcelas pendentes = `due`.
 */
export function pendingTargets(totalNet: number, lateFeeAmount: number, payments: PaymentLike[]): { saldo: number; multa: number } {
  const due = balance(totalNet, lateFeeAmount, payments).due
  const paid = payments.filter((p) => p.state === 'pago')
  const sum = (f: (p: PaymentLike) => boolean) => round2(paid.filter(f).reduce((s, p) => s + p.amount, 0))
  const rentalPaid = round2(sum((p) => p.kind !== 'caucao' && p.kind !== 'estorno' && p.kind !== 'multa') - sum((p) => p.kind === 'estorno' && p.refersTo !== 'caucao'))
  const saldo = Math.min(due, Math.max(0, round2(totalNet - rentalPaid)))
  return { saldo, multa: round2(due - saldo) }
}

/** Dias de atraso da devolução: só com a peça na rua (`OUT_RESERVATION_STATES`) e depois do prazo; senão 0. */
export function daysLate(r: Pick<Reservation, 'state' | 'returnDueDate'>, today: string): number {
  return OUT_RESERVATION_STATES.includes(r.state) ? Math.max(0, diffDays(r.returnDueDate, today)) : 0
}

/** Multa por atraso: `% diário` do líquido × dias corridos. */
export function lateFee(totalNet: number, pct: number, daysLate: number): number {
  return daysLate > 0 ? round2((totalNet * pct * daysLate) / 100) : 0
}

/** Sinal mínimo para confirmar. */
export function minSignal(totalNet: number, pct: number): number {
  return round2((totalNet * pct) / 100)
}

/**
 * Caução sugerida: com `depositPercent > 0`, Σ valor de referência × %; senão regra do protótipo
 * (10% do valor de referência da 1ª peça em múltiplos de 10; 0 para bolsa/acessório; sem sugestão, 10% do devido).
 */
export function depositSuggestion(garments: Garment[], devido: number, depositPercent: number): number {
  if (depositPercent > 0) return round2(garments.reduce((s, g) => s + (g.retailReference ?? 0), 0) * depositPercent / 100)
  const first = garments[0]
  const suggested = first && first.categorySlug !== 'bolsa-acessorio' ? Math.round(((first.retailReference ?? 0) * 0.1) / 10) * 10 : 0
  return suggested > 0 ? suggested : round2(devido * 0.1)
}

/** Desconto precisa de exceção quando é estritamente maior que o limite (% do bruto). */
export function discountNeedsException(gross: number, discount: number, limitPct: number): boolean {
  return gross > 0 && discount * 100 > gross * limitPct
}
