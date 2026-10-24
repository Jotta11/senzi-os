/**
 * Forma do "mundo" que as regras de domínio leem (acervo, clientes, reservas, provas, agenda, operação e
 * financeiro). A fonte em memória (`fixture`/`mock`) monta e guarda um objeto assim; o domínio só conhece o tipo.
 */
import type {
  Appointment,
  AppUser,
  Category,
  ChecklistItem,
  Customer,
  ExceptionAuthorization,
  FinCategory,
  FittingItem,
  FittingSession,
  Garment,
  Inspection,
  Maintenance,
  Payable,
  Receivable,
  Reservation,
  Settings,
} from './types'

export type World = {
  today: string
  settings: Settings
  users: AppUser[]
  categories: Category[]
  brands: string[]
  /** `blocks` = só blocos ativos. */
  garments: Garment[]
  customers: Customer[]
  /** Com itens, pagamentos, contrato, autorizações, histórico e prova de origem. Ordem cronológica de criação. */
  reservations: Reservation[]
  fittings: FittingSession[]
  fittingItems: FittingItem[]
  appointments: Appointment[]
  maintenances: Maintenance[]
  inspections: Inspection[]
  checklist: ChecklistItem[]
  finCategories: FinCategory[]
  payables: Payable[]
  /** Só lançamentos avulsos (as parcelas de reserva derivam das reservas). */
  receivables: Receivable[]
  exceptions: ExceptionAuthorization[]
  pinAttempts: { email: string; at: string; ok: boolean }[]
}
