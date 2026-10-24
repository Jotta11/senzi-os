/** Hook do Dashboard. Chave: ['dashboard', período]; entra no `invalidateWorld` (reserva, caixa, peças e provas mudam o painel). */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDataSource } from './source'

export type DashboardRange = '7' | '30' | '90'

export function useDashboard(range: DashboardRange) {
  const src = useDataSource()
  return useQuery({ queryKey: ['dashboard', range], queryFn: () => src.dashboardSummary(range), placeholderData: keepPreviousData })
}
