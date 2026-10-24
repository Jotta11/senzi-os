import { weekdayIndex } from '@/domain/dates'
import type { AgendaItem } from '@/data/types'
import { dateBR } from '@/lib/format'

const NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

/** "segunda", "terça"… (semana segunda → domingo). */
export const weekdayName = (iso: string) => NAMES[weekdayIndex(iso)]!

/** "segunda, 26/10" — nome acessível da coluna do dia. */
export const dayLabel = (iso: string) => `${weekdayName(iso)}, ${dateBR(iso).slice(0, 5)}`

/** "dd/mm – dd/mm/aaaa" (intervalo visível). */
export const rangeLabel = (a: string, b: string) => `${dateBR(a).slice(0, 5)} – ${dateBR(b)}`

/** Compromisso criado na tela (editável); os automáticos vêm de prova/reserva. */
export const isManual = (i: AgendaItem) => ['atendimento', 'servico', 'interno'].includes(i.kind) && !i.reservation && !i.fitting
