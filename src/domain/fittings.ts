/** Regras de provas: conversão por sessão e por peça (spec agenda-provas §4.4 e §4.8). */
import type { FittingGarmentStats, FittingItem, FittingSession } from '@/data/types'

/** Taxa de conversão: fechadas = convertida, perdida ou no_show (`concluida` e abertas não contam). */
export function conversionRate(sessions: Pick<FittingSession, 'state'>[]): { closed: number; converted: number; rate: number | null } {
  const closed = sessions.filter((s) => s.state === 'convertida' || s.state === 'perdida' || s.state === 'no_show').length
  const converted = sessions.filter((s) => s.state === 'convertida').length
  return { closed, converted, rate: closed > 0 ? converted / closed : null }
}

/**
 * Conversão da peça. `fittings` = itens provados (outcome ≠ nao_provou); `converted` = os cuja sessão virou
 * reserva que contém a peça. `reasons` = até 4 últimas notas, da mais recente para a mais antiga.
 */
export function fittingStats(
  garmentId: string,
  sessions: Pick<FittingSession, 'id' | 'reservationId' | 'scheduledAt'>[],
  items: FittingItem[],
  reservationItems: { reservationId: string; garmentId: string }[],
): FittingGarmentStats {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const tried = items.filter((i) => i.garmentId === garmentId && i.outcome !== 'nao_provou')
  const converted = tried.filter((i) => {
    const rid = byId.get(i.fittingSessionId)?.reservationId
    return !!rid && reservationItems.some((r) => r.reservationId === rid && r.garmentId === garmentId)
  }).length
  const when = (i: FittingItem) => i.recordedAt ?? byId.get(i.fittingSessionId)?.scheduledAt ?? ''
  const reasons = tried
    .filter((i) => i.note && i.note.trim())
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, 4)
    .map((i) => ({ outcome: i.outcome, note: i.note! }))
  return {
    fittings: tried.length,
    converted,
    rate: tried.length > 0 ? converted / tried.length : null,
    favorites: tried.filter((i) => i.outcome === 'favorita').length,
    discards: tried.filter((i) => i.outcome === 'descartada' || i.outcome === 'nao_gostou').length,
    alterations: tried.filter((i) => i.needsAlteration || i.outcome === 'precisa_ajuste').length,
    reasons,
  }
}
