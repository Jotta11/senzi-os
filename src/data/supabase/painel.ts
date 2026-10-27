/**
 * Dashboard e Inteligência no Supabase: RPCs de `supabase/migrations/20261027000700_painel.sql`. As leituras chegam
 * prontas no formato do app (com `today` / `period.to` = hoje da loja); aqui só se trocam os erros do banco por
 * `SourceError`. O banco já esconde o que a permissão esconde: `finance` null sem `financeiro.consolidated`, alertas
 * fora da permissão de destino, custos e insights de custo sem `acervo.cost`, e recusa a Inteligência sem `inteligencia.view`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntelSource, PainelSource } from '../source-painel'
import type { DashboardSummary, IntelReport } from '../types'
import { fromDbError } from './acervo'

export function supabasePainel(client: SupabaseClient): PainelSource & IntelSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }

  return {
    dashboardSummary: (range) => rpc<DashboardSummary>('dashboard_summary', { p_range: range }),
    intelReport: (days, categorySlug) => rpc<IntelReport>('intel_report', { p_days: days, p_category: categorySlug }),
  }
}
