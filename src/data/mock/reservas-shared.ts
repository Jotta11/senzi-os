/**
 * Peças comuns das operações de Reservas na fonte em memória: guarda de estado, histórico, saldo,
 * disponibilidade (regras de `domain/calendar`), estado derivado das peças, contrato e parcelas pendentes.
 * Nada aqui valida entrada de tela; cada operação valida tudo antes de chamar o que muda o mundo.
 */
import { checkAvailability, deriveGarmentState, occupiedWindow } from '@/domain/calendar'
import { diffDays } from '@/domain/dates'
import { balance, round2 } from '@/domain/money'
import {
  SourceError,
  type AvailabilityResult,
  type GarmentState,
  type Payment,
  type Reservation,
  type ReservationRow,
  type ReservationState,
} from '../types'
import { projectGarment, type MockCtx } from './context'
import { renderContract } from './contract'

const OUT_STATES: ReservationState[] = ['retirada', 'em_uso', 'aguardando_devolucao']
const NO_PAY_STATUS: ReservationState[] = ['rascunho', 'cancelada', 'no_show']
const NAME_PREFIX = /^(Vestido|Macacão|Conjunto|Saia|Clutch) /

export type ReservaKit = ReturnType<typeof reservaKit>

export function reservaKit(ctx: MockCtx) {
  const { db, today } = ctx

  /** `ESTADO_INVALIDO` se a reserva não está num dos estados. */
  const ensureState = (r: Reservation, states: ReservationState[]) => {
    if (!states.includes(r.state)) throw new SourceError('ESTADO_INVALIDO')
  }

  const log = (r: Reservation, from: ReservationState | null, to: ReservationState, reason: string) =>
    r.history.push({ id: ctx.newId('rh'), fromState: from, toState: to, reason, userId: ctx.userId(), userName: ctx.userName(), occurredAt: ctx.now() })

  const transition = (r: Reservation, to: ReservationState, reason: string) => {
    const from = r.state
    r.state = to
    log(r, from, to, reason)
  }

  const refresh = (r: Reservation) => {
    r.balance = balance(r.totalNet, r.lateFee, r.payments)
    return r
  }

  const index = () => Object.fromEntries(db.reservations.map((r) => [r.id, { code: r.code, state: r.state }]))

  /** Disponibilidade da peça (blocos ativos + outros rascunhos), sem mudar nada. */
  function availability(garmentId: string, pickup: string, returnDue: string, ignore?: string | null): AvailabilityResult {
    const g = db.garments.find((x) => x.id === garmentId)
    if (!g) {
      const w = occupiedWindow(pickup, returnDue, db.settings.defaultPrepDays, db.settings.defaultCleaningDays)
      return { garmentId, ok: false, conflicts: [], reason: 'Peça inexistente.', window: { ...w, cleaningDays: db.settings.defaultCleaningDays } }
    }
    const drafts = db.reservations
      .filter((r) => r.state === 'rascunho' && r.items.some((i) => i.garmentId === garmentId))
      .map((r) => ({ reservationId: r.id, code: r.code, pickupDate: r.pickupDate, returnDueDate: r.returnDueDate }))
    return checkAvailability({
      garment: g,
      blocks: projectGarment(ctx, g).blocks,
      pickup,
      returnDue,
      ignoreReservationId: ignore ?? null,
      drafts,
      settings: db.settings,
      categories: db.categories,
      reservations: index(),
    })
  }

  /** Conflito que impede confirmar: peça baixada/inexistente ou bloco ativo (outro rascunho é só aviso). */
  const blocking = (a: AvailabilityResult) => !!a.reason || a.conflicts.some((c) => !c.draft)

  /** Recalcula o estado da peça pelas reservas e blocos; registra no histórico da peça quando muda. */
  function rederive(garmentId: string, reason: string): GarmentState {
    const g = ctx.garment(garmentId)
    const links = db.reservations
      .filter((r) => r.state !== 'rascunho')
      .flatMap((r) => r.items.filter((i) => i.garmentId === g.id).map((i) => ({ reservationId: r.id, state: r.state, itemState: i.itemState })))
    const next = deriveGarmentState({ current: g.state, blocks: g.blocks, links, today })
    if (next !== g.state) setGarmentState(garmentId, next, reason)
    return next
  }

  function setGarmentState(garmentId: string, to: GarmentState, reason: string) {
    const g = ctx.garment(garmentId)
    g.history.unshift({ at: ctx.now(), from: g.state, to, reason, userName: ctx.userName() })
    g.state = to
  }

  /** Gera (v1) ou regera (versão + 1) o contrato. Assinado não muda: a edição abre uma versão nova, não assinada. */
  function writeContract(r: Reservation) {
    const now = ctx.now()
    const prev = r.contract
    if (prev?.signedAt) log(r, null, r.state, `Contrato v${prev.version} assinado substituído pela v${prev.version + 1}`)
    r.contract = {
      id: prev?.id ?? ctx.newId('ct'),
      reservationId: r.id,
      number: r.code.replace('RS', 'CT'),
      version: prev ? prev.version + 1 : 1,
      bodyRendered: '',
      generatedAt: now,
      templateVersion: 1,
      terms: { lateFeeDailyPercent: db.settings.lateFeeDailyPercent, deposit: r.depositAmount },
      signedAt: null,
      signedBy: null,
      signerName: null,
      signatureKind: null,
      signatureNotes: null,
      pdfPath: null,
    }
    r.contract.bodyRendered = renderContract(db, r, today)
  }

  /**
   * Parcelas pendentes coerentes com o saldo — uma regra só: `due = balance(...).due`;
   * `saldo` pendente = `min(due, total líquido − pago da locação)`; `multa` pendente = `due − saldo`.
   * Zeradas, somem. Só cria parcela nova de multa, quando `multa` é informado (devolução com atraso).
   */
  function syncPending(r: Reservation, multa?: { notes: string; dueAt: string }) {
    const due = balance(r.totalNet, r.lateFee, r.payments).due
    const paid = r.payments.filter((p) => p.state === 'pago')
    const sum = (f: (p: Payment) => boolean) => round2(paid.filter(f).reduce((s, p) => s + p.amount, 0))
    const rentalPaid = round2(sum((p) => p.kind !== 'caucao' && p.kind !== 'estorno' && p.kind !== 'multa') - sum((p) => p.kind === 'estorno' && p.refersTo !== 'caucao'))
    const saldo = Math.min(due, Math.max(0, round2(r.totalNet - rentalPaid)))
    const target = { saldo, multa: round2(due - saldo) }
    r.payments = r.payments.flatMap((p) => {
      if (p.state !== 'pendente' || (p.kind !== 'saldo' && p.kind !== 'multa')) return [p]
      const amount = target[p.kind]
      if (amount <= 0) return []
      return [p.kind === 'multa' && multa ? { ...p, amount, ...multa } : { ...p, amount }]
    })
    if (multa && target.multa > 0 && !r.payments.some((p) => p.kind === 'multa' && p.state === 'pendente')) {
      const now = ctx.now()
      r.payments.push({ id: ctx.newId('pay'), reservationId: r.id, kind: 'multa', method: 'pix', amount: target.multa, state: 'pendente', paidAt: null, reference: null, refersTo: null, createdBy: ctx.userId(), createdAt: now, ...multa })
    }
  }

  const daysLate = (r: Reservation) => (OUT_STATES.includes(r.state) && r.returnDueDate < today ? diffDays(r.returnDueDate, today) : 0)

  function row(r: Reservation): ReservationRow {
    const b = balance(r.totalNet, r.lateFee, r.payments)
    const noPay = NO_PAY_STATUS.includes(r.state)
    return {
      id: r.id,
      code: r.code,
      state: r.state,
      customerName: db.customers.find((c) => c.id === r.customerId)?.fullName ?? '—',
      garments: r.items.map((i) => {
        const g = db.garments.find((x) => x.id === i.garmentId)
        return { code: g?.code ?? '—', shortName: (g?.name ?? '—').replace(NAME_PREFIX, '') }
      }),
      eventDate: r.eventDate,
      eventType: r.eventType,
      pickupDate: r.pickupDate,
      returnDueDate: r.returnDueDate,
      daysLate: daysLate(r),
      payStatus: noPay ? null : b.status,
      totalNet: r.totalNet,
      due: noPay ? 0 : b.due,
    }
  }

  return { ensureState, log, transition, refresh, availability, blocking, rederive, setGarmentState, writeContract, syncPending, daysLate, row }
}
