import type { Garment, Maintenance } from '@/data/types'

/** Ordem a concluir, com a peça (as filas e a tabela de ordens têm formatos diferentes). */
export type OrderTarget = Pick<Maintenance, 'id' | 'kind' | 'provider'> & { garmentCode: string; garmentName: string }

export function orderTarget(order: Maintenance, g: Garment): OrderTarget {
  return { id: order.id, kind: order.kind, provider: order.provider, garmentCode: g.code, garmentName: g.name }
}
