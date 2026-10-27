/**
 * Regras de validação do Plano 2B (mesmos códigos das RPCs), compartilhadas pela fonte em memória
 * e pelos formulários (que podem validar antes de enviar).
 */
import { isValidCPF } from '@/lib/cpf'
import { errorMessage } from '@/lib/errorMessages'
import { addDays, brl, onlyDigits } from '@/lib/format'
import type {
  AppointmentInput,
  ContractSignInput,
  CustomerInput,
  CustomerMeasurementInput,
  FitInput,
  FittingInput,
  GarmentInput,
  GarmentMeasurement,
  ReservationInput,
  SourceIssue,
} from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

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

/** `HH:MM` de 00:00 a 23:59. */
export function isValidTime(s: string | null | undefined): boolean {
  return !!s && HHMM.test(s)
}

/**
 * Problemas de um compromisso manual, na ordem do formulário: data, horário e, por tipo, cliente (Atendimento)
 * ou observação (Serviço/Interno sem cliente). Não checa se a cliente existe.
 */
export function appointmentIssues(input: AppointmentInput): SourceIssue[] {
  const out: SourceIssue[] = []
  if (!isValidISODate(input.date)) out.push({ code: 'DATA_OBRIGATORIA', field: 'date' })
  if (!isValidTime(input.time)) out.push({ code: 'HORARIO_OBRIGATORIO', field: 'time' })
  const notes = input.notes?.trim()
  if (input.kind === 'atendimento' && !input.customerId) out.push({ code: 'CLIENTE_OBRIGATORIA', field: 'customerId' })
  else if (input.kind !== 'atendimento' && !input.customerId && !notes) out.push({ code: 'OBSERVACAO_OBRIGATORIA', field: 'notes' })
  return out
}

/**
 * Problemas de uma prova nova: cliente (existente ou nova), data, evento antes da prova e horário (vazio = 15:00).
 * A cliente nova é validada à parte, com `customerIssues`.
 */
export function fittingIssues(input: FittingInput): SourceIssue[] {
  const out: SourceIssue[] = []
  if (!input.customerId && !input.newCustomer) out.push({ code: 'CLIENTE_OBRIGATORIA', field: 'customerId' })
  if (!isValidISODate(input.date)) out.push({ code: 'DATA_OBRIGATORIA', field: 'date' })
  else if (input.eventDate && input.eventDate < input.date) out.push({ code: 'DATAS_INCOERENTES', field: 'eventDate' })
  const time = input.time?.trim()
  if (time && !isValidTime(time)) out.push({ code: 'HORARIO_OBRIGATORIO', field: 'time' })
  return out
}

const cents2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Σ preços das peças do rascunho (só os números válidos), em centavos. */
export function reservationGross(input: Pick<ReservationInput, 'items'>): number {
  return cents2((input.items ?? []).reduce((s, i) => s + (Number.isFinite(i.unitPrice) ? i.unitPrice : 0), 0))
}

/**
 * Problemas do rascunho de reserva (spec reservas §3.1), na ordem e com os campos da fonte em memória e da RPC
 * `create_reservation_draft`: cliente, peças, datas (evento, retirada, devolução e a ordem entre elas, retirada até
 * ontem) e desconto. `today` em `aaaa-mm-dd`. Não checa se cliente e peças existem.
 */
export function reservationIssues(input: ReservationInput, today: string): SourceIssue[] {
  const out: SourceIssue[] = []
  const items = input.items ?? []
  if (!input.customerId) out.push({ code: 'RESERVA_SEM_CLIENTE', field: 'customerId' })
  if (!items.length) out.push({ code: 'RESERVA_SEM_PECAS', field: 'items' })
  else if (new Set(items.map((i) => i.garmentId)).size !== items.length || items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice < 0 || (i.itemDiscount ?? 0) < 0))
    out.push({ code: 'PARAMETRO_INVALIDO', field: 'items' })
  const { eventDate: ev, pickupDate: pk, returnDueDate: rt } = input
  const okEv = isValidISODate(ev)
  const okPk = isValidISODate(pk)
  const okRt = isValidISODate(rt)
  if (!okEv) out.push({ code: 'DATA_EVENTO_OBRIGATORIA', field: 'eventDate' })
  if (!okPk) out.push({ code: 'DATA_OBRIGATORIA', field: 'pickupDate' })
  if (!okRt) out.push({ code: 'DATA_OBRIGATORIA', field: 'returnDueDate' })
  if (okPk && okRt && rt < pk) out.push({ code: 'DEVOLUCAO_ANTES_RETIRADA', field: 'returnDueDate' })
  if (okEv && okPk && ev < pk) out.push({ code: 'EVENTO_ANTES_RETIRADA', field: 'eventDate' })
  if (okEv && okRt && ev > rt) out.push({ code: 'EVENTO_DEPOIS_DEVOLUCAO', field: 'eventDate' })
  if (okPk && pk < addDays(today, -1)) out.push({ code: 'RETIRADA_NO_PASSADO', field: 'pickupDate' })
  const discount = input.discount
  const itemDiscounts = items.reduce((s, i) => s + (i.itemDiscount ?? 0), 0)
  if (!Number.isFinite(discount) || discount < 0) out.push({ code: 'DESCONTO_NEGATIVO', field: 'discount' })
  else if (items.length && discount + itemDiscounts > reservationGross(input) + 0.001) out.push({ code: 'DESCONTO_MAIOR_QUE_BRUTO', field: 'discount' })
  return out
}

/** Detalhe de `DESCONTO_MAIOR_QUE_BRUTO` (o mesmo `hint` da RPC). */
export function reservationDiscountHint(input: ReservationInput): string {
  return `O desconto (${brl(input.discount)}) é maior que o valor das peças (${brl(reservationGross(input))}).`
}

/** Problemas de "marcar contrato como assinado": data (não futura) e nome de quem assinou. */
export function contractSignIssues(input: ContractSignInput, today: string): SourceIssue[] {
  const out: SourceIssue[] = []
  if (!isValidISODate(input.signedAt)) out.push({ code: 'DATA_OBRIGATORIA', field: 'signedAt' })
  else if (input.signedAt > today) out.push({ code: 'DATA_FUTURA', field: 'signedAt' })
  if (!input.signerName?.trim()) out.push({ code: 'NOME_CLIENTE_OBRIGATORIO', field: 'signerName' })
  return out
}

/** Campos comuns de um lançamento financeiro (conta a pagar ou a receber). */
export type FinEntryFields = { description?: string; categoryId?: string | null; amount?: number; dueDate?: string }

/**
 * Problemas de um lançamento financeiro (spec `operacao-financeiro.md` §2.3), na ordem das RPCs: descrição,
 * categoria, valor > 0 e vencimento. `categoryOk` diz se a categoria serve (do tipo certo e não arquivada — quem
 * tem a lista decide); sem ela, basta estar preenchida (o banco confere o resto). Com `partial`, só os campos enviados.
 */
export function finEntryIssues(i: FinEntryFields, categoryOk: boolean = !!i.categoryId, partial = false): SourceIssue[] {
  const out: SourceIssue[] = []
  const has = (k: keyof FinEntryFields) => !partial || k in i
  if (has('description') && !i.description?.trim()) out.push({ code: 'DESCRICAO_OBRIGATORIA', field: 'description' })
  if (has('categoryId') && !categoryOk) out.push({ code: 'CATEGORIA_OBRIGATORIA', field: 'categoryId' })
  if (has('amount') && (!Number.isFinite(i.amount) || (i.amount ?? 0) <= 0)) out.push({ code: 'VALOR_INVALIDO', field: 'amount' })
  if (has('dueDate') && !i.dueDate) out.push({ code: 'VENCIMENTO_OBRIGATORIO', field: 'dueDate' })
  return out
}

/** Data de baixa (recebimento/pagamento): obrigatória e não futura. */
export function settleDateIssue(date: string | undefined, today: string, field: string): SourceIssue | null {
  if (!date) return { code: 'DATA_OBRIGATORIA', field }
  return date > today ? { code: 'DATA_FUTURA', field } : null
}

/** Recorrência com data final anterior ao vencimento. */
export function recurrenceEndIssues(i: { recurrence?: string; recurrenceEnd?: string | null; dueDate?: string }): SourceIssue[] {
  return i.recurrence && i.recurrence !== 'nenhuma' && i.recurrenceEnd && i.dueDate && i.recurrenceEnd < i.dueDate ? [{ code: 'RECORRENCIA_FIM_INVALIDO', field: 'recurrenceEnd' }] : []
}

/** Valor de baixa: > 0 (o banco confere o saldo). */
export function settleAmountIssues(amount: number, field: string): SourceIssue[] {
  return !Number.isFinite(amount) || amount <= 0 ? [{ code: 'VALOR_INVALIDO', field }] : []
}
