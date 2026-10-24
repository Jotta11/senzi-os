/**
 * Hooks do Financeiro. Chaves: ['financeiro', 'overview', período], ['financeiro', 'receber', filtro],
 * ['financeiro', 'pagar', filtro], ['financeiro', 'categorias']. Toda mutação chama `invalidateWorld`
 * (a baixa muda a visão geral, o painel e as categorias; a Operação gera despesas que aparecem aqui).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateWorld } from './hooks'
import { useDataSource } from './source'
import type { FinCategoryInput, PayableFilter, PayableInput, PayInput, ReceivableFilter, ReceivableInput, ReceiveInput } from './source-financeiro'
import type { FinanceRange } from './types'

export const financeiroKeys = {
  overview: (range: FinanceRange) => ['financeiro', 'overview', range] as const,
  receber: (f: ReceivableFilter) => ['financeiro', 'receber', f] as const,
  pagar: (f: PayableFilter) => ['financeiro', 'pagar', f] as const,
  categorias: ['financeiro', 'categorias'] as const,
}

export function useFinanceOverview(range: FinanceRange, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: financeiroKeys.overview(range), queryFn: () => src.financeOverview(range), placeholderData: keepPreviousData, enabled })
}

/** `{ rows, total, totals, today }`. */
export function useReceivables(f: ReceivableFilter) {
  const src = useDataSource()
  return useQuery({ queryKey: financeiroKeys.receber(f), queryFn: () => src.listReceivables(f), placeholderData: keepPreviousData })
}

/** `{ rows, total, totals, today }`. Só com `financeiro.consolidated`: passe `enabled = false` sem a permissão. */
export function usePayables(f: PayableFilter, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: financeiroKeys.pagar(f), queryFn: () => src.listPayables(f), placeholderData: keepPreviousData, enabled })
}

/** Categorias com `usageCount`. */
export function useFinCategories(enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: financeiroKeys.categorias, queryFn: () => src.listFinCategories(), enabled })
}

function useWorldMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateWorld(qc) })
}

export function useCreateReceivable() {
  const src = useDataSource()
  return useWorldMutation((input: ReceivableInput) => src.createReceivable(input))
}
export function useUpdateReceivable() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; input: Partial<ReceivableInput> }) => src.updateReceivable(v.id, v.input))
}
export function useReceiveReceivable() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; input: ReceiveInput }) => src.receiveReceivable(v.id, v.input))
}
export function useCancelReceivable() {
  const src = useDataSource()
  return useWorldMutation((id: string) => src.cancelReceivable(id))
}

export function useCreatePayable() {
  const src = useDataSource()
  return useWorldMutation((input: PayableInput) => src.createPayable(input))
}
export function useUpdatePayable() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; input: Partial<PayableInput> }) => src.updatePayable(v.id, v.input))
}
export function usePayPayable() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; input: PayInput }) => src.payPayable(v.id, v.input))
}
export function useDeletePayable() {
  const src = useDataSource()
  return useWorldMutation((id: string) => src.deletePayable(id))
}

export function useCreateFinCategory() {
  const src = useDataSource()
  return useWorldMutation((input: FinCategoryInput) => src.createFinCategory(input))
}
export function useUpdateFinCategory() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; input: Partial<FinCategoryInput> }) => src.updateFinCategory(v.id, v.input))
}
export function useArchiveFinCategory() {
  const src = useDataSource()
  return useWorldMutation((v: { id: string; archived?: boolean }) => src.archiveFinCategory(v.id, v.archived))
}
export function useDeleteFinCategory() {
  const src = useDataSource()
  return useWorldMutation((id: string) => src.deleteFinCategory(id))
}
