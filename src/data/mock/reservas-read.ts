/** Leituras de Reservas na fonte em memória: lista por filtro (spec §2.1), ficha, disponibilidade e alternativas. */
import { ACTIVE_RESERVATION_STATES, CLOSED_RESERVATION_STATES } from '@/data/labels'
import { alternatives as rankAlternatives } from '@/domain/calendar'
import { balance, depositSuggestion, minSignal } from '@/domain/money'
import type { ReservasSource } from '../source-reservas'
import type { Reservation, ReservationDetail, ReservationFilter, ReservationRow, ReservationState } from '../types'
import { projectCustomer, projectGarment, type MockCtx } from './context'
import type { ReservaKit } from './reservas-shared'

/** Chip "Ativas" (spec §2.1, regra nova). */
const LIST_ACTIVE: ReservationState[] = ['rascunho', 'confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao', 'devolvida', 'em_inspecao']

type Read = Pick<
  ReservasSource,
  'listReservations' | 'reservationSummary' | 'getReservation' | 'checkAvailability' | 'alternatives' | 'reservationsOfCustomer' | 'reservationsOfGarment' | 'getSettings'
>

export function reservasRead(ctx: MockCtx, kit: ReservaKit): Read {
  const { db, today, run } = ctx
  const due = (r: Reservation) => balance(r.totalNet, r.lateFee, r.payments).due

  const FILTERS: Record<ReservationFilter, (r: Reservation) => boolean> = {
    ativas: (r) => LIST_ACTIVE.includes(r.state),
    hoje: (r) => r.pickupDate === today || r.returnDueDate === today || r.eventDate === today,
    rascunhos: (r) => r.state === 'rascunho',
    com_saldo: (r) => LIST_ACTIVE.includes(r.state) && r.state !== 'rascunho' && due(r) > 0,
    rua: (r) => r.state === 'retirada' || r.state === 'em_uso' || r.state === 'aguardando_devolucao',
    inspecao: (r) => r.state === 'devolvida' || r.state === 'em_inspecao',
    futuras: (r) => (r.state === 'rascunho' || ACTIVE_RESERVATION_STATES.includes(r.state)) && r.pickupDate > today,
    encerradas: (r) => CLOSED_RESERVATION_STATES.includes(r.state),
    todas: () => true,
  }
  const asc = (a: Reservation, b: Reservation) => a.pickupDate.localeCompare(b.pickupDate) || a.createdAt.localeCompare(b.createdAt) || a.code.localeCompare(b.code)
  const rowsBy = (pred: (r: Reservation) => boolean, desc: boolean): ReservationRow[] =>
    db.reservations
      .filter(pred)
      .sort((a, b) => (desc ? asc(b, a) : asc(a, b)))
      .map(kit.row)

  function detail(r: Reservation): ReservationDetail {
    const garments = r.items.map((i) => projectGarment(ctx, ctx.garment(i.garmentId)))
    const f = r.fittingId ? db.fittings.find((x) => x.id === r.fittingId) : undefined
    const b = balance(r.totalNet, r.lateFee, r.payments)
    const conflicts = r.state === 'rascunho' ? r.items.map((i) => kit.availability(i.garmentId, r.pickupDate, r.returnDueDate, r.id)).filter((a) => !a.ok) : []
    return {
      ...r,
      balance: b,
      customer: projectCustomer(ctx, ctx.customer(r.customerId)),
      garments,
      conflicts,
      fittingCode: f?.code ?? null,
      fittingDate: f?.scheduledAt.slice(0, 10) ?? null,
      minSignal: minSignal(r.totalNet, db.settings.minSignalPercent),
      depositSuggested: depositSuggestion(garments, b.devido, db.settings.depositPercent),
    }
  }

  return {
    listReservations: (filter, page) =>
      run(() => {
        const all = rowsBy(FILTERS[filter] ?? FILTERS.todas, filter === 'encerradas')
        return { items: all.slice(page.offset, page.offset + page.limit), total: all.length }
      }),

    reservationSummary: () =>
      run(() => {
        const active = db.reservations.filter((r) => ACTIVE_RESERVATION_STATES.includes(r.state))
        return { active: active.length, toReceive: Math.round(active.reduce((s, r) => s + due(r), 0) * 100) / 100 }
      }),

    getReservation: (id) =>
      run(() => {
        const r = db.reservations.find((x) => x.id === id)
        return r ? detail(r) : null
      }),

    checkAvailability: (garmentIds, pickup, returnDue, ignore) => run(() => garmentIds.map((id) => kit.availability(id, pickup, returnDue, ignore))),

    alternatives: (garmentId, pickup, returnDue) =>
      run(() => {
        const target = ctx.garment(garmentId)
        return rankAlternatives(target, db.garments, (g) => kit.availability(g.id, pickup, returnDue).ok).map((a) => projectGarment(ctx, a.garment))
      }),

    reservationsOfCustomer: (customerId) => run(() => rowsBy((r) => r.customerId === customerId, true)),
    reservationsOfGarment: (garmentId) => run(() => rowsBy((r) => r.items.some((i) => i.garmentId === garmentId), true)),
    getSettings: () => run(() => db.settings),
  }
}
