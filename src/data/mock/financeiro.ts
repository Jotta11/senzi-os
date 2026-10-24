/** Financeiro na fonte em memória: visão geral, contas a receber, contas a pagar e categorias sobre o mesmo mundo. */
import { financeOverview } from '@/domain/finance'
import type { FinanceiroSource } from '../source-financeiro'
import type { MockCtx } from './context'
import { financeiroCategorias } from './financeiro-categorias'
import { financeiroPagar } from './financeiro-pagar'
import { financeiroReceber } from './financeiro-receber'

export function financeiro(ctx: MockCtx): FinanceiroSource {
  return {
    financeOverview: (range) => ctx.run(() => financeOverview(ctx.db, range, ctx.today)),
    ...financeiroReceber(ctx),
    ...financeiroPagar(ctx),
    ...financeiroCategorias(ctx),
  }
}
