/**
 * Tipos de Reservas (spec `docs/superpowers/specs/telas/reservas.md`, §6).
 * Sem pré-reserva: o primeiro estado é `rascunho`.
 */
import type { BlockKind, Customer, Garment } from './types'

export type ReservationState =
  | 'rascunho'
  | 'confirmada'
  | 'pronta_retirada'
  | 'retirada'
  | 'em_uso'
  | 'aguardando_devolucao'
  | 'devolvida'
  | 'em_inspecao'
  | 'finalizada'
  | 'cancelada'
  | 'no_show'

export type ItemState = 'pendente' | 'retirado' | 'nao_entregue' | 'devolvido' | 'inspecionado' | 'cancelado'
export type PaymentKind = 'sinal' | 'saldo' | 'integral' | 'caucao' | 'multa' | 'estorno'
export type PaymentMethod = 'pix' | 'credito' | 'debito' | 'dinheiro' | 'link' | 'transferencia' | 'outro'
export type PaymentState = 'pago' | 'pendente' | 'parcial' | 'estornado' | 'cancelado'
export type PayStatus = 'nao_pago' | 'parcial' | 'pago'

/** Exceções que exigem PIN de administrador (antes em `AuthorizeExceptionDialog`). */
export type ExceptionKind = 'retirada_com_saldo' | 'desconto_acima_limite' | 'dispensa_sinal_minimo'
export type Channel = 'loja' | 'whatsapp' | 'instagram'

export type ReservationBalance = { devido: number; pago: number; caucao: number; due: number; status: PayStatus }

export type ReservationItem = {
  id: string
  reservationId: string
  garmentId: string
  unitPrice: number
  grossAmount: number
  itemDiscount: number
  allocatedOrderDiscount: number
  netRevenue: number
  itemState: ItemState
  pickedUpAt: string | null
  returnedAt: string | null
  pickupNote: string | null
  returnNote: string | null
  alterationNotes: string | null
}

export type Payment = {
  id: string
  reservationId: string
  kind: PaymentKind
  method: PaymentMethod
  amount: number
  state: PaymentState
  paidAt: string | null
  /** Saldo = retirada; multa = hoje. */
  dueAt: string | null
  reference: string | null
  notes: string | null
  /** Estorno de caução não mexe no saldo (Decisão 6). */
  refersTo?: 'caucao' | null
  createdBy: string
  createdAt: string
}

export type Contract = {
  id: string
  reservationId: string
  /** `CT-2026-0001`. */
  number: string
  version: number
  bodyRendered: string
  generatedAt: string
  templateVersion: number
  terms: { lateFeeDailyPercent: number; deposit: number }
  signedAt: string | null
  signedBy: string | null
  signerName: string | null
  signatureKind: 'presencial' | null
  /** Observação de quem marcou como assinado. */
  signatureNotes?: string | null
  pdfPath: string | null
}

export type ExceptionAuthorization = {
  id: string
  reservationId: string
  kind: ExceptionKind
  amount: number
  /** Valor máximo autorizado no PIN (obrigatório no desconto acima do limite; opcional nos outros tipos). */
  maxAmount?: number | null
  reason: string
  authorizedBy: string
  authorizedByName: string
  authorizedByRole: string
  authorizedAt: string
  /** `reserva` (id da reserva) ou `reserva_rascunho` (id temporário, religado ao criar o rascunho). */
  refType?: string
}

export type ReservationHistoryEntry = {
  id: string
  fromState: ReservationState | null
  toState: ReservationState
  reason: string | null
  userId: string
  userName?: string
  occurredAt: string
}

export type Reservation = {
  id: string
  /** `RS-2026-0001`. */
  code: string
  customerId: string
  state: ReservationState
  eventDate: string | null
  eventType: string | null
  eventVenue: string | null
  pickupDate: string
  returnDueDate: string
  pickedUpAt: string | null
  returnedAt: string | null
  channel: Channel
  totalGross: number
  discount: number
  totalNet: number
  depositAmount: number
  lateFee: number
  notes: string | null
  cancelReason: string | null
  createdBy: string
  createdAt: string
  items: ReservationItem[]
  payments: Payment[]
  contract: Contract | null
  authorizations: ExceptionAuthorization[]
  history: ReservationHistoryEntry[]
  fittingId: string | null
  balance: ReservationBalance
}

/** Criar/editar rascunho. */
export type ReservationInput = {
  customerId: string
  eventDate: string
  eventType?: string
  eventVenue?: string
  pickupDate: string
  returnDueDate: string
  channel?: Channel
  discount: number
  notes?: string
  fittingId?: string
  items: { garmentId: string; unitPrice: number; itemDiscount?: number; alterationNotes?: string }[]
}

export type PickupDecision = { itemId: string; delivered: boolean; note?: string }
export type ReturnDecision = { itemId: string; returned: boolean; note?: string }

export type ReservationFilter = 'ativas' | 'hoje' | 'rascunhos' | 'com_saldo' | 'rua' | 'inspecao' | 'futuras' | 'encerradas' | 'todas'

/** Conflito de agenda de uma peça (`draft: true` = outro rascunho, só aviso). */
export type AvailabilityConflict = {
  kind: BlockKind
  label: string
  from: string
  to: string
  reservationCode: string | null
  draft: boolean
}

export type AvailabilityResult = {
  garmentId: string
  ok: boolean
  conflicts: AvailabilityConflict[]
  reason: string | null
  window: { from: string; to: string; cleaningDays: number }
}

/** Linha da lista de reservas (spec §2.1). `payStatus` é `null` em rascunho/cancelada/no-show; `due` é 0 nesses estados. */
export type ReservationRow = {
  id: string
  code: string
  state: ReservationState
  customerName: string
  garments: { code: string; shortName: string }[]
  eventDate: string | null
  eventType: string | null
  pickupDate: string
  returnDueDate: string
  /** Dias de atraso (só com peça na rua e devolução vencida). */
  daysLate: number
  payStatus: PayStatus | null
  totalNet: number
  due: number
}

/** Ficha da reserva: joins e valores derivados. `conflicts` só em rascunho (peças que não passariam na confirmação). */
export type ReservationDetail = Reservation & {
  customer: Customer
  /** Na ordem dos itens. */
  garments: Garment[]
  conflicts: AvailabilityResult[]
  fittingCode: string | null
  fittingDate: string | null
  minSignal: number
  depositSuggested: number
}

/** Sinal pago na confirmação. */
export type SignalInput = { amount: number; method: PaymentMethod; reference: string | null; notes: string | null }

export type PaymentInput = {
  kind: PaymentKind
  method: PaymentMethod
  amount: number
  reference: string | null
  notes: string | null
  /** `caucao` só para estorno da caução (não mexe no saldo). */
  refersTo?: 'caucao' | null
}

/** Parte da caução que a loja retém ao devolver (dano, perda); `reason` é obrigatório quando `amount > 0`. */
export type DepositRetention = { amount: number; reason: string }

export type ContractSignInput = { signedAt: string; signerName: string; notes: string | null }

export type ConfirmResult = { ok: true; reservation: Reservation } | { ok: false; conflicts: AvailabilityResult[] }
