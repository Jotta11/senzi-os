import type { DashboardSummary } from './types'

/**
 * Porta de dados do Dashboard (spec `telas/dashboard-inteligencia.md`, §3). `finance` e `fittingsSoon` vêm sempre
 * calculados: quem decide mostrar é a tela, por permissão (no banco, a RPC devolve `finance: null` sem `financeiro.consolidated`).
 * `agendaMonthDays` é o do mês corrente.
 */
export interface PainelSource {
  /** `7` → últimos 7 dias; `30` → do dia 1 do mês até hoje ("Este mês"); `90` → últimos 90 dias. Alertas já ordenados. */
  dashboardSummary(range: '7' | '30' | '90'): Promise<DashboardSummary>
}
