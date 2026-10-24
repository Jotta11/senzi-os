/**
 * Hooks de Agenda e Provas. Chaves: ['agenda', 'range', de, até], ['agenda', 'month', mês], ['agenda', 'users'],
 * ['fittings', filtro, página], ['fittings', 'kpis'], ['fittings', 'customer', id], ['fittings', 'stats', peça], ['fitting', id].
 * Toda mutação chama `invalidateWorld`.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateWorld } from './hooks'
import { useDataSource } from './source'
import type { AppointmentInput, FitOutcome, FittingFilter, FittingInput, PageRequest } from './types'

export const agendaKeys = {
  range: (from: string, to: string) => ['agenda', 'range', from, to] as const,
  month: (month: string) => ['agenda', 'month', month] as const,
  users: ['agenda', 'users'] as const,
  fittings: (filter: FittingFilter, page: PageRequest) => ['fittings', filter, page] as const,
  kpis: ['fittings', 'kpis'] as const,
  fitting: (id: string) => ['fitting', id] as const,
  ofCustomer: (id: string) => ['fittings', 'customer', id] as const,
  stats: (garmentId: string) => ['fittings', 'stats', garmentId] as const,
}

/** Um dia por data de `from` a `to` (inclusive). */
export function useAgendaRange(from: string, to: string) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.range(from, to), queryFn: () => src.agendaRange(from, to), placeholderData: keepPreviousData })
}

/** Dias do mês (`aaaa-mm`) com compromisso (mini calendário). */
export function useAgendaMonthDays(month: string) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.month(month), queryFn: () => src.agendaMonthDays(month), placeholderData: keepPreviousData })
}

export function useUsers() {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.users, queryFn: () => src.listUsers(), staleTime: Infinity })
}

export function useFittings(filter: FittingFilter, page: PageRequest) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.fittings(filter, page), queryFn: () => src.listFittings(filter, page), placeholderData: keepPreviousData })
}

export function useFittingKpis() {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.kpis, queryFn: () => src.fittingKpis() })
}

/** `data === null` → prova não encontrada. */
export function useFitting(id: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.fitting(id ?? ''), queryFn: () => src.getFitting(id!), enabled: !!id })
}

export function useCustomerFittings(customerId: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.ofCustomer(customerId ?? ''), queryFn: () => src.fittingsOfCustomer(customerId!), enabled: !!customerId })
}

export function useFittingStats(garmentId: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: agendaKeys.stats(garmentId ?? ''), queryFn: () => src.fittingStatsOf(garmentId!), enabled: !!garmentId })
}

/* ------------------------------------------------------------------ mutações */

export function useCreateAppointment() {
  const src = useDataSource()
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: AppointmentInput) => src.createAppointment(input), onSuccess: () => invalidateWorld(qc) })
}

export function useUpdateAppointment() {
  const src = useDataSource()
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { id: string; input: AppointmentInput }) => src.updateAppointment(v.id, v.input), onSuccess: () => invalidateWorld(qc) })
}

export function useCancelAppointment() {
  const src = useDataSource()
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => src.cancelAppointment(id), onSuccess: () => invalidateWorld(qc) })
}

export function useCreateFitting() {
  const src = useDataSource()
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: FittingInput) => src.createFitting(input), onSuccess: () => invalidateWorld(qc) })
}

export type FittingAction =
  | { type: 'add'; garmentId: string }
  | { type: 'remove'; garmentId: string }
  | { type: 'outcome'; garmentId: string; outcome?: FitOutcome; needsAlteration?: boolean; note?: string | null }
  | { type: 'close'; state: 'perdida' | 'concluida' | 'no_show'; notes: string | null }

/** Mutação da prova `id`: separar/retirar peça, registrar resultado e encerrar (devolve o detalhe já no cache). */
export function useFittingMutation(id: string) {
  const src = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: FittingAction) => {
      switch (a.type) {
        case 'add':
          return src.addFittingGarment(id, a.garmentId)
        case 'remove':
          return src.removeFittingGarment(id, a.garmentId)
        case 'outcome':
          return src.setFittingOutcome(id, a.garmentId, { outcome: a.outcome, needsAlteration: a.needsAlteration, note: a.note })
        case 'close':
          return src.closeFitting(id, a.state, a.notes)
      }
    },
    onSuccess: (d) => {
      qc.setQueryData(agendaKeys.fitting(id), d)
      return invalidateWorld(qc)
    },
  })
}
