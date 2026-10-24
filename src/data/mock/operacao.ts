/**
 * Operação na fonte em memória (spec `operacao-financeiro.md` §1.2–§1.4): filas pós-devolução, inspeção,
 * conclusão de ordens e liberação. Cada operação valida antes de mexer; as transições da reserva e do
 * histórico da peça reaproveitam o kit de Reservas.
 */
import { CLOSED_RESERVATION_STATES } from '@/data/labels'
import { MAINTENANCE_KIND } from '@/data/labels-ops'
import { deriveGarmentState, effectiveCleaningDays } from '@/domain/calendar'
import { diffDays } from '@/domain/dates'
import { systemCategoryId } from '@/domain/fin-categories'
import { round2 } from '@/domain/money'
import { addDays } from '@/lib/format'
import { addOperationExpense } from '../fixture/finance'
import type { OperacaoSource } from '../source-operacao'
import {
  SourceError,
  type Garment,
  type GarmentBlock,
  type GarmentState,
  type Inspection,
  type InspectionFinding,
  type InspectionResult,
  type Maintenance,
  type OperacaoQueue,
  type QueueRow,
} from '../types'
import { fail, projectGarment, type MockCtx } from './context'
import { reservaKit } from './reservas-shared'

const SUPPLIERS = ['Lavanderia Branca Neve', 'Ateliê Dona Neuza', 'Ateliê próprio', 'Tinturaria Aurora']
const OPEN = ['aberta', 'em_andamento']
const CYCLE: GarmentState[] = ['inspecao', 'higienizacao', 'ajuste', 'manutencao', 'bloqueado']
const OPERATIONAL_BLOCKS = ['higienizacao', 'manutencao', 'ajuste', 'inspecao']
const RETURN_STATES = ['em_inspecao', 'devolvida', 'aguardando_devolucao']

const isOpen = (m: Maintenance) => OPEN.includes(m.state)
const findingText = (f: InspectionFinding) => `${f.label} (${f.severity === 'media' ? 'média' : f.severity})${f.note ? ` — ${f.note}` : ''}`

export function operacao(ctx: MockCtx): OperacaoSource {
  const { db, today, run, newId } = ctx
  const kit = reservaKit(ctx)
  const pg = (g: Garment) => projectGarment(ctx, g)
  const newOrder = (o: Partial<Maintenance> & Pick<Maintenance, 'garmentId' | 'kind' | 'state' | 'blocksGarment'>): Maintenance => {
    const m: Maintenance = { id: newId('mnt'), inspectionId: null, reservationId: null, openedAt: ctx.now(), dueAt: null, closedAt: null, description: null, provider: null, cost: 0, createdBy: ctx.userId(), ...o }
    db.maintenances.push(m)
    return m
  }

  /** Recalcula o estado a partir de `disponivel` (peça com locação ativa/futura volta `reservado`). */
  function recompute(g: Garment): GarmentState {
    const links = db.reservations
      .filter((r) => r.state !== 'rascunho')
      .flatMap((r) => r.items.filter((i) => i.garmentId === g.id).map((i) => ({ reservationId: r.id, state: r.state, itemState: i.itemState })))
    return deriveGarmentState({ current: 'disponivel', blocks: g.blocks, links, today })
  }

  /** Encerra a ordem: custo, fornecedor, observação e (custo > 0) a despesa paga; libera os blocos dela. */
  function closeOrder(m: Maintenance, cost: number, provider: string | null, note: string | null) {
    m.state = 'concluida'
    m.closedAt = ctx.now()
    m.cost = round2(cost)
    if (provider) m.provider = provider
    if (note) m.description = m.description ? `${m.description} · ${note}` : note
    const g = ctx.garment(m.garmentId)
    g.blocks = g.blocks.filter((b) => b.maintenanceId !== m.id)
    if (m.cost > 0) {
      addOperationExpense(db, {
        date: today,
        categoryId: systemCategoryId(db.finCategories, m.kind === 'higienizacao' || m.kind === 'ajuste' ? m.kind : 'manutencao')!,
        amount: m.cost,
        supplier: m.provider ?? 'Sem fornecedor',
        description: m.description ?? MAINTENANCE_KIND[m.kind],
        garmentId: m.garmentId,
        maintenanceId: m.id,
        reservationId: m.reservationId,
      })
    }
  }

  function release(g: Garment, note: string) {
    for (const m of db.maintenances.filter((x) => x.garmentId === g.id && isOpen(x))) closeOrder(m, m.cost, null, null)
    const closed = new Set(db.reservations.filter((r) => CLOSED_RESERVATION_STATES.includes(r.state)).map((r) => r.id))
    g.blocks = g.blocks.filter((b: GarmentBlock) => {
      if (b.to < today) return true
      if (OPERATIONAL_BLOCKS.includes(b.kind) && (!b.reservationId || closed.has(b.reservationId))) return false
      if (g.state === 'bloqueado' && (b.kind === 'bloqueio_manual' || b.kind === 'editorial') && b.from <= today) return false
      return true
    })
    kit.setGarmentState(g.id, recompute(g), note)
  }

  const queueRow = (g: Garment): QueueRow => {
    const p = pg(g)
    const order = db.maintenances.filter((m) => m.garmentId === g.id && isOpen(m)).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] ?? null
    const hold = p.blocks.find((b) => (b.kind === 'bloqueio_manual' || b.kind === 'editorial') && b.from <= today && b.to >= today)
    const enteredInspection = g.history.find((h) => h.to === 'inspecao')
    return {
      garment: p,
      order,
      blockNote: hold?.note ?? null,
      nextRentalStart: p.blocks.find((b) => b.kind === 'locacao' && b.from > today)?.from ?? null,
      daysOpen: order ? diffDays(order.openedAt.slice(0, 10), today) : null,
      waitingDays: g.state === 'inspecao' && enteredInspection ? Math.max(0, diffDays(enteredInspection.at.slice(0, 10), today)) : null,
    }
  }

  const target = (garmentId: string) =>
    db.reservations
      .filter((r) => RETURN_STATES.includes(r.state) && r.items.some((i) => i.garmentId === garmentId && i.itemState === 'devolvido'))
      .sort((a, b) => (b.returnedAt ?? b.items.find((i) => i.garmentId === garmentId)?.returnedAt ?? '').localeCompare(a.returnedAt ?? a.items.find((i) => i.garmentId === garmentId)?.returnedAt ?? ''))[0] ?? null

  return {
    operacaoQueue: () =>
      run((): OperacaoQueue => {
        const rows = (s: GarmentState) => db.garments.filter((g) => g.state === s).sort((a, b) => a.code.localeCompare(b.code)).map(queueRow)
        const since = addDays(today, -30)
        const costLast30d = round2(
          db.payables
            .filter((p) => p.source === 'operacao' && p.status !== 'cancelada' && p.dueDate >= since)
            .reduce((s, p) => s + (p.paidAmount ?? p.amount), 0),
        )
        const openOrders = db.maintenances
          .filter(isOpen)
          .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
          .map((m) => ({ ...m, garmentCode: ctx.garment(m.garmentId).code, garmentName: ctx.garment(m.garmentId).name }))
        return { inspecao: rows('inspecao'), higienizacao: rows('higienizacao'), ajuste: rows('ajuste'), manutencao: rows('manutencao'), bloqueado: rows('bloqueado'), openOrders, costLast30d }
      }),

    checklist: () => run(() => db.checklist.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder)),

    inspectionTarget: (garmentId) =>
      run(() => {
        const r = target(garmentId)
        return r ? { reservationId: r.id, customerName: ctx.customer(r.customerId).fullName } : null
      }),

    registerInspection: (input) =>
      run(() => {
        const g = db.garments.find((x) => x.id === input.garmentId)
        if (!g) throw new SourceError('PECA_NAO_ENCONTRADA')
        if (g.state !== 'inspecao') throw new SourceError('ESTADO_INVALIDO')
        const findings = input.findings
        const grave = findings.some((f) => f.severity === 'grave')
        const result: InspectionResult = grave && input.perda ? 'perda' : findings.length === 0 ? 'aprovada' : grave ? 'reprovada' : 'ressalva'
        const provider = input.provider?.trim() || null
        const notes = input.notes?.trim() || (findings.length ? 'Ressalvas registradas na inspeção.' : 'Peça devolvida em boas condições.')
        const inspection: Inspection = {
          id: newId('insp'),
          garmentId: g.id,
          reservationId: input.reservationId,
          inspectedAt: ctx.now(),
          inspectorId: ctx.userId(),
          inspectorName: ctx.userName(),
          result,
          findings,
          notes,
          photos: input.photos.map((p, i) => ({ id: newId('ph'), kind: p.kind, url: `simulada:${p.kind}-${i + 1}` })),
        }
        db.inspections.push(inspection)
        // A higienização pós-uso planejada da reserva dá lugar ao bloco da ordem (ou do bloqueio).
        g.blocks = g.blocks.filter((b) => !(input.reservationId && b.reservationId === input.reservationId && b.kind === 'higienizacao'))
        const own = { garmentId: g.id, inspectionId: inspection.id, reservationId: input.reservationId, provider }
        const block = (kind: GarmentBlock['kind'], to: string, note: string, maintenanceId: string | null) =>
          g.blocks.push({ id: newId('blk'), kind, from: today, to, note, maintenanceId })
        let next: GarmentState
        let reason: string
        if (result === 'perda') {
          block('bloqueio_manual', addDays(today, 30), 'Avaliação gerencial — possível perda da peça', null)
          next = 'bloqueado'
          reason = 'Dano grave — bloqueada para avaliação gerencial'
        } else if (result === 'reprovada') {
          const m = newOrder({ ...own, kind: input.maintenanceKind, state: 'aberta', dueAt: addDays(today, 5), description: findings.map(findingText).join('; ') || notes, blocksGarment: true })
          block('manutencao', addDays(today, 5), 'Manutenção aberta na inspeção', m.id)
          next = 'manutencao'
          reason = 'Dano identificado na inspeção'
        } else {
          const cleaning = Math.max(1, effectiveCleaningDays(g, db.categories, db.settings))
          const m = newOrder({ ...own, kind: 'higienizacao', state: 'em_andamento', dueAt: addDays(today, cleaning), description: 'Higienização pós-locação', blocksGarment: true })
          block('higienizacao', addDays(today, cleaning), 'Higienização', m.id)
          if (result === 'ressalva' && input.openRepair) {
            newOrder({ ...own, kind: input.maintenanceKind, state: 'aberta', dueAt: addDays(today, Math.max(2, cleaning + 1)), description: findings.map(findingText).join('; ') || 'Reparo leve identificado na inspeção', blocksGarment: false })
          }
          next = 'higienizacao'
          reason = 'Enviada para higienização'
        }
        kit.setGarmentState(g.id, next, reason)

        const r = input.reservationId ? db.reservations.find((x) => x.id === input.reservationId) : undefined
        if (r) {
          const item = r.items.find((i) => i.garmentId === g.id && i.itemState === 'devolvido')
          if (item) item.itemState = 'inspecionado'
          const live = r.items.filter((i) => i.itemState !== 'cancelado')
          if (r.state !== 'finalizada' && live.every((i) => i.itemState === 'inspecionado' || i.itemState === 'nao_entregue')) kit.transition(r, 'finalizada', 'Todas as peças inspecionadas')
        }
        return { result, garment: pg(g) }
      }),

    closeMaintenance: (input) =>
      run(() => {
        const m = db.maintenances.find((x) => x.id === input.maintenanceId)
        if (!m) throw new SourceError('ORDEM_NAO_ENCONTRADA')
        if (!isOpen(m)) throw new SourceError('ORDEM_JA_CONCLUIDA')
        if (!Number.isFinite(input.cost) || input.cost < 0) fail([{ code: 'CUSTO_INVALIDO', field: 'cost' }])
        closeOrder(m, input.cost, input.provider?.trim() || null, input.note?.trim() || null)
        const g = ctx.garment(m.garmentId)
        if (input.release) release(g, 'Liberada pela Operação')
        return pg(g)
      }),

    releaseGarment: (garmentId, note) =>
      run(() => {
        const g = db.garments.find((x) => x.id === garmentId)
        if (!g) throw new SourceError('PECA_NAO_ENCONTRADA')
        if (!CYCLE.includes(g.state) || g.state === 'inspecao') throw new SourceError('ESTADO_INVALIDO')
        release(g, note.trim() || 'Liberada pela Operação')
        return pg(g)
      }),

    maintenancesOf: (garmentId) =>
      run(() => ({
        maintenances: db.maintenances.filter((m) => m.garmentId === garmentId).sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
        inspections: db.inspections.filter((i) => i.garmentId === garmentId).sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)),
      })),

    suppliers: () => run(() => [...new Set([...SUPPLIERS, ...db.maintenances.map((m) => m.provider).filter((p): p is string => !!p)])]),
  }
}
