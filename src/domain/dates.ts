/**
 * Datas puras `aaaa-mm-dd`: toda a aritmética em UTC (nunca `toISOString()` sobre data local).
 * Semana começa na segunda; domingo é o último dia.
 */
import { addDays } from '@/lib/format'

const DAY_MS = 86_400_000
const WEEKDAYS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const utc = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

/** 0 = segunda … 6 = domingo. */
export function weekdayIndex(iso: string): number {
  return (new Date(utc(iso)).getUTCDay() + 6) % 7
}

/** Segunda-feira da semana de `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso.slice(0, 10), -weekdayIndex(iso))
}

/** Dias de `a` até `b` (b − a); negativo se `b` é anterior. */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS)
}

/** Datas de `from` a `to`, inclusive (vazio se `to < from`). */
export function dayRange(from: string, to: string): string[] {
  const n = diffDays(from, to)
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i))
}

/** `hoje | amanhã | ontem | em N dias | há N dias`. */
export function relativeDay(iso: string, today: string): string {
  const d = diffDays(today, iso)
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  if (d === -1) return 'ontem'
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const pad = (n: number) => String(n).padStart(2, '0')

/** Próximo aniversário a partir de `today` (inclusive). 29/02 vira 28/02 em ano não bissexto; trata a virada de ano. */
export function nextBirthday(birthISO: string, today: string): { date: string; inDays: number } {
  const [, bm, bd] = birthISO.slice(0, 10).split('-').map(Number)
  const ty = Number(today.slice(0, 4))
  const at = (y: number) => `${y}-${pad(bm!)}-${pad(bm === 2 && bd === 29 && !isLeap(y) ? 28 : bd!)}`
  let date = at(ty)
  if (date < today) date = at(ty + 1)
  return { date, inDays: diffDays(today, date) }
}

/** "sexta-feira, 23 de outubro". */
export function longDate(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${Number(iso.slice(8, 10))} de ${MONTHS[m]}`
}

/** "Outubro de 2026". */
export function monthLabel(iso: string): string {
  const name = MONTHS[Number(iso.slice(5, 7)) - 1]!
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${iso.slice(0, 4)}`
}
