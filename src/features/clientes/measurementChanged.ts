import type { CustomerMeasurement, CustomerMeasurementInput } from '@/data/types'

export const CM_KEYS = ['bustCm', 'waistCm', 'hipCm', 'shoulderCm', 'heightCm'] as const
const KEYS = ['usualSize', ...CM_KEYS, 'shoeSize', 'preferredLength'] as const

/**
 * Só vale criar versão nova de medidas se algum valor mudou em relação à atual
 * (sem medida atual: se algum valor foi informado). Observação/origem não contam.
 */
export function measurementChanged(cur: CustomerMeasurement | undefined, m: CustomerMeasurementInput): boolean {
  if (!cur) return KEYS.some((k) => m[k] != null)
  return KEYS.some((k) => (m[k] ?? null) !== (cur[k] ?? null))
}
