import type { ExceptionAuthorization } from '@/data/types'
import { longDate } from '@/domain/dates'
import { brl } from '@/lib/format'

/** "12 de outubro". */
export const longDay = (iso: string): string => longDate(iso).split(', ')[1] ?? iso

export const firstName = (s: string): string => s.trim().split(/\s+/)[0] ?? s

const EXCEPTION_LEAD: Record<ExceptionAuthorization['kind'], string> = {
  retirada_com_saldo: 'Retirada com saldo de',
  desconto_acima_limite: 'Desconto de',
  dispensa_sinal_minimo: 'Dispensa do sinal mínimo de',
}
export const exceptionLead = (a: ExceptionAuthorization): string => `${EXCEPTION_LEAD[a.kind]} ${brl(a.amount)}`
