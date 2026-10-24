/**
 * Rascunho de reserva na fonte em memória (spec reservas §3.1, §3.3, §3.7): validação completa (todos os
 * problemas em `issues`), desconto acima do limite só com exceção, conflitos só avisam (rascunho não bloqueia
 * peça nem cria bloco), contrato gerado/regerado enquanto não assinado e conversão da prova de origem.
 */
import { discountNeedsException, round2 } from '@/domain/money'
import { addDays, brl } from '@/lib/format'
import type { ReservasSource } from '../source-reservas'
import { SourceError, type ExceptionAuthorization, type Reservation, type ReservationInput, type SourceIssue } from '../types'
import type { MockCtx } from './context'
import { consumeException, usableException } from './exceptions'
import { priceItems, type PriceLine } from './pricing'
import type { ReservaKit } from './reservas-shared'

type Draft = Pick<ReservasSource, 'createDraft' | 'updateDraft' | 'addDraftItem' | 'removeDraftItem' | 'markContractSigned'>

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const OPEN_FITTING = ['agendada', 'em_curso']

export function reservasDraft(ctx: MockCtx, kit: ReservaKit): Draft {
  const { db, today, run, fail } = ctx

  const draftOf = (id: string) => {
    const r = ctx.reservation(id)
    kit.ensureState(r, ['rascunho'])
    return r
  }

  /** Problemas do formulário (ordem e campos da spec §3.1) e as linhas de preço. */
  function validate(input: ReservationInput): { lines: PriceLine[]; gross: number } {
    const issues: SourceIssue[] = []
    const items = input.items ?? []
    if (!input.customerId) issues.push({ code: 'RESERVA_SEM_CLIENTE', field: 'customerId' })
    if (!items.length) issues.push({ code: 'RESERVA_SEM_PECAS', field: 'items' })
    else if (new Set(items.map((i) => i.garmentId)).size !== items.length || items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice < 0 || (i.itemDiscount ?? 0) < 0))
      issues.push({ code: 'PARAMETRO_INVALIDO', field: 'items' })
    const { eventDate: ev, pickupDate: pk, returnDueDate: rt } = input
    if (!isDate(ev)) issues.push({ code: 'DATA_EVENTO_OBRIGATORIA', field: 'eventDate' })
    if (!isDate(pk)) issues.push({ code: 'DATA_OBRIGATORIA', field: 'pickupDate' })
    if (!isDate(rt)) issues.push({ code: 'DATA_OBRIGATORIA', field: 'returnDueDate' })
    if (isDate(pk) && isDate(rt) && rt < pk) issues.push({ code: 'DEVOLUCAO_ANTES_RETIRADA', field: 'returnDueDate' })
    if (isDate(ev) && isDate(pk) && ev < pk) issues.push({ code: 'EVENTO_ANTES_RETIRADA', field: 'eventDate' })
    if (isDate(ev) && isDate(rt) && ev > rt) issues.push({ code: 'EVENTO_DEPOIS_DEVOLUCAO', field: 'eventDate' })
    if (isDate(pk) && pk < addDays(today, -1)) issues.push({ code: 'RETIRADA_NO_PASSADO', field: 'pickupDate' })
    const gross = round2(items.reduce((s, i) => s + (Number.isFinite(i.unitPrice) ? i.unitPrice : 0), 0))
    const itemDiscounts = items.reduce((s, i) => s + (i.itemDiscount ?? 0), 0)
    const discount = input.discount
    if (!Number.isFinite(discount) || discount < 0) issues.push({ code: 'DESCONTO_NEGATIVO', field: 'discount' })
    else if (items.length && discount + itemDiscounts > gross + 0.001) issues.push({ code: 'DESCONTO_MAIOR_QUE_BRUTO', field: 'discount' })
    if (issues.length) {
      const big = issues.find((i) => i.code === 'DESCONTO_MAIOR_QUE_BRUTO')
      fail(issues, big ? `O desconto (${brl(discount)}) é maior que o valor das peças (${brl(gross)}).` : undefined)
    }
    ctx.customer(input.customerId)
    for (const i of items) ctx.garment(i.garmentId)
    return { lines: items.map((i) => ({ garmentId: i.garmentId, unitPrice: i.unitPrice, itemDiscount: i.itemDiscount ?? 0, alterationNotes: i.alterationNotes?.trim() || null })), gross }
  }

  /** Prova a converter (aberta, da mesma cliente) ou `null`. */
  function fittingToConvert(input: ReservationInput, current: Reservation | null) {
    if (!input.fittingId || current?.fittingId === input.fittingId) return null
    const f = db.fittings.find((x) => x.id === input.fittingId)
    if (!f) throw new SourceError('NAO_ENCONTRADO')
    if (!OPEN_FITTING.includes(f.state) || current?.fittingId) throw new SourceError('PROVA_ENCERRADA')
    if (f.customerId !== input.customerId) fail([{ code: 'PARAMETRO_INVALIDO', field: 'customerId' }])
    return f
  }

  /** Desconto acima do limite: autorização já gravada que cubra o valor, ou exceção nova utilizável; senão erro. */
  function discountException(r: Reservation | null, gross: number, discount: number, exceptionId?: string): ExceptionAuthorization | null {
    if (!discountNeedsException(gross, discount, db.settings.discountLimitPercent)) return null
    const covered = r?.authorizations.some((a) => a.kind === 'desconto_acima_limite' && a.amount >= discount - 0.005)
    if (covered) return null
    const exc = usableException(ctx, exceptionId, 'desconto_acima_limite', { reservationId: r?.id ?? null, draft: true })
    if (!exc) fail([{ code: 'DESCONTO_ACIMA_LIMITE', field: 'discount' }])
    return exc
  }

  /** Reprecifica mantendo o id do item de cada peça que já estava na reserva. */
  function reprice(r: Reservation, lines: PriceLine[], orderDiscount: number) {
    const keep = new Map(r.items.map((i) => [i.garmentId, i.id]))
    const priced = priceItems(r.id, lines.map((l) => ({ ...l, id: keep.get(l.garmentId) })), orderDiscount, () => ctx.newId(`${r.id}-i`))
    r.items = priced.items
    r.totalGross = priced.totalGross
    r.discount = priced.discount
    r.totalNet = priced.totalNet
  }

  function applyInput(r: Reservation, input: ReservationInput) {
    r.customerId = input.customerId
    r.eventDate = input.eventDate
    r.eventType = input.eventType?.trim() || null
    r.eventVenue = input.eventVenue?.trim() || null
    r.pickupDate = input.pickupDate
    r.returnDueDate = input.returnDueDate
    r.channel = input.channel ?? r.channel
    r.notes = input.notes?.trim() || null
  }

  function convert(r: Reservation, f: NonNullable<ReturnType<typeof fittingToConvert>>) {
    f.reservationId = r.id
    f.state = 'convertida'
    f.endedAt = ctx.now()
    r.fittingId = f.id
    for (const a of db.appointments) if (a.fittingId === f.id && a.kind === 'prova' && a.state === 'agendado') a.state = 'concluido'
  }

  const nextCode = () => {
    const prefix = `RS-${today.slice(0, 4)}-`
    const seq = db.reservations.reduce((m, r) => (r.code.startsWith(prefix) ? Math.max(m, Number(r.code.slice(prefix.length)) || 0) : m), 0) + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  const orderDiscountOf = (r: Reservation) => round2(r.discount - r.items.reduce((s, i) => s + i.itemDiscount, 0))

  return {
    createDraft: (input, exceptionId) =>
      run(() => {
        const { lines, gross } = validate(input)
        const fit = fittingToConvert(input, null)
        const exc = discountException(null, gross, round2(input.discount + lines.reduce((s, l) => s + (l.itemDiscount ?? 0), 0)), exceptionId)

        const id = ctx.newId('res')
        const r: Reservation = {
          id,
          code: nextCode(),
          customerId: input.customerId,
          state: 'rascunho',
          eventDate: null,
          eventType: null,
          eventVenue: null,
          pickupDate: input.pickupDate,
          returnDueDate: input.returnDueDate,
          pickedUpAt: null,
          returnedAt: null,
          channel: input.channel ?? 'loja',
          totalGross: 0,
          discount: 0,
          totalNet: 0,
          depositAmount: 0,
          lateFee: 0,
          notes: null,
          cancelReason: null,
          createdBy: ctx.userId(),
          createdAt: ctx.now(),
          items: [],
          payments: [],
          contract: null,
          authorizations: [],
          history: [],
          fittingId: null,
          balance: { devido: 0, pago: 0, caucao: 0, due: 0, status: 'nao_pago' },
        }
        applyInput(r, input)
        reprice(r, lines, input.discount)
        kit.log(r, null, 'rascunho', 'Reserva criada')
        kit.writeContract(r)
        if (fit) convert(r, fit)
        if (exc) consumeException(ctx, exc, r, r.discount)
        db.reservations.push(r)
        return kit.refresh(r)
      }),

    updateDraft: (id, input, exceptionId) =>
      run(() => {
        const r = draftOf(id)
        const { lines, gross } = validate(input)
        const fit = fittingToConvert(input, r)
        const exc = discountException(r, gross, round2(input.discount + lines.reduce((s, l) => s + (l.itemDiscount ?? 0), 0)), exceptionId)
        applyInput(r, input)
        reprice(r, lines, input.discount)
        kit.writeContract(r)
        if (fit) convert(r, fit)
        if (exc) consumeException(ctx, exc, r, r.discount)
        return kit.refresh(r)
      }),

    addDraftItem: (id, garmentId) =>
      run(() => {
        const r = draftOf(id)
        const g = ctx.garment(garmentId)
        if (r.items.some((i) => i.garmentId === garmentId)) return kit.refresh(r)
        const lines: PriceLine[] = [...r.items.map((i) => ({ garmentId: i.garmentId, unitPrice: i.unitPrice, itemDiscount: i.itemDiscount, alterationNotes: i.alterationNotes })), { garmentId, unitPrice: g.rentalPrice }]
        reprice(r, lines, orderDiscountOf(r))
        kit.writeContract(r)
        return kit.refresh(r)
      }),

    removeDraftItem: (id, itemId) =>
      run(() => {
        const r = draftOf(id)
        if (!r.items.some((i) => i.id === itemId)) throw new SourceError('NAO_ENCONTRADO')
        if (r.items.length === 1) fail([{ code: 'RESERVA_SEM_PECAS', field: 'items' }])
        const rest = r.items.filter((i) => i.id !== itemId)
        const gross = round2(rest.reduce((s, i) => s + i.unitPrice, 0))
        const order = orderDiscountOf(r)
        const discount = round2(order + rest.reduce((s, i) => s + i.itemDiscount, 0))
        if (discount > gross + 0.001) fail([{ code: 'DESCONTO_MAIOR_QUE_BRUTO', field: 'discount' }])
        discountException(r, gross, discount)
        reprice(r, rest.map((i) => ({ garmentId: i.garmentId, unitPrice: i.unitPrice, itemDiscount: i.itemDiscount, alterationNotes: i.alterationNotes })), order)
        kit.writeContract(r)
        return kit.refresh(r)
      }),

    markContractSigned: (id, input) =>
      run(() => {
        const r = ctx.reservation(id)
        if (r.state === 'cancelada' || r.state === 'no_show' || r.contract?.signedAt) throw new SourceError('ESTADO_INVALIDO')
        const issues: SourceIssue[] = []
        if (!isDate(input.signedAt)) issues.push({ code: 'DATA_OBRIGATORIA', field: 'signedAt' })
        else if (input.signedAt > today) issues.push({ code: 'DATA_FUTURA', field: 'signedAt' })
        if (!input.signerName?.trim()) issues.push({ code: 'NOME_CLIENTE_OBRIGATORIO', field: 'signerName' })
        if (issues.length) fail(issues)
        if (!r.contract) kit.writeContract(r)
        Object.assign(r.contract!, {
          signedAt: `${input.signedAt}${ctx.now().slice(10)}`,
          signedBy: ctx.userId(),
          signerName: input.signerName.trim(),
          signatureKind: 'presencial',
          signatureNotes: input.notes?.trim() || null,
        })
        return kit.refresh(r)
      }),
  }
}
