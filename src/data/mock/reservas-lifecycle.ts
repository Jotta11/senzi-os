/**
 * Ciclo da reserva na fonte em memória (spec reservas §3.2, §3.5, §3.6, §4.6–§4.8): confirmação atômica,
 * pronta para retirada, retirada e devolução por item, cancelamento e no-show. Cada operação valida tudo
 * primeiro e só então muda o mundo — a confirmação com conflito devolve `{ ok: false }` sem tocar em nada.
 */
import { OUT_RESERVATION_STATES } from '@/data/labels'
import { effectiveCleaningDays, makeBlocks, realignOnReturn } from '@/domain/calendar'
import { diffDays } from '@/domain/dates'
import { lateFee, lateFeePercent, minSignal, round2 } from '@/domain/money'
import { brl } from '@/lib/format'
import type { ReservasSource } from '../source-reservas'
import { SourceError, type Payment, type Reservation } from '../types'
import { addReservationAppointments } from './appointments'
import type { MockCtx } from './context'
import { consumeException, usableException } from './exceptions'
import type { ReservaKit } from './reservas-shared'

type Lifecycle = Pick<ReservasSource, 'confirmReservation' | 'markReady' | 'pickupItems' | 'returnItems' | 'cancelReservation' | 'markNoShow'>

export function reservasLifecycle(ctx: MockCtx, kit: ReservaKit): Lifecycle {
  const { db, today, run, fail } = ctx

  const payment = (r: Reservation, p: Pick<Payment, 'kind' | 'method' | 'amount' | 'state'> & Partial<Payment>): Payment => {
    const now = ctx.now()
    return { id: ctx.newId('pay'), reservationId: r.id, paidAt: p.state === 'pago' ? now : null, dueAt: null, reference: null, notes: null, refersTo: null, createdBy: ctx.userId(), createdAt: now, ...p }
  }

  const apptsOf = (r: Reservation, kind?: string) => db.appointments.filter((a) => a.reservationId === r.id && a.state === 'agendado' && (!kind || a.kind === kind))

  /** Cancelamento e no-show: libera os blocos da reserva, recalcula as peças e encerra os compromissos agendados. */
  function release(r: Reservation, to: 'cancelada' | 'no_show', reason: string) {
    r.cancelReason = reason
    kit.transition(r, to, reason)
    for (const a of apptsOf(r)) a.state = to === 'no_show' && a.kind === 'retirada' ? 'no_show' : 'cancelado'
    // Parcelas a receber deixam de valer; o que já foi pago fica (estorno é manual, §4.8).
    for (const p of r.payments) if (p.state === 'pendente') p.state = 'cancelado'
    const label = to === 'no_show' ? 'no-show' : 'cancelada'
    for (const gid of new Set(r.items.map((i) => i.garmentId))) {
      const g = ctx.garment(gid)
      g.blocks = g.blocks.filter((b) => b.reservationId !== r.id)
      kit.rederive(gid, `Reserva ${r.code} ${label}`)
    }
  }

  const live = (r: Reservation) => r.items.filter((i) => i.itemState !== 'cancelado')

  return {
    confirmReservation: (id, signal, exceptionId) =>
      run(() => {
        const r = ctx.reservation(id)
        kit.ensureState(r, ['rascunho'])
        if (!r.contract?.signedAt) throw new SourceError('CONTRATO_NAO_ASSINADO')
        const amount = signal.amount
        if (!Number.isFinite(amount) || amount <= 0) fail([{ code: 'VALOR_INVALIDO', field: 'amount' }])
        if (amount > r.totalNet + 0.005) fail([{ code: 'VALOR_EXCEDE_SALDO', field: 'amount' }], brl(r.totalNet))
        const min = minSignal(r.totalNet, db.settings.minSignalPercent)
        const waiver = amount < min - 0.005 ? usableException(ctx, exceptionId, 'dispensa_sinal_minimo', { reservationId: r.id, amount: round2(min - amount) }) : null
        if (amount < min - 0.005 && !waiver) fail([{ code: 'SINAL_INSUFICIENTE', field: 'amount' }], brl(min))

        const checks = r.items.map((i) => kit.availability(i.garmentId, r.pickupDate, r.returnDueDate, r.id))
        const conflicts = checks.filter(kit.blocking)
        if (conflicts.length) return { ok: false as const, conflicts }

        // Daqui para baixo nada falha: tudo foi verificado acima.
        for (const it of r.items) {
          const g = ctx.garment(it.garmentId)
          const nb = makeBlocks({ garment: g, pickup: r.pickupDate, returnDue: r.returnDueDate, reservationId: r.id, settings: db.settings, categories: db.categories })
          g.blocks = [...g.blocks, ...nb.map((b) => ({ ...b, id: ctx.newId('blk') }))].sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))
        }
        kit.transition(r, 'confirmada', 'Confirmação da reserva')
        for (const gid of new Set(r.items.map((i) => i.garmentId))) {
          const reason = `Reserva ${r.code} confirmada`
          const before = ctx.garment(gid).history.length
          // Peça já reservada por outra locação também ganha a linha "Reserva … confirmada" no histórico.
          if (kit.rederive(gid, reason) === 'reservado' && ctx.garment(gid).history.length === before) kit.setGarmentState(gid, 'reservado', reason)
        }
        const full = amount >= r.totalNet - 0.005
        const extra = { reference: signal.reference?.trim() || null, notes: signal.notes?.trim() || null }
        r.payments.push(payment(r, { kind: full ? 'integral' : 'sinal', method: signal.method, amount: round2(amount), state: 'pago', ...extra }))
        const rest = round2(r.totalNet - amount)
        if (rest > 0) r.payments.push(payment(r, { kind: 'saldo', method: signal.method, amount: rest, state: 'pendente', dueAt: r.pickupDate }))
        addReservationAppointments(db, r, { state: () => 'agendado', assignedTo: ctx.userId(), createdBy: ctx.userId(), newId: () => ctx.newId('ag') })
        if (waiver) consumeException(ctx, waiver, r, round2(min - amount))
        return { ok: true as const, reservation: kit.refresh(r) }
      }),

    markReady: (id) =>
      run(() => {
        const r = ctx.reservation(id)
        kit.ensureState(r, ['confirmada'])
        kit.transition(r, 'pronta_retirada', 'Peça pronta para retirada')
        return kit.refresh(r)
      }),

    pickupItems: (id, decisions, exceptionId) =>
      run(() => {
        const r = kit.refresh(ctx.reservation(id))
        kit.ensureState(r, ['confirmada', 'pronta_retirada', 'retirada'])
        const open = new Map(r.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue').map((i) => [i.id, i]))
        const valid = decisions.filter((d) => open.has(d.itemId))
        if (!valid.some((d) => d.delivered)) fail([{ code: 'PARAMETRO_INVALIDO', field: 'items' }])
        const due = r.balance.due
        const exc = due > 0.005 ? usableException(ctx, exceptionId, 'retirada_com_saldo', { reservationId: r.id, amount: due }) : null
        if (due > 0.005 && !exc) fail([{ code: 'SALDO_EM_ABERTO' }], brl(due))

        // Retirada antecipada: a locação passa a começar hoje no calendário da peça. Se outro compromisso
        // ocupa a peça antes da data combinada, ela não pode sair antes.
        for (const d of valid.filter((x) => x.delivered)) {
          const g = ctx.garment(open.get(d.itemId)!.garmentId)
          const loc = g.blocks.find((b) => b.reservationId === r.id && b.kind === 'locacao')
          if (!loc || loc.from <= today) continue
          if (g.blocks.some((b) => b.reservationId !== r.id && b.from < loc.from && b.to >= today)) fail([{ code: 'CONFLITO_AGENDA', field: 'items' }])
        }
        for (const d of valid.filter((x) => x.delivered)) {
          const g = ctx.garment(open.get(d.itemId)!.garmentId)
          g.blocks = g.blocks.map((b) => (b.reservationId === r.id && b.kind === 'locacao' && b.from > today ? { ...b, from: today } : b))
        }

        const now = ctx.now()
        for (const d of valid) {
          const it = open.get(d.itemId)!
          if (d.delivered) {
            Object.assign(it, { itemState: 'retirado', pickedUpAt: now, pickupNote: d.note?.trim() || null })
            kit.setGarmentState(it.garmentId, 'em_uso', `Retirada — ${r.code}`)
          } else Object.assign(it, { itemState: 'nao_entregue', pickupNote: d.note?.trim() || 'Não entregue na retirada' })
        }
        r.pickedUpAt ??= now
        const items = live(r)
        const out = items.filter((i) => i.itemState === 'retirado' || i.itemState === 'devolvido' || i.itemState === 'inspecionado').length
        const all = out === items.length
        if (exc) consumeException(ctx, exc, r, due)
        const next = all ? 'em_uso' : 'retirada'
        if (next !== r.state) kit.transition(r, next, all ? 'Todas as peças retiradas pela cliente' : `Retirada parcial — ${out} de ${items.length} peça(s)`)
        // Na agenda, a retirada concluída fica no dia e hora em que a cliente de fato levou as peças.
        if (all) for (const a of apptsOf(r, 'retirada')) Object.assign(a, { state: 'concluido', startsAt: r.pickedUpAt ?? now })
        return kit.refresh(r)
      }),

    returnItems: (id, decisions) =>
      run(() => {
        const r = ctx.reservation(id)
        kit.ensureState(r, OUT_RESERVATION_STATES)
        const outNow = new Map(r.items.filter((i) => i.itemState === 'retirado').map((i) => [i.id, i]))
        const back = decisions.filter((d) => d.returned && outNow.has(d.itemId))
        if (!back.length) fail([{ code: 'PARAMETRO_INVALIDO', field: 'items' }])

        const now = ctx.now()
        for (const d of back) {
          const it = outNow.get(d.itemId)!
          Object.assign(it, { itemState: 'devolvido', returnedAt: now, returnNote: d.note?.trim() || null })
          const g = ctx.garment(it.garmentId)
          g.blocks = realignOnReturn({ blocks: g.blocks, reservationId: r.id, actualReturn: today, cleaningDays: effectiveCleaningDays(g, db.categories, db.settings) })
          kit.setGarmentState(g.id, 'inspecao', `Devolução — ${r.code}`)
        }
        const stillOut = r.items.filter((i) => i.itemState === 'retirado')
        const complete = stillOut.length === 0
        const ref = complete ? r.items.map((i) => i.returnedAt?.slice(0, 10) ?? '').sort().at(-1) || today : today
        const late = Math.max(0, diffDays(r.returnDueDate, ref))
        r.lateFee = lateFee(r.totalNet, lateFeePercent(r, db.settings), late)
        const notes = `${late} dia(s) de atraso${stillOut.length ? ` · ${stillOut.length} peça(s) ainda na rua` : ''}`
        kit.syncPending(r, { notes, dueAt: today })

        r.returnedAt = complete ? now : null
        if (complete) {
          // O que nunca saiu da loja não sai mais: vira "não entregue" e libera a agenda da peça.
          for (const it of r.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue')) {
            if (it.itemState === 'pendente') Object.assign(it, { itemState: 'nao_entregue', pickupNote: it.pickupNote || 'Não entregue na retirada' })
            const g = ctx.garment(it.garmentId)
            g.blocks = g.blocks.filter((b) => b.reservationId !== r.id)
          }
          kit.transition(r, 'em_inspecao', late > 0 ? `Devolvida com ${late} dia(s) de atraso` : 'Devolvida no prazo')
          for (const a of apptsOf(r, 'devolucao')) Object.assign(a, { state: 'concluido', startsAt: now })
          for (const it of r.items.filter((i) => i.itemState === 'nao_entregue')) kit.rederive(it.garmentId, `Reserva ${r.code} encerrada sem a peça`)
        } else {
          const received = r.items.filter((i) => i.itemState === 'devolvido' || i.itemState === 'inspecionado').length
          if (r.state !== 'aguardando_devolucao') kit.transition(r, 'aguardando_devolucao', `Devolução parcial — ${received} peça(s) recebida(s), ${stillOut.length} pendente(s)`)
          for (const it of stillOut) kit.rederive(it.garmentId, `Devolução parcial — ${r.code}`)
        }
        return kit.refresh(r)
      }),

    cancelReservation: (id, reason) =>
      run(() => {
        const r = ctx.reservation(id)
        const text = reason?.trim() ?? ''
        if (!text) fail([{ code: 'MOTIVO_OBRIGATORIO', field: 'reason' }])
        kit.ensureState(r, ['rascunho', 'confirmada', 'pronta_retirada'])
        release(r, 'cancelada', text)
        return kit.refresh(r)
      }),

    markNoShow: (id) =>
      run(() => {
        const r = ctx.reservation(id)
        kit.ensureState(r, ['confirmada', 'pronta_retirada'])
        if (r.pickupDate >= today) throw new SourceError('ESTADO_INVALIDO')
        release(r, 'no_show', 'Não compareceu para a retirada')
        return kit.refresh(r)
      }),
  }
}
