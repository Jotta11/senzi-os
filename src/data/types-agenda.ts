/**
 * Tipos de Agenda e Provas (spec `docs/superpowers/specs/telas/agenda-provas.md`, §5).
 * Datas puras `aaaa-mm-dd`; instantes ISO 8601 locais.
 */
import type { BlockKind, Customer, CustomerInput, Garment } from './types'

export type AppointmentKind = 'prova' | 'retirada' | 'devolucao' | 'atendimento' | 'evento' | 'servico' | 'interno'
export type AppointmentState = 'agendado' | 'concluido' | 'cancelado' | 'no_show'

export type Appointment = {
  id: string
  kind: AppointmentKind
  /** Instante ISO local; a agenda agrupa pelos 10 primeiros caracteres (data). */
  startsAt: string
  /** "Prova", "Retirada", "Devolução", nome do evento ou texto livre. */
  title: string | null
  notes: string | null
  state: AppointmentState
  /** Obrigatório se `kind != 'interno'` (manual); opcional se interno. */
  customerId: string | null
  reservationId: string | null
  fittingId: string | null
  garmentId: string | null
  /** Id do usuário responsável. */
  assignedTo: string | null
  /** Compromisso da empresa (`kind === 'interno'`). */
  internal: boolean
  createdBy: string | null
}

/** Item da agenda já resolvido para a tela. */
export type AgendaItem = {
  id: string
  /** `HH:MM`. */
  time: string
  kind: AppointmentKind
  customer: Pick<Customer, 'id' | 'fullName'> | null
  reservation: { id: string; code: string } | null
  fitting: { id: string; code: string } | null
  garments: Pick<Garment, 'id' | 'code' | 'name'>[]
  title: string
  notes: string | null
  state: AppointmentState
  internal: boolean
  /** Só em `Retirada`/`Devolução`: itens ainda por retirar / fora da loja (botões contextuais do Dashboard). */
  pendingPickupItems?: number
  itemsOut?: number
}

/** Bloco do acervo exibido no rodapé do dia (não é compromisso). */
export type AgendaGarmentBlock = {
  garmentId: string
  garmentCode: string
  kind: Extract<BlockKind, 'higienizacao' | 'manutencao' | 'ajuste' | 'bloqueio_manual' | 'editorial'>
}

export type AgendaDay = { date: string; items: AgendaItem[]; garmentBlocks: AgendaGarmentBlock[]; moreBlocks: number }

export type AppointmentInput = {
  date: string
  time: string
  kind: 'atendimento' | 'servico' | 'interno'
  customerId: string | null
  notes: string | null
}

export type FittingState = 'agendada' | 'em_curso' | 'concluida' | 'convertida' | 'perdida' | 'no_show'
export type FitOutcome = 'favorita' | 'serviu' | 'gostou' | 'precisa_ajuste' | 'apertada' | 'larga' | 'nao_gostou' | 'descartada' | 'nao_provou'

export type FittingSession = {
  id: string
  /** `PR-2026-0001`. */
  code: string
  customerId: string
  state: FittingState
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  attendantId: string | null
  eventType: string | null
  eventDate: string | null
  budget: number | null
  notes: string | null
  outcomeNotes: string | null
  /** Preenchido na conversão. */
  reservationId: string | null
  createdBy: string | null
}

/** Uma peça por sessão (`garmentId` único dentro da sessão). */
export type FittingItem = {
  fittingSessionId: string
  garmentId: string
  position: number
  outcome: FitOutcome
  needsAlteration: boolean
  note: string | null
  recordedBy: string | null
  recordedAt: string | null
}

export type FittingListRow = FittingSession & {
  customerName: string
  itemCount: number
  approvedCount: number
  discardedCount: number
}

/** Linha do histórico de provas (da cliente ou da peça), já com as peças e o resultado de cada uma. */
export type FittingHistoryRow = FittingListRow & {
  items: { garmentId: string; garmentCode: string; garmentName: string; outcome: FitOutcome; note: string | null; needsAlteration: boolean }[]
}

export type FittingKpis = {
  open: number
  converted: number
  /** Só `perdida`. */
  lost: number
  closed: number
  /** 0..1 */
  rate: number
  total: number
}
export type FittingFilter = 'abertas' | 'convertidas' | 'perdidas' | 'todas'
export type AgendaFilter = 'todos' | AppointmentKind

export type FittingGarmentStats = {
  fittings: number
  converted: number
  rate: number | null
  favorites: number
  discards: number
  alterations: number
  reasons: { outcome: FitOutcome; note: string }[]
}

export type FittingDetail = {
  session: FittingSession
  customer: Customer
  attendantName: string | null
  items: (FittingItem & { garment: Garment; favorite: boolean })[]
  reservation: { id: string; code: string; customerName: string; eventDate: string | null } | null
}

export type FittingInput = {
  customerId?: string
  newCustomer?: CustomerInput
  date: string
  time?: string
  attendantName?: string | null
  eventType?: string | null
  eventDate?: string | null
  budget?: number | null
  notes?: string | null
}
