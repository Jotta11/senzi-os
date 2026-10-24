import type { Garment, ChecklistItem, CloseMaintenanceInput, Inspection, InspectionInput, InspectionResult, Maintenance, OperacaoQueue } from './types'

/**
 * Porta de dados da Operação (spec `telas/operacao-financeiro.md`, parte 1). Erros como no banco:
 * `PECA_NAO_ENCONTRADA`, `ORDEM_NAO_ENCONTRADA`, `ORDEM_JA_CONCLUIDA`, `CUSTO_INVALIDO`, `ESTADO_INVALIDO`.
 */
export interface OperacaoSource {
  /** Filas por estado da peça, ordens em aberto e custo dos últimos 30 dias (a tela só mostra com `acervo.cost`). */
  operacaoQueue(): Promise<OperacaoQueue>
  /** Itens ativos do checklist, em ordem. */
  checklist(): Promise<ChecklistItem[]>
  /** Reserva da devolução da peça (`em_inspecao`, `devolvida` ou `aguardando_devolucao`, a mais recente); `null` se não há. */
  inspectionTarget(garmentId: string): Promise<{ reservationId: string; customerName: string } | null>
  /** Cria a inspeção e o destino da peça; o último item inspecionado finaliza a reserva. */
  registerInspection(input: InspectionInput): Promise<{ result: InspectionResult; garment: Garment }>
  /** Conclui a ordem; custo > 0 vira conta a pagar paga (`source: 'operacao'`); `release` libera a peça. */
  closeMaintenance(input: CloseMaintenanceInput): Promise<Garment>
  /** Encerra as ordens abertas, libera os bloqueios e recalcula o estado. Peça fora do ciclo: `ESTADO_INVALIDO`. */
  releaseGarment(garmentId: string, note: string): Promise<Garment>
  /** Ordens (mais recente primeiro) e inspeções (mais recente primeiro) da peça. */
  maintenancesOf(garmentId: string): Promise<{ maintenances: Maintenance[]; inspections: Inspection[] }>
  /** Fornecedores sugeridos: os de sempre + os já usados em ordens. */
  suppliers(): Promise<string[]>
}
