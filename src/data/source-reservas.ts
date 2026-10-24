import type {
  AvailabilityResult,
  ConfirmResult,
  ContractSignInput,
  ExceptionKind,
  Garment,
  PageRequest,
  PageResult,
  PaymentInput,
  PaymentMethod,
  PickupDecision,
  Reservation,
  ReservationDetail,
  ReservationFilter,
  ReservationInput,
  ReservationRow,
  ReturnDecision,
  Settings,
  SignalInput,
} from './types'

/**
 * Porta de dados de Reservas (spec `telas/reservas.md`). Cada mutação é uma operação atômica (no banco, uma RPC
 * com lock): valida tudo antes de mudar qualquer coisa. Erros de regra chegam como `SourceError`:
 * validação do rascunho (todos em `issues`; `field` = `customerId|items|eventDate|returnDueDate|pickupDate|discount`),
 * `DESCONTO_ACIMA_LIMITE`, `CONTRATO_NAO_ASSINADO`, `SINAL_INSUFICIENTE`, `VALOR_INVALIDO`, `VALOR_EXCEDE_SALDO` (`hint` = saldo),
 * `SALDO_EM_ABERTO`, `RESERVA_SEM_PECAS`, `MOTIVO_OBRIGATORIO`, `ESTADO_INVALIDO` (ação fora do estado), `NAO_ENCONTRADO`.
 * Exceções (`exceptionId`) vêm do `ExceptionAuthorizer` e só valem uma vez, para o tipo e a reserva certos.
 */
export interface ReservasSource {
  /** Ordem: retirada crescente (em `encerradas`, decrescente). */
  listReservations(filter: ReservationFilter, page: PageRequest): Promise<PageResult<ReservationRow>>
  /** Reservas em estado ativo (`confirmada` … `aguardando_devolucao`) e Σ saldo delas. */
  reservationSummary(): Promise<{ active: number; toReceive: number }>
  getReservation(id: string): Promise<ReservationDetail | null>
  /** Uma entrada por peça, na ordem pedida (inclui conflito com outros rascunhos, `draft: true`). */
  checkAvailability(garmentIds: string[], pickup: string, returnDue: string, ignoreReservationId?: string): Promise<AvailabilityResult[]>
  /** Até 4 peças livres semelhantes. */
  alternatives(garmentId: string, pickup: string, returnDue: string): Promise<Garment[]>

  /** Conflitos não bloqueiam o rascunho. Gera o contrato (v1). Com `fittingId`, converte a prova. */
  createDraft(input: ReservationInput, exceptionId?: string): Promise<Reservation>
  /** Só `rascunho`. Regera o contrato (versão + 1). */
  updateDraft(id: string, input: ReservationInput, exceptionId?: string): Promise<Reservation>
  addDraftItem(id: string, garmentId: string): Promise<Reservation>
  /** `RESERVA_SEM_PECAS` se ficaria vazia. */
  removeDraftItem(id: string, itemId: string): Promise<Reservation>
  /** `signedAt` em `aaaa-mm-dd`. Congela o corpo do contrato. */
  markContractSigned(id: string, input: ContractSignInput): Promise<Reservation>
  /** Conflito de agenda em qualquer peça → `{ ok: false }` e nada muda. */
  confirmReservation(id: string, signal: SignalInput, exceptionId?: string): Promise<ConfirmResult>

  registerPayment(id: string, input: PaymentInput): Promise<Reservation>
  /** Estorno da caução retida (`refersTo: 'caucao'`); só depois de encerrada. */
  returnDeposit(id: string, method: PaymentMethod): Promise<Reservation>

  /** `confirmada → pronta_retirada`. */
  markReady(id: string): Promise<Reservation>
  /** Com saldo em aberto exige exceção `retirada_com_saldo`. */
  pickupItems(id: string, decisions: PickupDecision[], exceptionId?: string): Promise<Reservation>
  /** Multa única por reserva, recalculada a cada devolução. Peça devolvida → `inspecao`. */
  returnItems(id: string, decisions: ReturnDecision[]): Promise<Reservation>
  /** Só sem peça com a cliente (`rascunho`, `confirmada`, `pronta_retirada`). Libera blocos e compromissos. */
  cancelReservation(id: string, reason: string): Promise<Reservation>
  /** `confirmada|pronta_retirada` com retirada no passado. */
  markNoShow(id: string): Promise<Reservation>

  /** Retirada decrescente. */
  reservationsOfCustomer(customerId: string): Promise<ReservationRow[]>
  /** Retirada decrescente. */
  reservationsOfGarment(garmentId: string): Promise<ReservationRow[]>
  getSettings(): Promise<Settings>
}

export type ActiveAdmin = { id: string; full_name: string; email: string }
export type AuthorizeArgs = { email: string; pin: string; kind: ExceptionKind; reason: string; refType: string; refId: string }
export type AuthorizeResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Autorização de exceção por PIN de administrador (mesmo contrato da RPC `authorize_exception`):
 * `AUTORIZACAO_INVALIDA`, `PIN_BLOQUEADO` (5 erros em 15 min), `MOTIVO_OBRIGATORIO` vêm no retorno.
 */
export interface ExceptionsSource {
  listActiveAdmins(): Promise<ActiveAdmin[]>
  authorizeException(args: AuthorizeArgs): Promise<AuthorizeResult>
}
