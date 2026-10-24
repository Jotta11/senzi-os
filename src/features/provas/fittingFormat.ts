import { weekdayName } from '../agenda/agendaDates'
import { dateBR } from '@/lib/format'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** `dd/mm HH:MM` de um instante local `aaaa-mm-ddTHH:MM:00` (sem conversão de fuso). */
export const whenShort = (iso: string) => `${dateBR(iso.slice(0, 10)).slice(0, 5)} ${iso.slice(11, 16)}`

/** "terça, 5 de maio" de uma data `aaaa-mm-dd`. */
export function weekdayLong(date: string): string {
  const [, m, d] = date.split('-')
  return `${weekdayName(date)}, ${Number(d)} de ${MONTHS[Number(m) - 1]}`
}

/** Porcentagem sem casas ("42%"). */
export const pct = (rate: number) => `${Math.round(rate * 100)}%`

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
