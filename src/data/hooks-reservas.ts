/**
 * Hooks de Reservas. Chaves: ['reservations', filtro, página], ['reservations', 'summary'],
 * ['reservations', 'customer', id], ['reservations', 'garment', id], ['reservations', 'availability', peças, retirada, devolução, ignorar],
 * ['reservations', 'alternatives', peça, retirada, devolução], ['reservations', 'settings'], ['reservation', id].
 * Toda mutação chama `invalidateWorld` (uma reserva muda agenda, peças, caixa e alertas).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateWorld } from './hooks'
import { useDataSource } from './source'
import type {
  ContractSignInput,
  DepositRetention,
  PageRequest,
  PaymentInput,
  PaymentMethod,
  PickupDecision,
  Reservation,
  ReservationFilter,
  ReservationInput,
  ReturnDecision,
  SignalInput,
} from './types'

export const reservaKeys = {
  list: (filter: ReservationFilter, page: PageRequest) => ['reservations', filter, page] as const,
  summary: ['reservations', 'summary'] as const,
  ofCustomer: (id: string) => ['reservations', 'customer', id] as const,
  ofGarment: (id: string) => ['reservations', 'garment', id] as const,
  availability: (garmentIds: string[], pickup: string, returnDue: string, ignore?: string) => ['reservations', 'availability', garmentIds, pickup, returnDue, ignore ?? null] as const,
  alternatives: (garmentId: string, pickup: string, returnDue: string) => ['reservations', 'alternatives', garmentId, pickup, returnDue] as const,
  settings: ['reservations', 'settings'] as const,
  reservation: (id: string) => ['reservation', id] as const,
}

/* ------------------------------------------------------------------ leituras */

export function useReservations(filter: ReservationFilter, page: PageRequest) {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.list(filter, page), queryFn: () => src.listReservations(filter, page), placeholderData: keepPreviousData })
}

/** `{ active, toReceive }` do subtítulo da lista. */
export function useReservationSummary() {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.summary, queryFn: () => src.reservationSummary() })
}

/** `data === null` → reserva não encontrada. */
export function useReservation(id: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.reservation(id ?? ''), queryFn: () => src.getReservation(id!), enabled: !!id })
}

/** Disponibilidade das peças no período (`enabled` só com datas e peças). */
export function useAvailability(garmentIds: string[], pickup: string, returnDue: string, ignoreReservationId?: string) {
  const src = useDataSource()
  return useQuery({
    queryKey: reservaKeys.availability(garmentIds, pickup, returnDue, ignoreReservationId),
    queryFn: () => src.checkAvailability(garmentIds, pickup, returnDue, ignoreReservationId),
    enabled: garmentIds.length > 0 && !!pickup && !!returnDue,
    placeholderData: keepPreviousData,
  })
}

export function useAlternatives(garmentId: string | undefined, pickup: string, returnDue: string) {
  const src = useDataSource()
  return useQuery({
    queryKey: reservaKeys.alternatives(garmentId ?? '', pickup, returnDue),
    queryFn: () => src.alternatives(garmentId!, pickup, returnDue),
    enabled: !!garmentId && !!pickup && !!returnDue,
  })
}

/** `enabled = false` (ex.: sem `reserva.view`) não consulta. */
export function useCustomerReservations(customerId: string | undefined, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.ofCustomer(customerId ?? ''), queryFn: () => src.reservationsOfCustomer(customerId!), enabled: !!customerId && enabled })
}

export function useGarmentReservations(garmentId: string | undefined, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.ofGarment(garmentId ?? ''), queryFn: () => src.reservationsOfGarment(garmentId!), enabled: !!garmentId && enabled })
}

export function useSettings() {
  const src = useDataSource()
  return useQuery({ queryKey: reservaKeys.settings, queryFn: () => src.getSettings() })
}

/* ------------------------------------------------------------------ mutações */

function useWorldMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateWorld(qc) })
}

export function useCreateDraft() {
  const src = useDataSource()
  return useWorldMutation((v: { input: ReservationInput; exceptionId?: string }) => src.createDraft(v.input, v.exceptionId))
}

export function useUpdateDraft(id: string) {
  const src = useDataSource()
  return useWorldMutation((v: { input: ReservationInput; exceptionId?: string }) => src.updateDraft(id, v.input, v.exceptionId))
}

export function useAddDraftItem(id: string) {
  const src = useDataSource()
  return useWorldMutation((garmentId: string) => src.addDraftItem(id, garmentId))
}

export function useRemoveDraftItem(id: string) {
  const src = useDataSource()
  return useWorldMutation((itemId: string) => src.removeDraftItem(id, itemId))
}

export function useMarkContractSigned(id: string) {
  const src = useDataSource()
  return useWorldMutation((input: ContractSignInput) => src.markContractSigned(id, input))
}

/** Resultado `{ ok: false, conflicts }` não é erro: a tela mostra "Confirmação recusada". */
export function useConfirmReservation(id: string) {
  const src = useDataSource()
  return useWorldMutation((v: { signal: SignalInput; exceptionId?: string }) => src.confirmReservation(id, v.signal, v.exceptionId))
}

export function useRegisterPayment(id: string) {
  const src = useDataSource()
  return useWorldMutation((input: PaymentInput) => src.registerPayment(id, input))
}

export function useReturnDeposit(id: string) {
  const src = useDataSource()
  return useWorldMutation(({ method, retain }: { method: PaymentMethod; retain?: DepositRetention }) => src.returnDeposit(id, method, retain))
}

export function useMarkReady(id: string) {
  const src = useDataSource()
  return useWorldMutation<void, Reservation>(() => src.markReady(id))
}

export function usePickupItems(id: string) {
  const src = useDataSource()
  return useWorldMutation((v: { decisions: PickupDecision[]; exceptionId?: string }) => src.pickupItems(id, v.decisions, v.exceptionId))
}

export function useReturnItems(id: string) {
  const src = useDataSource()
  return useWorldMutation((decisions: ReturnDecision[]) => src.returnItems(id, decisions))
}

export function useCancelReservation(id: string) {
  const src = useDataSource()
  return useWorldMutation((reason: string) => src.cancelReservation(id, reason))
}

export function useMarkNoShow(id: string) {
  const src = useDataSource()
  return useWorldMutation<void, Reservation>(() => src.markNoShow(id))
}
