import type { FinCategory, FinCategoryType, FinanceOverview, FinanceRange, Payable, PaymentMethod, Receivable, Recurrence } from './types'

export type ReceivableFilter = {
  status: 'abertas' | 'vencidas' | 'recebidas' | 'todas'
  origin: 'todas' | 'reservas' | 'avulsas'
  categoryId: string | null
  q: string
  range: FinanceRange | 'tudo'
}
export type ReceivableTotals = { open: number; overdue: number; dueIn7: number; receivedInRange: number }
export type ReceivableList = { rows: Receivable[]; total: number; totals: ReceivableTotals; today: string }

export type PayableFilter = {
  status: 'abertas' | 'vencidas' | 'pagas' | 'todas'
  categoryId: string | null
  recurrence: 'todas' | 'unica' | 'recorrente'
  q: string
  range: FinanceRange | 'tudo'
}
export type PayableTotals = { open: number; overdue: number; dueIn7: number; paidInRange: number }
export type PayableList = { rows: Payable[]; total: number; totals: PayableTotals; today: string }

export type ReceivableInput = {
  description: string
  customerId?: string | null
  payerName?: string | null
  categoryId: string
  amount: number
  dueDate: string
  notes?: string | null
  /** "Já recebido": nasce `pago` na data/forma informadas. */
  received?: boolean
  receivedAt?: string
  method?: PaymentMethod
}
export type ReceiveInput = { amount: number; receivedAt: string; method: PaymentMethod; notes?: string | null }

export type PayableInput = {
  description: string
  supplier?: string | null
  categoryId: string
  amount: number
  dueDate: string
  recurrence?: Recurrence
  recurrenceEnd?: string | null
  notes?: string | null
  /** "Já paga": nasce `paga` na data/forma informadas (e gera a próxima ocorrência). */
  paid?: boolean
  paidAt?: string
  method?: PaymentMethod
}
export type PayInput = { paidAt: string; paidAmount: number; method: PaymentMethod; notes?: string | null }

export type FinCategoryInput = { name: string; type: FinCategoryType; color?: string }

/**
 * Porta de dados do Financeiro (spec `telas/operacao-financeiro.md`, parte 2). Erros como no banco:
 * `DESCRICAO_OBRIGATORIA`, `CATEGORIA_OBRIGATORIA`, `VALOR_INVALIDO`, `VENCIMENTO_OBRIGATORIO`, `DATA_FUTURA`,
 * `RECORRENCIA_FIM_INVALIDO`, `VALOR_EXCEDE_SALDO`, `ESTADO_INVALIDO`, `CATEGORIA_DUPLICADA`, `CATEGORIA_EM_USO`, `CATEGORIA_SISTEMA`.
 */
export interface FinanceiroSource {
  financeOverview(range: FinanceRange): Promise<FinanceOverview>

  /** Parcelas das reservas (derivadas) + avulsos. Abertas/vencidas ignoram o período; as demais filtram pela data de recebimento/vencimento. */
  listReceivables(f: ReceivableFilter): Promise<ReceivableList>
  createReceivable(input: ReceivableInput): Promise<Receivable>
  /** Só avulso em aberto/parcial; parcela de reserva → `ESTADO_INVALIDO` (use o pagamento da reserva). */
  updateReceivable(id: string, input: Partial<ReceivableInput>): Promise<Receivable>
  receiveReceivable(id: string, input: ReceiveInput): Promise<Receivable>
  cancelReceivable(id: string): Promise<Receivable>

  listPayables(f: PayableFilter): Promise<PayableList>
  createPayable(input: PayableInput): Promise<Payable>
  /** Automática (`operacao`/`aquisicao`) ou já paga → `ESTADO_INVALIDO`. */
  updatePayable(id: string, input: Partial<PayableInput>): Promise<Payable>
  /** Baixa integral (valor editável para juros/desconto); gera a próxima ocorrência se recorrente. */
  payPayable(id: string, input: PayInput): Promise<Payable>
  /** Só manual. */
  deletePayable(id: string): Promise<void>

  /** Com contagem de lançamentos. */
  listFinCategories(): Promise<(FinCategory & { usageCount: number })[]>
  createFinCategory(input: FinCategoryInput): Promise<FinCategory>
  updateFinCategory(id: string, input: Partial<FinCategoryInput>): Promise<FinCategory>
  archiveFinCategory(id: string, archived?: boolean): Promise<FinCategory>
  deleteFinCategory(id: string): Promise<void>
}
