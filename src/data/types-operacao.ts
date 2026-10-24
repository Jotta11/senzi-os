/** Tipos da Operação (spec `operacao-financeiro.md`, §1.5): inspeção, higienização, manutenção. */
import type { Garment } from './types'

export type MaintenanceKind = 'higienizacao' | 'costura' | 'barra' | 'ziper' | 'pedraria' | 'ajuste' | 'mancha' | 'restauracao' | 'outros'
export type MaintenanceState = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'

export type Maintenance = {
  id: string
  garmentId: string
  inspectionId: string | null
  reservationId: string | null
  kind: MaintenanceKind
  state: MaintenanceState
  openedAt: string
  /** `aaaa-mm-dd`. */
  dueAt: string | null
  closedAt: string | null
  description: string | null
  provider: string | null
  /** 0 até concluir. */
  cost: number
  /** `true`: higienização e dano grave; `false`: reparo leve. */
  blocksGarment: boolean
  createdBy: string
}

export type InspectionResult = 'aprovada' | 'ressalva' | 'reprovada' | 'perda'
export type Severity = 'leve' | 'media' | 'grave'
export type InspectionFinding = { label: string; ok: false; severity: Severity; note: string | null }

export type Inspection = {
  id: string
  garmentId: string
  reservationId: string | null
  inspectedAt: string
  inspectorId: string
  inspectorName: string
  result: InspectionResult
  findings: InspectionFinding[]
  notes: string | null
  photos: { id: string; kind: 'devolucao' | 'dano' | 'detalhe'; url: string }[]
}

export type ChecklistItem = { id: string; label: string; sortOrder: number; isActive: boolean }

export type InspectionInput = {
  garmentId: string
  reservationId: string | null
  findings: InspectionFinding[]
  /** Na prévia as fotos são simuladas: só o tipo. */
  photos: { kind: 'devolucao' | 'dano' | 'detalhe' }[]
  perda: boolean
  maintenanceKind: MaintenanceKind
  provider: string | null
  openRepair: boolean
  notes: string | null
}

export type CloseMaintenanceInput = { maintenanceId: string; cost: number; provider: string | null; note: string | null; release: boolean }

export type QueueRow = {
  garment: Garment
  order: Maintenance | null
  blockNote: string | null
  nextRentalStart: string | null
  daysOpen: number | null
  /** Dias desde a entrada na inspeção (fila "Aguardando inspeção"); `null` nas demais. */
  waitingDays: number | null
}

export type OperacaoQueue = {
  inspecao: QueueRow[]
  higienizacao: QueueRow[]
  ajuste: QueueRow[]
  manutencao: QueueRow[]
  bloqueado: QueueRow[]
  openOrders: (Maintenance & { garmentCode: string; garmentName: string })[]
  /** `null` sem `acervo.cost`. */
  costLast30d: number | null
}
