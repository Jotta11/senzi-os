/**
 * Ocupação e pressão do acervo (spec dashboard §3.3, `E.pressure`). Ocupação = dias de locação realizada no
 * período ÷ (peças × dias), limitada a 100% (Decisão 12). Pressão = (locações + ½ provas) ÷ peças do segmento.
 */
import type { Garment, PressureRow } from '@/data/types'
import { sum2, type IntelBase } from './intel-base'

export type PressureDim = 'size' | 'category' | 'color'

const keyOf = (g: Garment, dim: PressureDim): string => (dim === 'size' ? g.sizeEquiv : dim === 'category' ? g.categoryName : g.colorPrimary) || '—'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Segmentos sobre as peças do acervo do escopo, ordenados por pressão (desc). */
export function pressure(base: IntelBase, dim: PressureDim): PressureRow[] {
  const groups = new Map<string, Garment[]>()
  for (const g of base.acervo) groups.set(keyOf(g, dim), [...(groups.get(keyOf(g, dim)) ?? []), g])
  const rows = [...groups].map(([key, gs]): PressureRow => {
    const ids = new Set(gs.map((g) => g.id))
    const lines = base.inPeriod.filter((l) => ids.has(l.g.id))
    const fittings = gs.reduce((s, g) => s + base.periodFittings(g), 0)
    const occupiedDays = gs.reduce((s, g) => s + base.occupiedDays(g), 0)
    const n = gs.length
    return {
      key,
      garments: n,
      rentals: lines.length,
      fittings,
      occupiedDays,
      revenue: sum2(lines, (l) => l.i.netRevenue),
      pressure: n > 0 ? (lines.length + 0.5 * fittings) / n : 0,
      occupancy: n > 0 ? clamp01(occupiedDays / (n * base.days)) : 0,
    }
  })
  return rows.sort((a, b) => b.pressure - a.pressure || b.rentals - a.rentals || a.key.localeCompare(b.key, 'pt-BR'))
}

/** Ocupação por categoria (só categorias com peça no acervo), ordenada por taxa (desc). */
export function occupancyByCategory(base: IntelBase): { category: string; garments: number; occupiedDays: number; rate: number }[] {
  return pressure(base, 'category')
    .map((p) => ({ category: p.key, garments: p.garments, occupiedDays: p.occupiedDays, rate: p.occupancy }))
    .sort((a, b) => b.rate - a.rate || a.category.localeCompare(b.category, 'pt-BR'))
}
