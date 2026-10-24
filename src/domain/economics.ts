/**
 * Economia da peça (spec dashboard §3.3, `E.economics`), sobre todo o histórico: itens de reservas realizadas
 * (sem `cancelado`/`nao_entregue`) → receita (Σ líquido rateado); higienização/manutenção = contas `operacao`
 * da peça não canceladas (`paidAmount ?? amount`); resultado = receita − aquisição − higienização − manutenção.
 * Usada pelo Acervo (ficha/lista) e pela Inteligência.
 */
import { REALIZED_RESERVATION_STATES } from '@/data/labels-ops'
import type { Garment, GarmentEconomics, Reservation, ReservationItem } from '@/data/types'
import type { World } from '@/data/types-world'
import { diffDays } from './dates'
import { systemCategoryIds } from './fin-categories'
import { round2 } from './money'

type EconomicsWorld = Pick<World, 'reservations' | 'payables' | 'finCategories'>

/** Item que conta como locação: reserva realizada e item não cancelado nem "não entregue". */
export const isRentalItem = (r: Reservation, i: ReservationItem): boolean =>
  REALIZED_RESERVATION_STATES.includes(r.state) && i.itemState !== 'cancelado' && i.itemState !== 'nao_entregue'

export function garmentEconomics(g: Pick<Garment, 'id' | 'acquisitionCost'>, world: EconomicsWorld, today: string): GarmentEconomics {
  const uses = world.reservations.flatMap((r) => r.items.filter((i) => i.garmentId === g.id && isRentalItem(r, i)).map((i) => ({ r, i })))
  const revenue = round2(uses.reduce((s, u) => s + u.i.netRevenue, 0))
  const ops = world.payables.filter((p) => p.source === 'operacao' && p.garmentId === g.id && p.status !== 'cancelada')
  const sum = (cats: string[]) => round2(ops.filter((p) => cats.includes(p.categoryId)).reduce((s, p) => s + (p.paidAmount ?? p.amount), 0))
  const cleaning = sum(systemCategoryIds(world.finCategories, ['higienizacao']))
  const maintenance = sum(systemCategoryIds(world.finCategories, ['manutencao', 'ajuste']))
  const cost = g.acquisitionCost
  const lastRental = uses.map((u) => u.r.eventDate ?? u.r.pickupDate).sort().at(-1) ?? null
  return {
    garmentId: g.id,
    rentals: uses.length,
    revenue,
    acquisitionCost: cost,
    payback: cost ? revenue / cost : null,
    paidBack: !!cost && revenue >= cost,
    cleaning,
    maintenance,
    result: round2(revenue - (cost ?? 0) - cleaning - maintenance),
    lastRental,
    idleDays: lastRental ? diffDays(lastRental, today) : null,
  }
}
