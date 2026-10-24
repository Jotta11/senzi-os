/** Tipos do Dashboard e da Inteligência (spec `dashboard-inteligencia.md`, §4), mais configurações e usuário. */
import type { GarmentState } from './types'
import type { AgendaItem, FittingState } from './types-agenda'
import type { Tone } from '@/ui'

export type AlertSeverity = 'critico' | 'atencao' | 'info'

export type AlertKind =
  | 'devolucao_atrasada'
  | 'devolucao_hoje'
  | 'retirada_amanha'
  | 'pagamento_pendente'
  | 'inspecao_parada'
  | 'inspecao_pendente'
  | 'manutencao_longa'
  | 'aniversario'
  | 'peca_em_risco'
  | 'atraso_com_fila'
  | 'item_nao_entregue'
  | 'prova_sem_resultado'

export type Alert = {
  sev: AlertSeverity
  kind: AlertKind
  /** Nome de ícone do design system. */
  icon: string
  title: string
  detail: string
  /** `/reservas/:id`, `/acervo/:id`, `/clientes/:id`, `/provas/:id` ou `/operacao`. */
  route: string
}

export type DashboardSummary = {
  today: string
  tiles: {
    pickupsToday: { count: number; firstNames: string[] }
    returnsToday: number
    overdue: number
    eventsToday: number
    availableGarments: number
    totalGarments: number
  }
  /** Já ordenado por severidade. */
  alerts: Alert[]
  agendaToday: AgendaItem[]
  /** Datas do mês exibido com compromisso (mini calendário). */
  agendaMonthDays: string[]
  cycle: {
    inspecao: number
    higienizacao: number
    ajuste: number
    manutencao: number
    bloqueado: number
    reservado: number
    foraDaLoja: number
    occupancyRate: number
  }
  /** `null` sem `financeiro.consolidated`. */
  finance: null | {
    range: '7' | '30' | '90'
    revenue: number
    ticket: number
    rentals: number
    series: { label: string; month: string; value: number }[]
  }
  /** Só quando `finance === null`. */
  fittingsSoon?: { id: string; code: string; at: string; customerName: string; itemCount: number; state: FittingState }[]
}

export type IntelPeriod = 90 | 180 | 365
export type IntelGroup = 'negocio' | 'comprar' | 'rendimento' | 'provas' | 'clientes'

export type PressureRow = {
  key: string
  garments: number
  rentals: number
  fittings: number
  occupiedDays: number
  revenue: number
  pressure: number
  occupancy: number
}

export type IntelReport = {
  period: { days: IntelPeriod; from: string; to: string }
  kpis: {
    rentals: number
    revenue: number
    avgTicket: number
    activeCustomers: number
    totalCustomers: number
    recurrenceRate: number
    recurrentCount: number
    idleGarments: number
    fittingConversion: number | null
    closedFittings: number
  }
  insights: { tone: Tone; icon: string; html: string; why: string; group: IntelGroup; ref?: string }[]
  revenueByGarment: { garmentId: string; name: string; hex: string; rentals: number; revenue: number }[]
  colors: { color: string; hex: string; rentals: number; inStock: number; revenue: number }[]
  sizes: { size: string; rentals: number }[]
  occupancyByCategory: { category: string; garments: number; occupiedDays: number; rate: number }[]
  fittingConversionByGarment: { garmentId: string; name: string; hex: string; fittings: number; converted: number; rate: number }[]
  fittedNotRented: {
    garmentId: string
    code: string
    name: string
    fittings: number
    converted: number
    rate: number | null
    alterations: number
    discards: number
    lastNote: string | null
  }[]
  rarelyFitted: { garmentId: string; code: string; name: string; fittings: number; rentals: number }[]
  pressureBySize: PressureRow[]
  pressureByCategory: PressureRow[]
  topCustomers: { customerId: string; name: string; city: string | null; rentals: number; spent: number; ticket: number }[]
  /** `cost` só com `acervo.cost`; `idleDays` null = nunca alugada. */
  idleCapital: { garmentId: string; code: string; name: string; state: GarmentState; cost: number | null; revenue: number; idleDays: number | null }[]
  paidBack: { garmentId: string; code: string; name: string; revenue: number; cost: number; payback: number; rentalsToPayback: number }[]
  ticketByCategory: { category: string; rentals: number; avgTicket: number }[]
}

/** Parâmetros do sistema (tabela `setting`). */
export type Settings = {
  defaultCleaningDays: number
  defaultPrepDays: number
  lateFeeDailyPercent: number
  depositPercent: number
  discountLimitPercent: number
  minSignalPercent: number
  idleAlertDays: number
}

export type AppUser = { id: string; name: string; email: string; role: 'admin' | 'atendimento' }
