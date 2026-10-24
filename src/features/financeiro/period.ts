import { useSearchParams } from 'react-router'
import type { FinanceRange } from '@/data/types'
import { brl } from '@/lib/format'

export type ListRange = FinanceRange | 'tudo'

export const PERIOD_LABEL: Record<ListRange, string> = { '30': '30 dias', '90': '90 dias', '365': '12 meses', tudo: 'Tudo' }
export const brl0 = (n: number) => brl(n, { cents: false })
export const pct = (n: number) => `${Math.round(n * 100)}%`

/** Período na URL (`?periodo=30|90|365`, e `tudo` nas listas); padrão 90 dias. */
export function usePeriod<T extends ListRange = FinanceRange>(allowAll = false): [T, (p: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('periodo')
  const value = (raw === '30' || raw === '365' || (allowAll && raw === 'tudo') ? raw : '90') as T
  const set = (p: T) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p === '90') next.delete('periodo')
        else next.set('periodo', p)
        return next
      },
      { replace: true },
    )
  return [value, set]
}

/** "últimos 30 dias" / "últimos 12 meses" para subtítulos. */
export const rangeText = (r: ListRange) => (r === 'tudo' ? 'todo o período' : r === '365' ? 'últimos 12 meses' : `últimos ${r} dias`)
