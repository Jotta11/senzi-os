/** Inteligência na fonte em memória: o relatório puro de `domain/intel` sobre o mesmo mundo e o mesmo "hoje". */
import { intelReport } from '@/domain/intel'
import type { IntelSource } from '../source-painel'
import type { MockCtx } from './context'

export function intel(ctx: MockCtx): IntelSource {
  return {
    intelReport: (days, categorySlug) => ctx.run(() => intelReport(ctx.db, days, ctx.today, categorySlug)),
  }
}
