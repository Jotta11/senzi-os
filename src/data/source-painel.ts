import type { DashboardSummary, IntelPeriod, IntelReport } from './types'

/**
 * Porta de dados do Dashboard (spec `telas/dashboard-inteligencia.md`, §3). `finance` e `fittingsSoon` vêm sempre
 * calculados: quem decide mostrar é a tela, por permissão (no banco, a RPC devolve `finance: null` sem `financeiro.consolidated`).
 * `agendaMonthDays` é o do mês corrente.
 */
export interface PainelSource {
  /** `7` → últimos 7 dias; `30` → do dia 1 do mês até hoje ("Este mês"); `90` → últimos 90 dias. Alertas já ordenados. */
  dashboardSummary(range: '7' | '30' | '90'): Promise<DashboardSummary>
}

/**
 * Porta de dados da Inteligência (spec `telas/dashboard-inteligencia.md` §3.3). O relatório vem pronto; custos e
 * insights de custo (`requires: 'acervo.cost'`) vêm sempre e a tela decide mostrar por permissão.
 */
export interface IntelSource {
  /** `days` = 90 | 180 | 365 (janela `[hoje − dias + 1, hoje]`); `categorySlug` `null` = todas. */
  intelReport(days: IntelPeriod, categorySlug: string | null): Promise<IntelReport>
}
