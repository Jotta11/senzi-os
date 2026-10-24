/**
 * Itens e totais da reserva (spec reservas §4.2): preço congelado no item, rateio do desconto do pedido
 * (`prorate`, Σ líquido = total líquido). Comum ao mundo fictício e à fonte em memória.
 */
import { prorate, round2 } from '@/domain/money'
import type { ReservationItem } from '../types'

export type PriceLine = { garmentId: string; unitPrice: number; itemDiscount?: number; alterationNotes?: string | null; id?: string }

/** Itens `pendente` com rateio; `discount` = Σ desconto das peças + desconto do pedido. */
export function priceItems(
  reservationId: string,
  lines: PriceLine[],
  orderDiscount: number,
  newItemId: (k: number) => string = (k) => `${reservationId}-i${k + 1}`,
): { items: ReservationItem[]; totalGross: number; discount: number; totalNet: number } {
  const alloc = prorate(lines.map((l) => ({ gross: l.unitPrice, itemDiscount: l.itemDiscount ?? 0 })), orderDiscount)
  const items: ReservationItem[] = lines.map((l, k) => ({
    id: l.id ?? newItemId(k),
    reservationId,
    garmentId: l.garmentId,
    unitPrice: l.unitPrice,
    grossAmount: l.unitPrice,
    itemDiscount: l.itemDiscount ?? 0,
    allocatedOrderDiscount: alloc[k]!.alloc,
    netRevenue: alloc[k]!.net,
    itemState: 'pendente',
    pickedUpAt: null,
    returnedAt: null,
    pickupNote: null,
    returnNote: null,
    alterationNotes: l.alterationNotes ?? null,
  }))
  const totalGross = round2(lines.reduce((s, l) => s + l.unitPrice, 0))
  const itemDiscounts = round2(lines.reduce((s, l) => s + (l.itemDiscount ?? 0), 0))
  return { items, totalGross, discount: round2(itemDiscounts + orderDiscount), totalNet: round2(items.reduce((s, i) => s + i.netRevenue, 0)) }
}
