/** Estatísticas da cliente (spec clientes, `E.customerStats`): função pura sobre as reservas. */
import { ACTIVE_RESERVATION_STATES, REALIZED_RESERVATION_STATES } from '@/data/labels-ops'
import type { CustomerStats, Reservation } from '@/data/types'
import { round2 } from './money'

/** Realizadas, Σ líquido delas e o próximo evento de reserva ativa (a partir de `today`). */
export function customerStats(customerId: string, reservations: Reservation[], today: string): CustomerStats & { spent: number } {
  const mine = reservations.filter((r) => r.customerId === customerId)
  const realized = mine.filter((r) => REALIZED_RESERVATION_STATES.includes(r.state))
  const next = mine
    .filter((r) => ACTIVE_RESERVATION_STATES.includes(r.state) && r.eventDate && r.eventDate >= today)
    .map((r) => r.eventDate!)
    .sort()[0]
  return { rentals: realized.length, spent: round2(realized.reduce((s, r) => s + r.totalNet, 0)), nextEvent: next ?? null }
}
