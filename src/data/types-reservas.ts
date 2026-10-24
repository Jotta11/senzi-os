/**
 * Tipos de Reservas (spec `docs/superpowers/specs/telas/reservas.md`, §6).
 * Sem pré-reserva: o primeiro estado é `rascunho`.
 */
import type { BlockKind } from './types'

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
  pdfPath: string | null
}

export type ExceptionAuthorization = {
  id: string
  reservationId: string
  kind: ExceptionKind
  amount: number
  reason: string
  authorizedBy: string
  authorizedByName: string
  authorizedByRole: string
  authorizedAt: string
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
