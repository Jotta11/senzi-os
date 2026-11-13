/**
 * Números por extenso em português (contrato): `reaisExtenso(330)` → "trezentos e trinta reais".
 * Espelhado em SQL por `public.extenso_int`/`public.brl_extenso` (supabase/migrations/20261113000200_contrato_modelo.sql).
 */
const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 100) return 'cem'
  const out: string[] = []
  const c = Math.floor(n / 100)
  const r = n % 100
  if (c) out.push(CEN[c]!)
  if (r > 0 && r < 20) out.push(UN[r]!)
  else if (r >= 20) out.push(r % 10 ? `${DEZ[Math.floor(r / 10)]} e ${UN[r % 10]}` : DEZ[Math.floor(r / 10)]!)
  return out.join(' e ')
}

/** Inteiro ≥ 0 por extenso (até 999.999.999). */
export function extenso(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const groups: [number, string][] = []
  const mi = Math.floor(n / 1_000_000)
  const mil = Math.floor((n % 1_000_000) / 1000)
  const un = n % 1000
  if (mi) groups.push([mi, mi === 1 ? 'um milhão' : `${ate999(mi)} milhões`])
  if (mil) groups.push([mil, mil === 1 ? 'mil' : `${ate999(mil)} mil`])
  if (un) groups.push([un, ate999(un)])
  // "e" antes do último grupo quando ele é < 100 ou centena redonda: "mil e duzentos", "mil e cinquenta", "mil duzentos e cinquenta".
  return groups
    .map(([v, s], i) => (i > 0 && i === groups.length - 1 && (v < 100 || v % 100 === 0) ? `e ${s}` : s))
    .join(' ')
}

/** Valor em reais por extenso: 1250.5 → "mil duzentos e cinquenta reais e cinquenta centavos". */
export function reaisExtenso(v: number): string {
  const cents = Math.round(Math.abs(v) * 100)
  const r = Math.floor(cents / 100)
  const c = cents % 100
  const parts: string[] = []
  if (r) parts.push(`${extenso(r)}${r % 1_000_000 === 0 ? ' de' : ''} ${r === 1 ? 'real' : 'reais'}`)
  if (c) parts.push(`${extenso(c)} ${c === 1 ? 'centavo' : 'centavos'}`)
  return parts.length ? parts.join(' e ') : 'zero real'
}

/** Percentual com extenso quando inteiro: 10 → "10% (dez por cento)"; 2.5 → "2,5%". */
export function percentExtenso(p: number): string {
  const txt = `${String(p).replace('.', ',')}%`
  return Number.isInteger(p) ? `${txt} (${extenso(p)} por cento)` : txt
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** `aaaa-mm-dd` → "14 de novembro de 2026". */
export function dataExtenso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MESES[(m ?? 1) - 1]} de ${y}`
}
