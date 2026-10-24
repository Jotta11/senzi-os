/** Apoio do Financeiro em memória: validação comum (spec §2.3), janela de período e busca. */
import { rangeBounds } from '@/domain/finance'
import { addDays, normalize } from '@/lib/format'
import type { FinCategoryType, FinanceRange, SourceIssue } from '../types'
import { fail, type MockCtx } from './context'

const day = (iso: string): string => iso.slice(0, 10)

export type Common = { description?: string; categoryId?: string; amount?: number; dueDate?: string }

/** Descrição, categoria (do tipo certo e não arquivada), valor > 0 e vencimento; devolve todos os problemas de uma vez. */
export function commonIssues(ctx: MockCtx, i: Common, type: FinCategoryType): SourceIssue[] {
  const issues: SourceIssue[] = []
  if (!i.description?.trim()) issues.push({ code: 'DESCRICAO_OBRIGATORIA', field: 'description' })
  const cat = ctx.db.finCategories.find((c) => c.id === i.categoryId)
  if (!cat || cat.type !== type || cat.archived) issues.push({ code: 'CATEGORIA_OBRIGATORIA', field: 'categoryId' })
  if (!Number.isFinite(i.amount) || (i.amount ?? 0) <= 0) issues.push({ code: 'VALOR_INVALIDO', field: 'amount' })
  if (!i.dueDate) issues.push({ code: 'VENCIMENTO_OBRIGATORIO', field: 'dueDate' })
  return issues
}

/** Data de baixa: obrigatória e não futura. */
export function settleDateIssue(ctx: MockCtx, date: string | undefined, field: string): SourceIssue | null {
  if (!date) return { code: 'DATA_OBRIGATORIA', field }
  return date > ctx.today ? { code: 'DATA_FUTURA', field } : null
}

export function failWith(issues: SourceIssue[]): void {
  if (issues.length) fail(issues)
}

/**
 * Período de uma linha. Em aberto: só limite inferior (o que ainda vence continua aparecendo);
 * quitada: a data da baixa dentro de `[from, to]`. `tudo` não filtra.
 */
export function inWindow(key: string, settled: boolean, range: FinanceRange | 'tudo', today: string): boolean {
  if (range === 'tudo') return true
  const { from, to } = rangeBounds(range, today)
  const d = day(key)
  return settled ? d >= from && d <= to : d >= from
}

export const dueIn7 = (due: string, today: string): boolean => due >= today && due <= addDays(today, 7)

export const matches = (q: string, ...fields: (string | null | undefined)[]): boolean => {
  const n = normalize(q)
  return !n || fields.some((f) => normalize(f).includes(n))
}
