/** Painel (Dashboard) na fonte em memória: tiles, alertas, ciclo, faturamento e provas próximas sobre o mesmo mundo. */
import { computeAlerts } from '@/domain/alerts'
import { lastMonths, monthAbbr } from '@/domain/dates'
import { receivedBetween } from '@/domain/finance'
import { round2 } from '@/domain/money'
import { ACTIVE_RESERVATION_STATES, OUT_RESERVATION_STATES, REALIZED_RESERVATION_STATES } from '@/data/labels'
import { addDays } from '@/lib/format'
import type { AgendaSource } from '../source-agenda'
import type { PainelSource } from '../source-painel'
import type { DashboardSummary, GarmentState } from '../types'
import type { MockCtx } from './context'


export function painel(ctx: MockCtx, agenda: Pick<AgendaSource, 'agendaRange' | 'agendaMonthDays'>): PainelSource {
  const { db, today } = ctx
  return {
    async dashboardSummary(range) {
      const [days, monthDays] = await Promise.all([agenda.agendaRange(today, today), agenda.agendaMonthDays(today.slice(0, 7))])
      return ctx.run((): DashboardSummary => {
        const first = (id: string) => db.customers.find((c) => c.id === id)?.fullName.split(' ')[0] ?? ''
        const pickups = db.reservations.filter((r) => r.pickupDate === today && (r.state === 'confirmada' || r.state === 'pronta_retirada'))
        const live = db.garments.filter((g) => g.state !== 'baixado')
        const n = (...s: GarmentState[]) => live.filter((g) => s.includes(g.state)).length
        const available = n('disponivel')

        const from = range === '30' ? `${today.slice(0, 7)}-01` : addDays(today, -Number(range) + 1)
        const rentals = db.reservations.filter((r) => REALIZED_RESERVATION_STATES.includes(r.state) && r.pickupDate >= from && r.pickupDate <= today)
        const net = rentals.reduce((s, r) => s + r.totalNet, 0)

        const fittings = db.fittings
          .filter((f) => (f.state === 'agendada' || f.state === 'em_curso') && f.scheduledAt.slice(0, 10) <= addDays(today, 1))
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
          .map((f) => ({
            id: f.id,
            code: f.code,
            at: f.scheduledAt,
            customerName: db.customers.find((c) => c.id === f.customerId)?.fullName ?? '—',
            itemCount: db.fittingItems.filter((i) => i.fittingSessionId === f.id).length,
            state: f.state,
          }))

        return {
          today,
          tiles: {
            pickupsToday: { count: pickups.length, firstNames: pickups.map((r) => first(r.customerId)) },
            returnsToday: db.reservations.filter((r) => OUT_RESERVATION_STATES.includes(r.state) && r.returnDueDate === today).length,
            overdue: db.reservations.filter((r) => OUT_RESERVATION_STATES.includes(r.state) && r.returnDueDate < today).length,
            eventsToday: db.reservations.filter((r) => r.eventDate === today && ACTIVE_RESERVATION_STATES.includes(r.state)).length,
            availableGarments: available,
            totalGarments: live.length,
          },
          alerts: computeAlerts(db, today),
          agendaToday: days[0]?.items ?? [],
          agendaMonthDays: monthDays,
          cycle: {
            inspecao: n('inspecao'),
            higienizacao: n('higienizacao'),
            ajuste: n('ajuste'),
            manutencao: n('manutencao'),
            bloqueado: n('bloqueado'),
            reservado: n('reservado'),
            foraDaLoja: n('em_uso', 'retirado', 'aguardando_devolucao'),
            occupancyRate: 1 - available / Math.max(1, live.length),
          },
          finance: {
            range,
            revenue: receivedBetween(db, from, today),
            ticket: rentals.length ? round2(net / rentals.length) : 0,
            rentals: rentals.length,
            series: lastMonths(today, 7).map((m) => ({ label: monthAbbr(m.month), month: m.month, value: receivedBetween(db, m.from, m.to) })),
          },
          fittingsSoon: fittings,
        }
      })
    },
  }
}
