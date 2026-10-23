/**
 * Regras de validação do Plano 2B (mesmos códigos das RPCs), compartilhadas pela fonte em memória
 * e pelos formulários (que podem validar antes de enviar).
 */
import { isValidCPF } from '@/lib/cpf'
import { onlyDigits } from '@/lib/format'
import type { CustomerInput, GarmentInput, SourceIssue } from './types'

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
  return out
}

/**
 * Problemas de uma cliente, na ordem do formulário. `today` em `aaaa-mm-dd`.
 * Não checa duplicidade de CPF (isso depende dos dados).
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
    if (!ISO_DATE.test(b) || Number.isNaN(Date.parse(b)) || b > today) out.push({ code: 'NASCIMENTO_INVALIDO', field: 'birthDate' })
  }
  if (has('cpf') && !isValidCPF(input.cpf ?? '')) out.push({ code: 'CPF_INVALIDO', field: 'cpf' })
  if (input.email && !EMAIL_RE.test(input.email.trim())) out.push({ code: 'EMAIL_INVALIDO', field: 'email' })
  return out
}
