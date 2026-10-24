import { formatDateTime } from './datetime'

/** Fuso da loja. */
export const STORE_TZ = 'America/Araguaina'

const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brlWhole = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** "R$ 890,00" (ou "R$ 890" com `cents: false`), com espaço comum. */
export function brl(n: number, opts: { cents?: boolean } = {}): string {
  const f = opts.cents === false ? brlWhole : brlCents
  return f.format(n).replace(/\u00a0|\u202f/g, ' ')
}

export const onlyDigits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

/** Minúsculas, sem acento e sem espaços nas pontas — para comparar buscas. */
export const normalize = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Data de hoje (ou de `d`) no fuso da loja, `aaaa-mm-dd`. */
export function todayISO(d: Date = new Date()): string {
  return dateFmt.format(d)
}

/** `aaaa-mm-dd` (data pura) ou ISO com hora (convertida para o fuso da loja) → `dd/mm/aaaa`. */
export function dateBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO(new Date(iso))
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/** `dd/mm/aaaa HH:mm` no fuso da loja. */
export function dateTimeBR(iso: string | null | undefined): string {
  return iso ? formatDateTime(iso) : ''
}

/** Idade em anos completos em `today` (`aaaa-mm-dd`, padrão: hoje na loja). */
export function ageFrom(birthISO: string | null | undefined, today: string = todayISO()): number | null {
  if (!birthISO) return null
  const [by, bm, bd] = birthISO.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (!by || !ty) return null
  let age = ty - by
  if (tm! < bm! || (tm === bm && td! < bd!)) age--
  return age
}

/** Máscara progressiva de CPF: `529.982.247-25`. */
export function maskCPF(s: string | null | undefined): string {
  const d = onlyDigits(s).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/** CPF parcialmente oculto, para quem não pode ver o documento: `***.982.247-**`. */
export function hideCPF(s: string | null | undefined): string {
  const d = onlyDigits(s)
  if (d.length !== 11) return '***.***.***-**'
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** Máscara progressiva de telefone com DDD: `(63) 99612-4478` / `(63) 3215-4478`. */
export function maskPhone(s: string | null | undefined): string {
  const d = onlyDigits(s).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const split = d.length === 11 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

/** Soma `n` dias a uma data `aaaa-mm-dd` (sem fuso; aritmética em UTC). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Dígitos do telefone; colado com DDI (+55 …, 12–13 dígitos) perde o 55. */
export function phoneDigits(s: string): string {
  let d = onlyDigits(s)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.slice(0, 11)
}
