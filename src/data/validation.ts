/**
 * Regras de validação do Plano 2B (mesmos códigos das RPCs), compartilhadas pela fonte em memória
 * e pelos formulários (que podem validar antes de enviar).
 */
import { isValidCPF } from '@/lib/cpf'
import { errorMessage } from '@/lib/errorMessages'
import { onlyDigits } from '@/lib/format'
import type { CustomerInput, CustomerMeasurementInput, FitInput, GarmentInput, GarmentMeasurement, SourceIssue } from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Problemas de uma peça (cadastro: tudo; edição com `partial`: só os campos enviados). */
export function garmentIssues(input: Partial<GarmentInput>, partial = false): SourceIssue[] {
  const out: SourceIssue[] = []
  const has = (k: keyof GarmentInput) => !partial || k in input
  if (has('name') && (input.name ?? '').trim().length < 2) out.push({ code: 'NOME_OBRIGATORIO', field: 'name' })
  if (has('rentalPrice') && !(typeof input.rentalPrice === 'number' && input.rentalPrice > 0)) out.push({ code: 'VALOR_LOCACAO_OBRIGATORIO', field: 'rentalPrice' })
  for (const k of ['acquisitionCost', 'retailReference'] as const) {
    const v = input[k]
    if (v != null && !(Number.isFinite(v) && v >= 0)) out.push({ code: 'PARAMETRO_INVALIDO', field: k })
  }
  const c = input.cleaningDays
  if (c != null && !(Number.isInteger(c) && c >= 0 && c <= CLEANING_MAX)) out.push({ code: 'PARAMETRO_INVALIDO', field: 'cleaningDays' })
  return out
}

/** Limite de fotos por peça (prévia e banco). */
export const MAX_PHOTOS = 10

/** Dias de higienização próprios da peça: 0–15 (protótipo). */
export const CLEANING_MAX = 15

/** Faixas aceitas (cm) para caimento e medidas da peça — formulário e fonte usam as mesmas. */
export const CM_RANGES: Record<string, readonly [number, number]> = {
  bustComfortCm: [0, 300],
  waistMaxCm: [0, 300],
  hipMaxCm: [0, 300],
  hemHeelCm: [0, 20],
  bustCm: [0, 300],
  waistCm: [0, 300],
  hipCm: [0, 300],
  shoulderCm: [0, 300],
  totalLengthCm: [0, 300],
  hemAllowanceCm: [0, 20],
  heightCm: [0, 300],
}

function rangeIssues(input: Record<string, unknown>): SourceIssue[] {
  const out: SourceIssue[] = []
  for (const [k, v] of Object.entries(input)) {
    const r = CM_RANGES[k]
    if (!r || v == null) continue
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= r[0] && v <= r[1])) out.push({ code: 'PARAMETRO_INVALIDO', field: k })
  }
  return out
}

/** Problemas do caimento observado (só os campos enviados). */
export function fitIssues(input: Partial<FitInput>): SourceIssue[] {
  return rangeIssues(input)
}

/** Problemas das medidas da peça (só os campos enviados). */
export function measurementIssues(input: Partial<GarmentMeasurement>): SourceIssue[] {
  return rangeIssues(input)
}

/** Problemas de uma versão de medidas da cliente (faixas de `CM_RANGES`; altura até 300). */
export function customerMeasurementIssues(input: CustomerMeasurementInput): SourceIssue[] {
  return rangeIssues(input)
}

/** Mensagem pt-BR de um problema para mostrar no campo (faixas de cm, custos, dias de higienização). */
export function issueMessage(issue: SourceIssue): string {
  if (issue.code === 'PARAMETRO_INVALIDO' && issue.field) {
    const r = CM_RANGES[issue.field]
    if (r) return `Informe um valor entre ${r[0]} e ${r[1]} cm.`
    if (issue.field === 'acquisitionCost' || issue.field === 'retailReference') return 'Informe um valor igual ou maior que zero.'
    if (issue.field === 'cleaningDays') return `Informe de 0 a ${CLEANING_MAX} dias (ou deixe em branco para herdar da categoria).`
    if (issue.field === 'file') return 'Envie fotos JPG, PNG, WEBP ou HEIC de até 10 MB.'
    if (issue.field === 'photos') return `Limite de ${MAX_PHOTOS} fotos por peça.`
  }
  return errorMessage(issue.code)
}

/**
 * Data `aaaa-mm-dd` que existe no calendário: ida e volta pelo `Date` em UTC (rejeita 31/02, 31/04, mês 13…;
 * `Date.parse('2026-02-31')` sozinho aceita e "transborda" para março).
 */
export function isValidISODate(s: string | null | undefined): boolean {
  if (!s || !ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/**
 * Problemas de uma cliente, na ordem do formulário. `today` em `aaaa-mm-dd`.
 * Não checa duplicidade de CPF (isso depende dos dados). Medidas enviadas (`measurement`) são checadas nas faixas de `CM_RANGES`.
 */
export function customerIssues(input: Partial<CustomerInput>, today: string, partial = false): SourceIssue[] {
  const out: SourceIssue[] = []
  const has = (k: keyof CustomerInput) => !partial || k in input
  if (has('fullName') && (input.fullName ?? '').trim().length < 3) out.push({ code: 'NOME_CLIENTE_OBRIGATORIO', field: 'fullName' })
  if (has('phone')) {
    const d = onlyDigits(input.phone)
    if (d.length < 10 || d.length > 11) out.push({ code: 'TELEFONE_INVALIDO', field: 'phone' })
  }
  if (has('birthDate')) {
    const b = input.birthDate ?? ''
    if (!isValidISODate(b) || b > today) out.push({ code: 'NASCIMENTO_INVALIDO', field: 'birthDate' })
  }
  if (has('cpf') && !isValidCPF(input.cpf ?? '')) out.push({ code: 'CPF_INVALIDO', field: 'cpf' })
  if (input.email && !EMAIL_RE.test(input.email.trim())) out.push({ code: 'EMAIL_INVALIDO', field: 'email' })
  // medidas (cm) que vierem junto: mesmas faixas da peça; altura até 300
  if (input.measurement) out.push(...rangeIssues(input.measurement))
  return out
}
