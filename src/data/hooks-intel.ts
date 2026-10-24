/** Hook da Inteligência. Chave: ['intel', período, categoria]; entra no `invalidateWorld` (tudo muda o relatório). */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDataSource } from './source'
import type { IntelPeriod } from './types'

export function useIntelReport(days: IntelPeriod, categorySlug: string | null, enabled = true) {
  const src = useDataSource()
  return useQuery({ queryKey: ['intel', days, categorySlug], queryFn: () => src.intelReport(days, categorySlug), placeholderData: keepPreviousData, enabled })
}
