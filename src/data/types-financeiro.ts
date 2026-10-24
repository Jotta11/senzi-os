/** Tipos do Financeiro (spec `operacao-financeiro.md`, §2.5). Pagamentos de reserva ficam em `types-reservas.ts`. */
import type { PaymentKind, PaymentMethod } from './types-reservas'

export type FinCategoryType = 'receita' | 'despesa'
export type FinCategory = {
  id: string
  name: string
  type: FinCategoryType
  color: string
  isSystem: boolean
  archived: boolean
  usageCount?: number
}

export type Recurrence = 'nenhuma' | 'semanal' | 'mensal' | 'anual'

/** `vencida` é derivado (aberta com vencimento antes de hoje). */
export type PayableStatus = 'aberta' | 'paga' | 'cancelada'
export type Payable = {
  id: string
  description: string
  supplier: string | null
  categoryId: string
  amount: number
  dueDate: string
  status: PayableStatus
  paidAt: string | null
  /** Valor efetivamente pago (juros/desconto). */
  paidAmount: number | null
  method: PaymentMethod | null
  recurrence: Recurrence
  recurrenceEnd: string | null
  recurrenceParentId: string | null
  /** `operacao` e `aquisicao` são automáticas e somente leitura. */
  source: 'manual' | 'operacao' | 'aquisicao'
  garmentId: string | null
  maintenanceId: string | null
  reservationId: string | null
  notes: string | null
  createdBy: string
  createdAt: string
}

/** `vencido` é derivado. */
export type ReceivableStatus = 'aberto' | 'parcial' | 'pago' | 'cancelado'
/** Linha unificada: parcelas da reserva + lançamentos avulsos. */
export type Receivable = {
  id: string
  source: 'reserva' | 'avulso'
  kind: PaymentKind | 'avulso'
  description: string
  categoryId: string | null
  reservationId: string | null
  reservationCode: string | null
  customerId: string | null
  customerName: string | null
  payerName: string | null
  amount: number
  paidAmount: number
  dueDate: string
  status: ReceivableStatus
  receivedAt: string | null
  method: PaymentMethod | null
  /** `true` para caução (custódia, fora do resultado). */
  isCustody: boolean
  notes: string | null
}

export type FinanceRange = '30' | '90' | '365'
export type FinanceOverview = {
  range: FinanceRange
  from: string
  to: string
  received: number
  receivedCount: number
  toReceive: number
  toReceiveReservations: number
  /** Os campos `| null` exigem `financeiro.consolidated`. */
  paid: number | null
  operatingCost: number | null
  /** `1 - operatingCost/received`; `null` se `received = 0`. */
  operatingMargin: number | null
  acquisitionInvested: number | null
  result: number | null
  operatingResult: number | null
  custody: number
  /** 12 meses (`k` = `aaaa-mm`). */
  monthly: { k: string; v: number; paid?: number | null }[]
  byMethod: { method: PaymentMethod; label: string; total: number; count: number }[]
  receivableRows: { reservationId: string; code: string; customerName: string; pickupDate: string; devido: number; due: number }[]
  pendingCharges: { kind: PaymentKind; customerName: string; notes: string | null; amount: number }[]
  latest: { paidAt: string; reservationId: string | null; code: string | null; customerName: string | null; kind: PaymentKind; method: PaymentMethod; amount: number }[]
}
