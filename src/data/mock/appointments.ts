/**
 * Criação de compromissos de agenda, comum ao mundo fictício e à fonte em memória: avulsos e os três
 * automáticos de uma reserva confirmada (retirada, evento, devolução).
 */
import { at, USER } from './constants'
import type { World } from '../fixture/world'
import type { Appointment, AppointmentKind, AppointmentState, Reservation } from '../types'

export type ApptSpec = Partial<Appointment> & Pick<Appointment, 'kind' | 'startsAt' | 'title' | 'state'>

/** Insere o compromisso (id padrão sequencial `ag-NNNN`). */
export function addAppointment(w: Pick<World, 'appointments'>, a: ApptSpec, id?: string): Appointment {
  const appt: Appointment = {
    id: id ?? `ag-${String(w.appointments.length + 1).padStart(4, '0')}`,
    notes: null,
    customerId: null,
    reservationId: null,
    fittingId: null,
    garmentId: null,
    assignedTo: null,
    internal: a.kind === 'interno',
    createdBy: USER.julia.id,
    ...a,
  }
  w.appointments.push(appt)
  return appt
}

export type ReservationApptKind = Extract<AppointmentKind, 'retirada' | 'evento' | 'devolucao'>

/** Horários padrão dos compromissos da reserva (Decisão 5). */
export const RESERVATION_TIMES: Record<ReservationApptKind, string> = { retirada: '10:00', evento: '19:00', devolucao: '11:00' }

/** Retirada, evento (se há data) e devolução da reserva, nessa ordem. */
export function addReservationAppointments(
  w: Pick<World, 'appointments'>,
  r: Reservation,
  o: {
    state: (kind: ReservationApptKind) => AppointmentState
    assignedTo: string | null
    createdBy: string | null
    times?: Partial<Record<ReservationApptKind, string>>
    newId?: () => string
  },
): Appointment[] {
  const base = { customerId: r.customerId, reservationId: r.id, garmentId: r.items.length === 1 ? r.items[0]!.garmentId : null, assignedTo: o.assignedTo, createdBy: o.createdBy }
  const time = (k: ReservationApptKind) => o.times?.[k] ?? RESERVATION_TIMES[k]
  const add = (kind: ReservationApptKind, date: string, title: string) => addAppointment(w, { ...base, kind, startsAt: at(date, time(kind)), title, state: o.state(kind) }, o.newId?.())
  const out = [add('retirada', r.pickupDate, 'Retirada')]
  if (r.eventDate) out.push(add('evento', r.eventDate, r.eventType ?? 'Evento'))
  out.push(add('devolucao', r.returnDueDate, 'Devolução'))
  return out
}
