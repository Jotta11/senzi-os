/**
 * Hooks da Operação. Chaves: ['operacao', 'queue'], ['operacao', 'checklist'], ['operacao', 'target', peça],
 * ['operacao', 'garment', peça], ['operacao', 'suppliers']. Toda mutação chama `invalidateWorld`
 * (a inspeção muda peça, reserva, calendário e caixa; Reservas e Acervo refletem sem recarregar).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateWorld } from './hooks'
import { useDataSource } from './source'
import type { CloseMaintenanceInput, InspectionInput } from './types'

export function useOperacaoQueue() {
  const src = useDataSource()
  return useQuery({ queryKey: ['operacao', 'queue'], queryFn: () => src.operacaoQueue() })
}

export function useChecklist() {
  const src = useDataSource()
  return useQuery({ queryKey: ['operacao', 'checklist'], queryFn: () => src.checklist() })
}

/** Reserva da devolução da peça (`null` se não há). */
export function useInspectionTarget(garmentId: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: ['operacao', 'target', garmentId ?? ''], queryFn: () => src.inspectionTarget(garmentId!), enabled: !!garmentId })
}

/** Ordens e inspeções da peça. `enabled = false` (sem `operacao.view`) não consulta. */
export function useGarmentMaintenances(garmentId: string | undefined, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: ['operacao', 'garment', garmentId ?? ''], queryFn: () => src.maintenancesOf(garmentId!), enabled: !!garmentId && enabled })
}

export function useSuppliers() {
  const src = useDataSource()
  return useQuery({ queryKey: ['operacao', 'suppliers'], queryFn: () => src.suppliers() })
}

function useWorldMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateWorld(qc) })
}

export function useRegisterInspection() {
  const src = useDataSource()
  return useWorldMutation((input: InspectionInput) => src.registerInspection(input))
}

export function useCloseMaintenance() {
  const src = useDataSource()
  return useWorldMutation((input: CloseMaintenanceInput) => src.closeMaintenance(input))
}

export function useReleaseGarment() {
  const src = useDataSource()
  return useWorldMutation((v: { garmentId: string; note: string }) => src.releaseGarment(v.garmentId, v.note))
}
