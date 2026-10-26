import { dayRange, daysInMonth, longDate, weekdayIndex, weekStart } from '@/domain/dates'
import type { AgendaItem } from '@/data/types'
import { addDays, dateBR } from '@/lib/format'

const NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

/** "segunda", "terça"… (semana segunda → domingo). */
export const weekdayName = (iso: string) => NAMES[weekdayIndex(iso)]!

/** "segunda, 26/10" — nome acessível da coluna do dia. */
export const dayLabel = (iso: string) => `${weekdayName(iso)}, ${dateBR(iso).slice(0, 5)}`

/** "dd/mm – dd/mm/aaaa" (intervalo visível). */
export const rangeLabel = (a: string, b: string) => `${dateBR(a).slice(0, 5)} – ${dateBR(b)}`

/** Compromisso criado na tela (editável); os automáticos vêm de prova/reserva. */
export const isManual = (i: AgendaItem) => ['atendimento', 'servico', 'interno'].includes(i.kind) && !i.reservation && !i.fitting

/** "Segunda-feira, 26 de outubro" (subtítulo da vista Dia). */
export const dayTitle = (iso: string) => {
  const s = longDate(iso)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Semanas completas (segunda → domingo) que cobrem o mês de `iso`; `inMonth` marca os dias do próprio mês. */
export function monthGrid(iso: string): { date: string; inMonth: boolean }[] {
  const month = iso.slice(0, 7)
  const first = `${month}-01`
  const last = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, '0')}`
  return dayRange(weekStart(first), addDays(weekStart(last), 6)).map((date) => ({ date, inMonth: date.startsWith(month) }))
}
