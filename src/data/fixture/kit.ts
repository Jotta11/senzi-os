/**
 * Ferramentas do mundo fictício: sorteio determinístico, instantes locais e montagem de reservas
 * já coerentes (rateio de desconto, saldo, contrato, histórico de estados). Só o fixture usa.
 */
import { balance, round2 } from '@/domain/money'
import { priceItems } from '../mock/pricing'
import type {
  Channel,
  Contract,
  ExceptionAuthorization,
  Garment,
  ItemState,
  Payment,
  PaymentKind,
  PaymentMethod,
  PaymentState,
  Reservation,
  ReservationHistoryEntry,
  ReservationItem,
  ReservationState,
} from '../types'
import type { World } from './world'

/** Sorteio determinístico (mulberry32). Nunca `Math.random`: o mesmo `today` gera o mesmo mundo. */
export type Rng = { next(): number; int(a: number, b: number): number; pick<T>(xs: readonly T[]): T }
export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)]! }
}

/** Instante no fuso da loja (`2026-10-24T10:30:00-03:00`): os 10 primeiros caracteres são a data. */
export const at = (date: string, hhmm: string): string => `${date}T${hhmm}:00-03:00`

export const USER = {
  julia: { id: 'u-julia', name: 'Júlia Senzi' },
  ana: { id: 'u-ana', name: 'Ana Lima' },
  bruna: { id: 'u-bruna', name: 'Bruna Costa' },
} as const
export const userName = (id: string): string => Object.values(USER).find((u) => u.id === id)?.name ?? 'Júlia Senzi'

export const EVENTOS = ['Casamento', 'Formatura', 'Aniversário de 15 anos', 'Festa corporativa', 'Casamento civil', 'Baile de gala', 'Premiação', 'Jantar de noivado', 'Formatura de Medicina']
export const LOCAIS = ['Espaço Jardins · Palmas', 'Clube Ipê · Palmas', 'Hotel Serrano · Araguaína', 'Casa de Festas Bela Vista', 'Salão Vila Real · Gurupi', 'Resort Lago Norte · Palmas']

export type PaySpec = { kind: PaymentKind; method: PaymentMethod; amount: number; paidAt: string | null; state?: PaymentState; dueAt?: string | null; notes?: string | null; by?: string }
export type ItemSpec = { garment: Garment; state: ItemState; pickedUpAt?: string | null; returnedAt?: string | null; pickupNote?: string | null; returnNote?: string | null; alteration?: string | null }
export type Step = { to: ReservationState; at: string; reason: string | null; by?: string }

export type ReservationSpec = {
  customerId: string
  state: ReservationState
  pickup: string
  event: string | null
  ret: string
  eventType: string | null
  venue: string | null
  channel: Channel
  discount: number
  createdAt: string
  createdBy: string
  items: ItemSpec[]
  payments: PaySpec[]
  /** Transições depois de "Reserva criada" (rascunho). */
  steps: Step[]
  /** `null` = sem contrato; `''` = gerado e não assinado; instante = assinado. */
  contractSignedAt: string | null
  signerName: string
  notes?: string | null
  cancelReason?: string | null
  pickedUpAt?: string | null
  returnedAt?: string | null
  lateFee?: number
  authorizations?: Omit<ExceptionAuthorization, 'id' | 'reservationId'>[]
}

/** Monta a reserva (código provisório; `world.ts` numera em ordem cronológica no fim). */
export function makeReservation(w: World, spec: ReservationSpec): Reservation {
  const id = `res-${String(w.reservations.length + 1).padStart(4, '0')}`
  const priced = priceItems(
    id,
    spec.items.map((it) => ({ garmentId: it.garment.id, unitPrice: it.garment.rentalPrice, alterationNotes: it.alteration ?? null })),
    spec.discount,
  )
  const gross = priced.totalGross
  const items: ReservationItem[] = priced.items.map((item, k) => {
    const it = spec.items[k]!
    return {
      ...item,
      itemState: it.state,
      pickedUpAt: it.pickedUpAt ?? null,
      returnedAt: it.returnedAt ?? null,
      pickupNote: it.pickupNote ?? null,
      returnNote: it.returnNote ?? null,
    }
  })
  const payments: Payment[] = spec.payments.map((p, k) => ({
    id: `${id}-p${k + 1}`,
    reservationId: id,
    kind: p.kind,
    method: p.method,
    amount: p.amount,
    state: p.state ?? 'pago',
    paidAt: p.state && p.state !== 'pago' ? null : p.paidAt,
    dueAt: p.dueAt ?? null,
    reference: null,
    notes: p.notes ?? null,
    refersTo: null,
    createdBy: p.by ?? spec.createdBy,
    createdAt: p.paidAt ?? spec.createdAt,
  }))
  const history: ReservationHistoryEntry[] = [{ id: `${id}-h1`, fromState: null, toState: 'rascunho', reason: 'Reserva criada', userId: spec.createdBy, userName: userName(spec.createdBy), occurredAt: spec.createdAt }]
  for (const s of spec.steps) {
    const by = s.by ?? spec.createdBy
    history.push({ id: `${id}-h${history.length + 1}`, fromState: history.at(-1)!.toState, toState: s.to, reason: s.reason, userId: by, userName: userName(by), occurredAt: s.at })
  }
  const totalNet = round2(gross - spec.discount)
  const lateFee = spec.lateFee ?? 0
  const contract: Contract | null =
    spec.contractSignedAt === null
      ? null
      : {
          id: `${id}-ct`,
          reservationId: id,
          number: '',
          version: 1,
          bodyRendered: '',
          generatedAt: spec.createdAt,
          templateVersion: 1,
          terms: { lateFeeDailyPercent: w.settings.lateFeeDailyPercent, deposit: 0 },
          signedAt: spec.contractSignedAt || null,
          signedBy: spec.contractSignedAt ? spec.createdBy : null,
          signerName: spec.contractSignedAt ? spec.signerName : null,
          signatureKind: spec.contractSignedAt ? 'presencial' : null,
          pdfPath: null,
        }
  const r: Reservation = {
    id,
    code: '',
    customerId: spec.customerId,
    state: spec.state,
    eventDate: spec.event,
    eventType: spec.eventType,
    eventVenue: spec.venue,
    pickupDate: spec.pickup,
    returnDueDate: spec.ret,
    pickedUpAt: spec.pickedUpAt ?? null,
    returnedAt: spec.returnedAt ?? null,
    channel: spec.channel,
    totalGross: gross,
    discount: spec.discount,
    totalNet,
    depositAmount: 0,
    lateFee,
    notes: spec.notes ?? null,
    cancelReason: spec.cancelReason ?? null,
    createdBy: spec.createdBy,
    createdAt: spec.createdAt,
    items,
    payments,
    contract,
    authorizations: (spec.authorizations ?? []).map((a, k) => ({ ...a, id: `${id}-ex${k + 1}`, reservationId: id })),
    history,
    fittingId: null,
    balance: balance(totalNet, lateFee, payments),
  }
  w.reservations.push(r)
  return r
}

/** Autorização de exceção pela administradora (PIN). */
export const byAdmin = (kind: ExceptionAuthorization['kind'], amount: number, reason: string, when: string): Omit<ExceptionAuthorization, 'id' | 'reservationId'> => ({
  kind,
  amount,
  reason,
  authorizedBy: USER.julia.id,
  authorizedByName: USER.julia.name,
  authorizedByRole: 'Administrador',
  authorizedAt: when,
})
