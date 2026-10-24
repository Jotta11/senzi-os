/**
 * Agenda e Provas na fonte em memória (spec `telas/agenda-provas.md` §3 e §4). Os compromissos automáticos
 * já existem no mundo (criados pelos eventos de negócio); aqui a prova cria o seu e o encerramento os conclui.
 */
import { AG_KIND, FIT_OUTCOME } from '@/data/labels-ops'
import { conversionRate, fittingStats } from '@/domain/fittings'
import { dayRange } from '@/domain/dates'
import { at } from '../fixture/kit'
import { STORE_TZ } from '@/lib/format'
import type { AgendaSource } from '../source-agenda'
import {
  SourceError,
  type AgendaDay,
  type AgendaGarmentBlock,
  type AgendaItem,
  type Appointment,
  type AppointmentInput,
  type FittingDetail,
  type FittingFilter,
  type FittingHistoryRow,
  type FittingInput,
  type FittingItem,
  type FittingListRow,
  type FittingSession,
  type SourceIssue,
} from '../types'
import { fail, projectCustomer, projectGarment, type MockCtx } from './context'

const BLOCK_KINDS: AgendaGarmentBlock['kind'][] = ['higienizacao', 'manutencao', 'ajuste', 'bloqueio_manual', 'editorial']
const MAX_BLOCKS = 4
const DEFAULT_TIME = '15:00'
const OPEN = ['agendada', 'em_curso']
const FILTER_STATES: Record<FittingFilter, string[] | null> = {
  abertas: OPEN,
  convertidas: ['convertida'],
  perdidas: ['perdida', 'no_show'],
  todas: null,
}
const MANUAL_KINDS: Appointment['kind'][] = ['atendimento', 'servico', 'interno']

/** `HH:MM` agora no fuso da loja. */
const storeTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: STORE_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
const isDate = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const isTime = (s: string | null | undefined) => !!s && /^\d{2}:\d{2}$/.test(s)

/** `createCustomer` da fonte de Acervo/Clientes: a prova nova usa a mesma validação e o mesmo cadastro. */
type CreateCustomer = (input: NonNullable<FittingInput['newCustomer']>) => Promise<{ id: string }>

export function agenda(ctx: MockCtx, createCustomer: CreateCustomer): AgendaSource {
  const { db, today, userName, run, newId, garment, customer } = ctx
  const currentUserId = () => db.users.find((u) => u.name === userName())?.id ?? null
  /** "Agora" no fuso da loja, coerente com o "hoje" da fonte. */
  const now = () => at(today, storeTime())

  const fitting = (id: string): FittingSession => {
    const f = db.fittings.find((x) => x.id === id)
    if (!f) throw new SourceError('NAO_ENCONTRADO')
    return f
  }
  const openFitting = (id: string): FittingSession => {
    const f = fitting(id)
    if (!OPEN.includes(f.state)) throw new SourceError('PROVA_ENCERRADA')
    return f
  }
  const isManual = (a: Appointment) => MANUAL_KINDS.includes(a.kind) && !a.reservationId && !a.fittingId
  const manualAppointment = (id: string): Appointment => {
    const a = db.appointments.find((x) => x.id === id)
    if (!a) throw new SourceError('NAO_ENCONTRADO')
    if (!isManual(a) || a.state !== 'agendado') throw new SourceError('ESTADO_INVALIDO')
    return a
  }

  function checkAppointment(input: AppointmentInput) {
    const issues: SourceIssue[] = []
    if (!isDate(input.date)) issues.push({ code: 'DATA_OBRIGATORIA', field: 'date' })
    if (!isTime(input.time)) issues.push({ code: 'HORARIO_OBRIGATORIO', field: 'time' })
    const notes = input.notes?.trim()
    if (input.kind === 'atendimento' && !input.customerId) issues.push({ code: 'CLIENTE_OBRIGATORIA', field: 'customerId' })
    else if (input.kind !== 'atendimento' && !input.customerId && !notes) issues.push({ code: 'OBSERVACAO_OBRIGATORIA', field: 'notes' })
    if (issues.length) fail(issues)
    if (input.customerId) customer(input.customerId)
  }
  const titleOf = (input: AppointmentInput) => (input.kind === 'atendimento' ? 'Atendimento' : input.notes?.trim() || AG_KIND[input.kind].label)
  const applyAppointment = (a: Appointment, input: AppointmentInput) => {
    a.kind = input.kind
    a.startsAt = at(input.date, input.time)
    a.title = titleOf(input)
    a.notes = input.notes?.trim() || null
    a.customerId = input.customerId || null
    a.internal = input.kind === 'interno'
  }

  function agendaItem(a: Appointment): AgendaItem {
    const c = a.customerId ? db.customers.find((x) => x.id === a.customerId) : undefined
    const r = a.reservationId ? db.reservations.find((x) => x.id === a.reservationId) : undefined
    const f = a.fittingId ? db.fittings.find((x) => x.id === a.fittingId) : undefined
    const items = r?.items ?? []
    return {
      id: a.id,
      time: a.startsAt.slice(11, 16),
      kind: a.kind,
      customer: c ? { id: c.id, fullName: c.fullName } : null,
      reservation: r ? { id: r.id, code: r.code } : null,
      fitting: f ? { id: f.id, code: f.code } : null,
      garments: items.flatMap((i) => {
        const g = db.garments.find((x) => x.id === i.garmentId)
        return g ? [{ id: g.id, code: g.code, name: g.name }] : []
      }),
      title: a.title ?? AG_KIND[a.kind].label,
      notes: a.notes,
      state: a.state,
      internal: a.internal,
      ...(a.kind === 'retirada' ? { pendingPickupItems: items.filter((i) => i.itemState === 'pendente').length } : {}),
      ...(a.kind === 'devolucao' ? { itemsOut: items.filter((i) => i.itemState === 'retirado').length } : {}),
    }
  }

  function blocksOf(day: string): AgendaGarmentBlock[] {
    return db.garments
      .flatMap((g) =>
        BLOCK_KINDS.filter((k) => g.blocks.some((b) => b.kind === k && b.from <= day && day <= b.to)).map((kind) => ({ garmentId: g.id, garmentCode: g.code, kind })),
      )
      .sort((a, b) => a.garmentCode.localeCompare(b.garmentCode) || BLOCK_KINDS.indexOf(a.kind) - BLOCK_KINDS.indexOf(b.kind))
  }

  const row = (f: FittingSession): FittingListRow => {
    const items = db.fittingItems.filter((i) => i.fittingSessionId === f.id)
    const outcome = (i: FittingItem) => FIT_OUTCOME[i.outcome]
    return {
      ...f,
      customerName: customer(f.customerId).fullName,
      itemCount: items.length,
      approvedCount: items.filter((i) => outcome(i).positive === true).length,
      discardedCount: items.filter((i) => i.outcome === 'descartada' || i.outcome === 'nao_gostou').length,
    }
  }
  const rowsOf = (pred: (f: FittingSession) => boolean) =>
    db.fittings.filter(pred).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.id.localeCompare(a.id)).map(row)

  /** Linha da lista + peças da sessão (só `only`, se informada), na ordem da prova. */
  const history = (r: FittingListRow, only?: string): FittingHistoryRow => ({
    ...r,
    items: db.fittingItems
      .filter((i) => i.fittingSessionId === r.id && (!only || i.garmentId === only))
      .sort((a, b) => a.position - b.position)
      .map((i) => {
        const g = garment(i.garmentId)
        return { garmentId: g.id, garmentCode: g.code, garmentName: g.name, outcome: i.outcome, note: i.note, needsAlteration: i.needsAlteration }
      }),
  })

  function detail(f: FittingSession): FittingDetail {
    const c = customer(f.customerId)
    const r = f.reservationId ? db.reservations.find((x) => x.id === f.reservationId) : undefined
    return {
      session: f,
      customer: projectCustomer(ctx, c),
      attendantName: db.users.find((u) => u.id === f.attendantId)?.name ?? null,
      items: db.fittingItems
        .filter((i) => i.fittingSessionId === f.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, garment: projectGarment(ctx, garment(i.garmentId)), favorite: c.favorites.some((x) => x.garmentId === i.garmentId) })),
      reservation: r ? { id: r.id, code: r.code, customerName: customer(r.customerId).fullName, eventDate: r.eventDate } : null,
    }
  }

  function checkFitting(input: FittingInput) {
    const issues: SourceIssue[] = []
    if (!input.customerId && !input.newCustomer) issues.push({ code: 'CLIENTE_OBRIGATORIA', field: 'customerId' })
    if (!isDate(input.date)) issues.push({ code: 'DATA_OBRIGATORIA', field: 'date' })
    else if (input.eventDate && input.eventDate < input.date) issues.push({ code: 'DATAS_INCOERENTES', field: 'eventDate' })
    if (issues.length) fail(issues)
    if (input.customerId) customer(input.customerId)
  }

  return {
    agendaRange: (from, to) =>
      run((): AgendaDay[] =>
        dayRange(from, to).map((date) => {
          const items = db.appointments
            .filter((a) => a.startsAt.slice(0, 10) === date && a.state !== 'cancelado')
            .sort((a, b) => a.startsAt.slice(11, 16).localeCompare(b.startsAt.slice(11, 16)) || a.id.localeCompare(b.id))
            .map(agendaItem)
          const blocks = blocksOf(date)
          return { date, items, garmentBlocks: blocks.slice(0, MAX_BLOCKS), moreBlocks: Math.max(0, blocks.length - MAX_BLOCKS) }
        }),
      ),

    agendaMonthDays: (month) =>
      run(() => [...new Set(db.appointments.filter((a) => a.state !== 'cancelado' && a.startsAt.startsWith(month)).map((a) => a.startsAt.slice(0, 10)))].sort()),

    createAppointment: (input) =>
      run(() => {
        checkAppointment(input)
        const a: Appointment = {
          id: newId('ag'),
          kind: input.kind,
          startsAt: '',
          title: null,
          notes: null,
          state: 'agendado',
          customerId: null,
          reservationId: null,
          fittingId: null,
          garmentId: null,
          assignedTo: currentUserId(),
          internal: false,
          createdBy: currentUserId(),
        }
        applyAppointment(a, input)
        db.appointments.push(a)
        return a
      }),

    updateAppointment: (id, input) =>
      run(() => {
        const a = manualAppointment(id)
        checkAppointment(input)
        applyAppointment(a, input)
        return a
      }),

    cancelAppointment: (id) =>
      run(() => {
        const a = manualAppointment(id)
        a.state = 'cancelado'
        return a
      }),

    listUsers: () => run(() => db.users),

    listFittings: (filter, page) =>
      run(() => {
        const states = FILTER_STATES[filter]
        const all = rowsOf((f) => !states || states.includes(f.state))
        return { items: all.slice(page.offset, page.offset + page.limit), total: all.length }
      }),

    fittingKpis: () =>
      run(() => {
        const { closed, converted, rate } = conversionRate(db.fittings)
        return {
          open: db.fittings.filter((f) => OPEN.includes(f.state)).length,
          converted,
          lost: db.fittings.filter((f) => f.state === 'perdida').length,
          closed,
          rate: rate ?? 0,
          total: db.fittings.length,
        }
      }),

    getFitting: (id) =>
      run(() => {
        const f = db.fittings.find((x) => x.id === id)
        return f ? detail(f) : null
      }),

    async createFitting(input) {
      await run(() => checkFitting(input))
      const customerId = input.customerId ?? (await createCustomer(input.newCustomer!)).id
      return run(() => {
        const when = at(input.date, input.time?.trim() || DEFAULT_TIME)
        const year = input.date.slice(0, 4)
        const seq = db.fittings.reduce((m, f) => (f.code.startsWith(`PR-${year}-`) ? Math.max(m, Number(f.code.slice(-4)) || 0) : m), 0) + 1
        const attendantId = (input.attendantName && db.users.find((u) => u.name === input.attendantName)?.id) || currentUserId()
        const f: FittingSession = {
          id: newId('fit'),
          code: `PR-${year}-${String(seq).padStart(4, '0')}`,
          customerId,
          state: 'agendada',
          scheduledAt: when,
          startedAt: null,
          endedAt: null,
          attendantId,
          eventType: input.eventType?.trim() || null,
          eventDate: input.eventDate || null,
          budget: input.budget ?? null,
          notes: input.notes?.trim() || null,
          outcomeNotes: null,
          reservationId: null,
          createdBy: currentUserId(),
        }
        db.fittings.push(f)
        db.appointments.push({
          id: newId('ag'),
          kind: 'prova',
          startsAt: when,
          title: 'Prova',
          notes: f.notes,
          state: 'agendado',
          customerId,
          reservationId: null,
          fittingId: f.id,
          garmentId: null,
          assignedTo: attendantId,
          internal: false,
          createdBy: currentUserId(),
        })
        return f
      })
    },

    addFittingGarment: (id, garmentId) =>
      run(() => {
        const f = openFitting(id)
        garment(garmentId)
        const mine = db.fittingItems.filter((i) => i.fittingSessionId === id)
        if (!mine.some((i) => i.garmentId === garmentId)) {
          db.fittingItems.push({
            fittingSessionId: id,
            garmentId,
            position: mine.reduce((m, i) => Math.max(m, i.position), -1) + 1,
            outcome: 'nao_provou',
            needsAlteration: false,
            note: null,
            recordedBy: null,
            recordedAt: null,
          })
        }
        return detail(f)
      }),

    removeFittingGarment: (id, garmentId) =>
      run(() => {
        const f = openFitting(id)
        db.fittingItems = db.fittingItems.filter((i) => !(i.fittingSessionId === id && i.garmentId === garmentId))
        return detail(f)
      }),

    setFittingOutcome: (id, garmentId, v) =>
      run(() => {
        const f = openFitting(id)
        const item = db.fittingItems.find((i) => i.fittingSessionId === id && i.garmentId === garmentId)
        if (!item) throw new SourceError('NAO_ENCONTRADO')
        const at_ = now()
        if (v.outcome !== undefined) item.outcome = v.outcome
        if (v.needsAlteration !== undefined) item.needsAlteration = v.needsAlteration
        if (v.note !== undefined) item.note = v.note?.trim() || null
        item.recordedBy = currentUserId()
        item.recordedAt = at_
        if (f.state === 'agendada') {
          f.state = 'em_curso'
          f.startedAt = at_
        }
        if (item.outcome === 'favorita') {
          const c = customer(f.customerId)
          const fav = c.favorites.find((x) => x.garmentId === garmentId)
          if (fav) Object.assign(fav, { source: 'prova', note: item.note ?? fav.note })
          else c.favorites.unshift({ garmentId, source: 'prova', note: item.note, at: at_ })
        }
        return detail(f)
      }),

    closeFitting: (id, state, notes) =>
      run(() => {
        const f = openFitting(id)
        if (state !== 'perdida' && state !== 'concluida' && state !== 'no_show') fail([{ code: 'PARAMETRO_INVALIDO', field: 'state' }])
        f.state = state
        f.endedAt = now()
        f.outcomeNotes = notes?.trim() || f.outcomeNotes
        for (const a of db.appointments) {
          if (a.fittingId === id && a.kind === 'prova' && a.state === 'agendado') a.state = state === 'no_show' ? 'no_show' : 'concluido'
        }
        return detail(f)
      }),

    fittingsOfCustomer: (customerId) => run(() => rowsOf((f) => f.customerId === customerId).map((r) => history(r))),

    fittingsOfGarment: (garmentId) =>
      run(() => {
        const ids = new Set(db.fittingItems.filter((i) => i.garmentId === garmentId).map((i) => i.fittingSessionId))
        return rowsOf((f) => ids.has(f.id)).map((r) => history(r, garmentId))
      }),

    fittingStatsOf: (garmentId) =>
      run(() =>
        fittingStats(
          garmentId,
          db.fittings,
          db.fittingItems,
          db.reservations.flatMap((r) => r.items.map((i) => ({ reservationId: r.id, garmentId: i.garmentId }))),
        ),
      ),
  }
}
