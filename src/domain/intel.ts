/**
 * Relatório da Inteligência (spec `dashboard-inteligencia.md` §3.3 + Decisão 12): tiles, agregações do período,
 * ocupação/pressão, provas, clientes, capital parado, payback e os 11 insights. Função pura sobre o mundo + "hoje".
 * Filtro de categoria vale para tudo menos clientes e provas globais (tile/taxa/funil de prova).
 */
import { monthAbbr, shiftMonth } from './dates'
import { conversionRate } from './fittings'
import { createdOn, customerTotals, intelBase, sum2, type IntelBase, type IntelWorld, type RentalLine } from './intel-base'
import { intelInsights } from './intel-insights'
import { occupancyByCategory, pressure } from './intel-pressure'
import { addDays } from '@/lib/format'
import type { IntelGarmentRevenue, IntelPeriod, IntelReport } from '@/data/types'
import { round2 } from './money'

export type { IntelWorld } from './intel-base'

/** Peças cadastradas há menos disso não contam como paradas (Decisão 12). */
export const NEW_GARMENT_DAYS = 30

const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'U']

function groupBy<K>(lines: RentalLine[], key: (l: RentalLine) => K): Map<K, RentalLine[]> {
  const m = new Map<K, RentalLine[]>()
  for (const l of lines) m.set(key(l), [...(m.get(key(l)) ?? []), l])
  return m
}

/** Meses de `from` até `to` (`aaaa-mm`), com rótulo curto; com mês repetido (12 meses), rótulo leva o ano. */
function monthsBetween(from: string, to: string): { month: string; label: string }[] {
  const out: string[] = []
  const end = to.slice(0, 7)
  for (let k = from.slice(0, 7); ; k = shiftMonth(k, 1)) {
    out.push(k)
    if (k >= end) break
  }
  const names = out.map(monthAbbr)
  const dup = new Set(names.filter((n, i) => names.indexOf(n) !== i))
  return out.map((k, i) => ({ month: k, label: dup.has(names[i]!) ? `${names[i]}/${k.slice(2, 4)}` : names[i]! }))
}

function revenueRows(base: IntelBase): IntelGarmentRevenue[] {
  const by = groupBy(base.inPeriod, (l) => l.g.id)
  return base.acervo
    .concat(base.scope.filter((g) => g.state === 'baixado' && by.has(g.id)))
    .map((g) => {
      const ls = by.get(g.id) ?? []
      return { garmentId: g.id, name: g.name, hex: g.colorHex, rentals: ls.length, revenue: sum2(ls, (l) => l.i.netRevenue) }
    })
}

export function intelReport(world: IntelWorld, days: IntelPeriod, today: string, categorySlug: string | null): IntelReport {
  const base = intelBase(world, days, today, categorySlug)
  const { inPeriod, acervo, economics, fitting } = base
  const idleAlertDays = world.settings.idleAlertDays
  const revenue = sum2(inPeriod, (l) => l.i.netRevenue)

  // clientes (todo o histórico, sem filtro)
  const totals = customerTotals(world, today)
  const withRentals = totals.filter((t) => t.rentals > 0)
  const recurrent = withRentals.filter((t) => t.rentals >= 2)
  const single = withRentals.filter((t) => t.rentals === 1)

  // agregações do período
  const sizes = [...groupBy(inPeriod, (l) => l.g.sizeEquiv)]
    .map(([size, ls]) => ({ size, rentals: ls.length }))
    .sort((a, b) => b.rentals - a.rentals || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
  const colors = [...groupBy(inPeriod, (l) => l.g.colorPrimary || '—')]
    .map(([color, ls]) => ({
      color,
      hex: ls[0]!.g.colorHex,
      rentals: ls.length,
      inStock: acervo.filter((g) => (g.colorPrimary || '—') === color).length,
      revenue: sum2(ls, (l) => l.i.netRevenue),
    }))
    .sort((a, b) => b.rentals - a.rentals || b.revenue - a.revenue)
  const ticketByCategory = [...groupBy(inPeriod, (l) => l.g.categoryName || '—')]
    .map(([category, ls]) => ({ category, rentals: ls.length, avgTicket: round2(sum2(ls, (l) => l.i.netRevenue) / ls.length) }))
    .sort((a, b) => b.avgTicket - a.avgTicket)
  const allRevenue = revenueRows(base)
  const byMonth = groupBy(inPeriod, (l) => l.r.pickupDate.slice(0, 7))
  const monthly = monthsBetween(base.from, today).map((m) => {
    const ls = byMonth.get(m.month) ?? []
    return { ...m, rentals: ls.length, revenue: sum2(ls, (l) => l.i.netRevenue) }
  })

  // provas
  const fitted = acervo.map((g) => ({ g, s: fitting.get(g.id)!, e: economics.get(g.id)! }))
  const fittingConversionByGarment = fitted
    .filter((x) => x.s.fittings >= 3)
    .sort((a, b) => (b.s.rate ?? 0) - (a.s.rate ?? 0) || b.s.fittings - a.s.fittings)
    .slice(0, 6)
    .map(({ g, s }) => ({ garmentId: g.id, name: g.name, hex: g.colorHex, fittings: s.fittings, converted: s.converted, rate: s.rate ?? 0 }))
  const fittedNotRented = fitted
    .filter((x) => x.s.fittings >= 4 && (x.s.rate == null || x.s.rate < 0.35))
    .sort((a, b) => b.s.fittings - a.s.fittings)
    .map(({ g, s }) => ({
      garmentId: g.id,
      code: g.code,
      name: g.name,
      fittings: s.fittings,
      converted: s.converted,
      rate: s.rate,
      alterations: s.alterations,
      discards: s.discards,
      lastNote: s.reasons[0]?.note ?? null,
    }))
  const rarelyFitted = fitted
    .filter((x) => x.s.fittings <= 1 && x.e.rentals <= 1)
    .map(({ g, s, e }) => ({ garmentId: g.id, code: g.code, name: g.name, fittings: s.fittings, rentals: e.rentals }))
  const conv = conversionRate(base.periodSessions)
  const held = base.periodSessions.filter((f) => f.state !== 'agendada' && f.state !== 'no_show').length

  // acervo parado e payback
  const newSince = addDays(today, -NEW_GARMENT_DAYS)
  const idleCapital = acervo
    .filter((g) => {
      const born = createdOn(g)
      if (born && born > newSince) return false
      const e = economics.get(g.id)!
      return e.rentals === 0 || (e.idleDays ?? 0) > idleAlertDays
    })
    .map((g) => {
      const e = economics.get(g.id)!
      return { garmentId: g.id, code: g.code, name: g.name, state: g.state, cost: g.acquisitionCost, revenue: e.revenue, idleDays: e.rentals === 0 ? null : e.idleDays }
    })
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.code.localeCompare(b.code))
  const paidBack = acervo
    .map((g) => ({ g, e: economics.get(g.id)! }))
    .filter(({ e }) => e.paidBack)
    .sort((a, b) => a.g.code.localeCompare(b.g.code))
    .map(({ g, e }) => {
      const cost = e.acquisitionCost ?? 0
      const avg = e.rentals ? e.revenue / e.rentals : 0
      return { garmentId: g.id, code: g.code, name: g.name, revenue: e.revenue, cost, payback: cost ? e.revenue / cost : 0, rentalsToPayback: Math.ceil(cost / (avg || g.rentalPrice || 1)) }
    })

  const report: Omit<IntelReport, 'insights'> = {
    period: { days, from: base.from, to: today },
    category: categorySlug,
    idleAlertDays,
    kpis: {
      rentals: inPeriod.length,
      revenue,
      avgTicket: inPeriod.length ? round2(revenue / inPeriod.length) : 0,
      activeCustomers: withRentals.length,
      totalCustomers: world.customers.length,
      recurrenceRate: withRentals.length ? recurrent.length / withRentals.length : 0,
      recurrentCount: recurrent.length,
      idleGarments: idleCapital.length,
      fittingConversion: conv.rate,
      closedFittings: conv.closed,
    },
    monthly,
    revenueByGarment: allRevenue.filter((g) => g.rentals > 0).sort((a, b) => b.revenue - a.revenue || b.rentals - a.rentals).slice(0, 8),
    revenueByGarmentBottom: allRevenue
      .filter((g) => acervo.some((a) => a.id === g.garmentId))
      .sort((a, b) => a.revenue - b.revenue || a.rentals - b.rentals || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8),
    colors,
    sizes,
    occupancyByCategory: occupancyByCategory(base),
    fittingConversionByGarment,
    fittedNotRented,
    rarelyFitted,
    fittingFunnel: { scheduled: base.periodSessions.length, held, converted: conv.converted, closed: conv.closed },
    pressureBySize: pressure(base, 'size'),
    pressureByCategory: pressure(base, 'category'),
    topCustomers: [...withRentals]
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 8)
      .map((t) => ({ customerId: t.c.id, name: t.c.fullName, city: t.c.city, rentals: t.rentals, spent: t.spent, ticket: t.ticket })),
    customerRevenue: { recurrent: sum2(recurrent, (t) => t.spent), recurrentCount: recurrent.length, single: sum2(single, (t) => t.spent), singleCount: single.length },
    idleCapital,
    paidBack,
    ticketByCategory,
  }
  return { ...report, insights: intelInsights(report, base, totals) }
}
