/**
 * Conjuntos base da Inteligência (spec dashboard §3.3): escopo de peças (filtro de categoria), itens-locação,
 * economia e provas por peça, dias ocupados no período e estatísticas das clientes. Funções puras sobre o mundo.
 */
import { OUT_RESERVATION_STATES } from '@/data/labels-ops'
import type { FittingGarmentStats, FittingSession, Garment, GarmentEconomics, IntelPeriod, Reservation, ReservationItem } from '@/data/types'
import type { World } from '@/data/types-world'
import { addDays } from '@/lib/format'
import { customerStats } from './customers'
import { diffDays } from './dates'
import { garmentEconomics, isRentalItem } from './economics'
import { fittingStats } from './fittings'
import { round2 } from './money'

export type IntelWorld = Pick<World, 'garments' | 'categories' | 'customers' | 'reservations' | 'fittings' | 'fittingItems' | 'payables' | 'finCategories' | 'settings'>

/** Uma locação na Inteligência = um item (linha) de reserva realizada. */
export type RentalLine = { r: Reservation; i: ReservationItem; g: Garment }

export type IntelBase = {
  days: IntelPeriod
  from: string
  today: string
  /** Peças no escopo do filtro de categoria (todas, inclusive baixadas). */
  scope: Garment[]
  /** Peças do acervo no escopo (estado ≠ baixado). */
  acervo: Garment[]
  /** Itens-locação de todo o histórico, no escopo. */
  lines: RentalLine[]
  /** Itens-locação com retirada no período. */
  inPeriod: RentalLine[]
  economics: Map<string, GarmentEconomics>
  fitting: Map<string, FittingGarmentStats>
  /** Sessões de prova com data no período (globais: não seguem o filtro de categoria). */
  periodSessions: FittingSession[]
  /** Dias de locação da peça dentro do período (intervalos unidos, sem contar dia duplicado). */
  occupiedDays(g: Garment): number
  /** Provas (itens ≠ `nao_provou`) da peça em sessões do período. */
  periodFittings(g: Garment): number
}

export const dayOf = (iso: string) => iso.slice(0, 10)

/** Data de cadastro: a entrada de histórico sem estado anterior (ou a mais antiga). */
export function createdOn(g: Garment): string | null {
  const first = g.history.find((h) => h.from === null) ?? g.history.at(-1)
  return first ? dayOf(first.at) : null
}

/** Fim da locação do item: devolução real; se ainda fora, até hoje (ou a devolução prevista, se futura). */
function rentalEnd(l: RentalLine, today: string): string {
  const back = l.i.returnedAt ?? l.r.returnedAt
  if (back) return dayOf(back)
  if (OUT_RESERVATION_STATES.includes(l.r.state)) return l.r.returnDueDate > today ? l.r.returnDueDate : today
  return l.r.returnDueDate
}

/** Σ dias cobertos por intervalos `[from, to]` inclusivos, cortados em `[lo, hi]` e unidos. */
export function coveredDays(spans: { from: string; to: string }[], lo: string, hi: string): number {
  const cut = spans
    .map((s) => ({ from: s.from > lo ? s.from : lo, to: s.to < hi ? s.to : hi }))
    .filter((s) => s.to >= s.from)
    .sort((a, b) => a.from.localeCompare(b.from))
  let total = 0
  let cur: { from: string; to: string } | null = null
  for (const s of cut) {
    if (cur && s.from <= addDays(cur.to, 1)) {
      if (s.to > cur.to) cur.to = s.to
      continue
    }
    if (cur) total += diffDays(cur.from, cur.to) + 1
    cur = { ...s }
  }
  if (cur) total += diffDays(cur.from, cur.to) + 1
  return total
}

export function intelBase(world: IntelWorld, days: IntelPeriod, today: string, categorySlug: string | null): IntelBase {
  const from = addDays(today, -days + 1)
  const scope = world.garments.filter((g) => !categorySlug || g.categorySlug === categorySlug)
  const byId = new Map(scope.map((g) => [g.id, g]))
  const lines: RentalLine[] = world.reservations.flatMap((r) =>
    r.items.flatMap((i) => {
      const g = byId.get(i.garmentId)
      return g && isRentalItem(r, i) ? [{ r, i, g }] : []
    }),
  )
  const inPeriod = lines.filter((l) => l.r.pickupDate >= from && l.r.pickupDate <= today)

  const resItems = world.reservations.flatMap((r) => r.items.map((i) => ({ reservationId: r.id, garmentId: i.garmentId })))
  const economics = new Map(scope.map((g) => [g.id, garmentEconomics(g, world, today)]))
  const fitting = new Map(scope.map((g) => [g.id, fittingStats(g.id, world.fittings, world.fittingItems, resItems)]))

  const periodSessions = world.fittings.filter((f) => dayOf(f.scheduledAt) >= from && dayOf(f.scheduledAt) <= today)
  const periodIds = new Set(periodSessions.map((f) => f.id))

  const spans = new Map<string, { from: string; to: string }[]>()
  for (const l of lines) {
    const to = rentalEnd(l, today)
    spans.set(l.g.id, [...(spans.get(l.g.id) ?? []), { from: l.r.pickupDate, to: to < l.r.pickupDate ? l.r.pickupDate : to }])
  }

  return {
    days,
    from,
    today,
    scope,
    acervo: scope.filter((g) => g.state !== 'baixado'),
    lines,
    inPeriod,
    economics,
    fitting,
    periodSessions,
    occupiedDays: (g) => coveredDays(spans.get(g.id) ?? [], from, today),
    periodFittings: (g) => world.fittingItems.filter((i) => i.garmentId === g.id && i.outcome !== 'nao_provou' && periodIds.has(i.fittingSessionId)).length,
  }
}

/** Estatísticas da cliente sobre todo o histórico (`customerStats`): reservas realizadas, Σ líquido delas e ticket. */
export function customerTotals(world: Pick<World, 'customers' | 'reservations'>, today: string) {
  return world.customers.map((c) => {
    const { rentals, spent } = customerStats(c.id, world.reservations, today)
    return { c, rentals, spent, ticket: rentals ? round2(spent / rentals) : 0 }
  })
}

/** Soma em centavos. */
export const sum2 = <T>(xs: T[], f: (x: T) => number) => round2(xs.reduce((s, x) => s + f(x), 0))
