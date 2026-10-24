import type { ExceptionAuthorization, Reservation } from '@/data/types'
import { diffDays, longDate } from '@/domain/dates'
import { brl } from '@/lib/format'

/** Estados em que a multa corre (peça fora da loja). */
const LATE_STATES: Reservation['state'][] = ['retirada', 'em_uso', 'aguardando_devolucao']

/** Dias de atraso da devolução (0 fora desses estados ou dentro do prazo). */
export function daysLate(r: Pick<Reservation, 'state' | 'returnDueDate'>, today: string): number {
  return LATE_STATES.includes(r.state) ? Math.max(0, diffDays(r.returnDueDate, today)) : 0
}

/** "12 de outubro". */
export const longDay = (iso: string): string => longDate(iso).split(', ')[1] ?? iso

export const firstName = (s: string): string => s.trim().split(/\s+/)[0] ?? s

const EXCEPTION_LEAD: Record<ExceptionAuthorization['kind'], string> = {
  retirada_com_saldo: 'Retirada com saldo de',
  desconto_acima_limite: 'Desconto de',
  dispensa_sinal_minimo: 'Dispensa do sinal mínimo de',
}
export const exceptionLead = (a: ExceptionAuthorization): string => `${EXCEPTION_LEAD[a.kind]} ${brl(a.amount)}`
