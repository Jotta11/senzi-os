import type {
  AgendaDay,
  AppUser,
  Appointment,
  AppointmentInput,
  FitOutcome,
  FittingDetail,
  FittingFilter,
  FittingGarmentStats,
  FittingHistoryRow,
  FittingInput,
  FittingKpis,
  FittingListRow,
  FittingSession,
  PageRequest,
  PageResult,
} from './types'

/**
 * Porta de dados de Agenda e Provas (spec `telas/agenda-provas.md`). Mesmas regras de erro do banco:
 * `DATA_OBRIGATORIA`, `HORARIO_OBRIGATORIO`, `CLIENTE_OBRIGATORIA`, `OBSERVACAO_OBRIGATORIA`, `DATAS_INCOERENTES`,
 * `ESTADO_INVALIDO` (compromisso automático), `PROVA_ENCERRADA` (prova que não está aberta), `NAO_ENCONTRADO`.
 */
export interface AgendaSource {
  /** Um `AgendaDay` por dia, `from`/`to` inclusivos (`aaaa-mm-dd`). Itens não cancelados, por hora; no máx. 4 blocos + `moreBlocks`. */
  agendaRange(from: string, to: string): Promise<AgendaDay[]>
  /** Dias (`aaaa-mm-dd`, crescentes) do mês `aaaa-mm` com ao menos um compromisso não cancelado. */
  agendaMonthDays(month: string): Promise<string[]>
  createAppointment(input: AppointmentInput): Promise<Appointment>
  /** Só compromissos manuais agendados; senão `ESTADO_INVALIDO`. */
  updateAppointment(id: string, input: AppointmentInput): Promise<Appointment>
  /** Só compromissos manuais agendados; senão `ESTADO_INVALIDO`. */
  cancelAppointment(id: string): Promise<Appointment>
  listUsers(): Promise<AppUser[]>

  /** Ordem `scheduledAt` decrescente. */
  listFittings(filter: FittingFilter, page: PageRequest): Promise<PageResult<FittingListRow>>
  fittingKpis(): Promise<FittingKpis>
  getFitting(id: string): Promise<FittingDetail | null>
  /** `newCustomer` passa pela mesma validação de `createCustomer`. Horário vazio = `15:00`. Cria o compromisso `prova`. */
  createFitting(input: FittingInput): Promise<FittingSession>
  addFittingGarment(id: string, garmentId: string): Promise<FittingDetail>
  removeFittingGarment(id: string, garmentId: string): Promise<FittingDetail>
  /** Campos ausentes preservam o valor anterior (inclusive a nota; `null` apaga). */
  setFittingOutcome(id: string, garmentId: string, v: { outcome?: FitOutcome; needsAlteration?: boolean; note?: string | null }): Promise<FittingDetail>
  closeFitting(id: string, state: 'perdida' | 'concluida' | 'no_show', notes: string | null): Promise<FittingDetail>
  /** Ordem `scheduledAt` decrescente. */
  /** Cada linha traz as peças da sessão (qualquer resultado). */
  fittingsOfCustomer(customerId: string): Promise<FittingHistoryRow[]>
  /** Sessões em que a peça entrou (`items` só com ela), `scheduledAt` decrescente. */
  fittingsOfGarment(garmentId: string): Promise<FittingHistoryRow[]>
  fittingStatsOf(garmentId: string): Promise<FittingGarmentStats>
}
