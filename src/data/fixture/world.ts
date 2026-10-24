/**
 * Mundo fictício coerente da prévia: acervo, clientes, reservas (histórico + situação atual), provas,
 * agenda, operação e financeiro, todos relativos a `today`. Coerente por construção: blocos das peças
 * saem de `makeBlocks`/`realignOnReturn`, estados de `deriveGarmentState`, valores de `prorate`/`balance`.
 * Determinístico (PRNG com semente fixa): a mesma data gera o mesmo mundo. Só a fonte em memória importa.
 */
import { ACTIVE_RESERVATION_STATES, CLOSED_RESERVATION_STATES } from '@/data/labels'
import { customerStats } from '@/domain/customers'
import { deriveGarmentState, effectiveCleaningDays, makeBlocks, realignOnReturn } from '@/domain/calendar'
import { diffDays } from '@/domain/dates'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import { addDays } from '@/lib/format'
import type { GarmentHistoryEntry, GarmentState } from '../types'
import type { World } from '../types-world'
import { renderContract } from '../mock/contract'
import { buildCustomers } from './customers'
import { buildFinance } from './finance'
import { buildAppointments, buildFittings } from './fittings'
import { BRANDS, buildGarments, CATEGORIES } from './garments'
import { buildHistory, type Busy } from './history'
import { makeRng, USER, userName } from './kit'
import { buildCurrent, buildOperation, COMO_BAIXA } from './scenario'

export type { World }

const CHECKLIST = ['Manchas', 'Rasgos e furos', 'Costuras', 'Zíper e fechos', 'Aplicações e pedrarias', 'Barra', 'Odor', 'Desgaste do tecido', 'Forro', 'Alças e sustentação']
const SEED = 20260913

/** Dados fictícios completos, com datas relativas a `today` (`aaaa-mm-dd`). Sempre um objeto novo. */
export function buildWorld(today: string): World {
  const rng = makeRng(SEED)
  const garments = buildGarments(today)
  const w: World = {
    today,
    settings: { ...DEFAULT_SETTINGS },
    users: [
      { id: USER.julia.id, name: USER.julia.name, email: 'julia@senzi.com.br', role: 'admin' },
      { id: USER.ana.id, name: USER.ana.name, email: 'ana@senzi.com.br', role: 'atendimento' },
      { id: USER.bruna.id, name: USER.bruna.name, email: 'bruna@senzi.com.br', role: 'atendimento' },
    ],
    categories: CATEGORIES.map((c) => ({ ...c })),
    brands: [...BRANDS],
    garments,
    customers: buildCustomers(today, garments),
    reservations: [],
    fittings: [],
    fittingItems: [],
    appointments: [],
    maintenances: [],
    inspections: [],
    checklist: CHECKLIST.map((label, i) => ({ id: `chk-${i + 1}`, label, sortOrder: i, isActive: true })),
    finCategories: [],
    payables: [],
    receivables: [],
    exceptions: [],
    pinAttempts: [],
  }

  const refs = buildCurrent(w, rng)
  buildOperation(w, rng)
  buildHistory(w, rng, busyWindows(w))
  buildFittings(w, rng, refs)
  buildFinance(w)
  number(w)
  buildAppointments(w, refs)
  placeBlocks(w)
  deriveStates(w)
  buildTimelines(w)
  for (const c of w.customers) {
    const first = w.reservations.filter((r) => r.customerId === c.id).map((r) => r.createdAt.slice(0, 10)).sort()[0]
    if (first && first <= c.createdAt.slice(0, 10)) c.createdAt = `${addDays(first, -2)}T14:00:00-03:00`
    c.stats = customerStats(c.id, w.reservations, today)
  }
  w.exceptions = w.reservations.flatMap((r) => r.authorizations.map((a) => ({ ...a })))
  for (const insp of [...w.inspections].sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)).slice(0, 3)) {
    insp.photos = (['devolucao', 'detalhe'] as const).map((kind, i) => ({ id: `${insp.id}-f${i + 1}`, kind, url: `preview://inspecoes/${insp.id}/${kind}-${i + 1}.jpg` }))
  }
  return w
}

/** Onde o cenário já ocupa cada peça (offsets): o histórico desvia. Reservas encerradas sem locação ocupam só a janela. */
function busyWindows(w: World): Map<string, Busy[]> {
  const out = new Map<string, Busy[]>()
  const add = (gid: string, b: Busy) => out.set(gid, [...(out.get(gid) ?? []), b])
  const off = (d: string) => diffDays(w.today, d)
  for (const r of w.reservations) {
    if (r.state === 'rascunho') continue
    for (const it of r.items) {
      const g = w.garments.find((x) => x.id === it.garmentId)!
      const end = r.state === 'cancelada' || r.state === 'no_show' ? off(r.returnDueDate) + effectiveCleaningDays(g, w.categories, w.settings) : Infinity
      add(g.id, { from: off(r.pickupDate), to: end })
    }
  }
  for (const g of w.garments) for (const b of g.blocks) add(g.id, { from: off(b.from), to: Infinity })
  const como = w.garments.find((g) => g.name.endsWith(' Como'))!
  add(como.id, { from: COMO_BAIXA, to: Infinity })
  return out
}

/** Códigos `RS-{ano}-{NNNN}` / `CT-…` e `PR-{ano}-{NNNN}` em ordem cronológica; listas reordenadas. */
function number(w: World): void {
  const seq = new Map<string, number>()
  const code = (prefix: string, when: string) => {
    const key = `${prefix}-${when.slice(0, 4)}`
    const n = (seq.get(key) ?? 0) + 1
    seq.set(key, n)
    return `${key}-${String(n).padStart(4, '0')}`
  }
  w.reservations.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  for (const r of w.reservations) {
    r.code = code('RS', r.createdAt)
    if (r.contract) r.contract.number = r.code.replace('RS', 'CT')
  }
  for (const r of w.reservations) if (r.contract) r.contract.bodyRendered = renderContract(w, r)
  w.fittings.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id))
  for (const f of w.fittings) f.code = code('PR', f.scheduledAt)
}

/**
 * Blocos das reservas confirmadas/ativas (`makeBlocks`, realinhados na devolução real). Encerradas não deixam
 * bloco, salvo higienização pós-uso que ainda cobre hoje e não está coberta por uma ordem da Operação.
 */
function placeBlocks(w: World): void {
  const g = (id: string) => w.garments.find((x) => x.id === id)!
  const returned: { gid: string; rid: string; day: string }[] = []
  for (const r of w.reservations) {
    if (r.state === 'rascunho' || r.state === 'cancelada' || r.state === 'no_show') continue
    r.items.forEach((it, k) => {
      if (it.itemState === 'cancelado') return
      const garment = g(it.garmentId)
      const nb = makeBlocks({ garment, pickup: r.pickupDate, returnDue: r.returnDueDate, reservationId: r.id, settings: w.settings, categories: w.categories })
      garment.blocks.push(...nb.map((b) => ({ ...b, id: `${r.id}-${k + 1}-${b.kind}` })))
      if (it.returnedAt) returned.push({ gid: garment.id, rid: r.id, day: it.returnedAt.slice(0, 10) })
    })
  }
  for (const x of returned) {
    const garment = g(x.gid)
    garment.blocks = realignOnReturn({ blocks: garment.blocks, reservationId: x.rid, actualReturn: x.day, cleaningDays: effectiveCleaningDays(garment, w.categories, w.settings) })
  }
  const closed = new Set(w.reservations.filter((r) => CLOSED_RESERVATION_STATES.includes(r.state)).map((r) => r.id))
  for (const garment of w.garments) {
    const ops = garment.blocks.filter((b) => b.maintenanceId)
    garment.blocks = garment.blocks
      .filter((b) => {
        if (!b.reservationId || !closed.has(b.reservationId)) return true
        if (b.kind !== 'higienizacao' || b.to < w.today) return false
        return !ops.some((o) => o.from <= b.to && b.from <= o.to)
      })
      .sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))
  }
}

/** Estado de cada peça: os da Operação/baixa já vieram do cenário; o resto sai de `deriveGarmentState`. */
function deriveStates(w: World): void {
  for (const g of w.garments) {
    const links = w.reservations
      .filter((r) => r.state !== 'rascunho')
      .flatMap((r) => r.items.filter((i) => i.garmentId === g.id).map((i) => ({ reservationId: r.id, state: r.state, itemState: i.itemState })))
    g.state = deriveGarmentState({ current: g.state, blocks: g.blocks, links, today: w.today })
  }
}

/** Linha do tempo da peça a partir dos fatos (reservas, inspeções, ordens); `from` = estado anterior. Mais recente primeiro. */
function buildTimelines(w: World): void {
  type Ev = Omit<GarmentHistoryEntry, 'from'>
  const evs = new Map<string, Ev[]>()
  const push = (gid: string, e: Ev) => evs.set(gid, [...(evs.get(gid) ?? []), e])
  for (const r of w.reservations) {
    if (r.state === 'rascunho' || r.state === 'cancelada' || r.state === 'no_show') continue
    const confirmed = r.history.find((h) => h.toState === 'confirmada')
    for (const it of r.items) {
      if (confirmed && ACTIVE_RESERVATION_STATES.includes(r.state)) push(it.garmentId, { at: confirmed.occurredAt, to: 'reservado', reason: `Reserva ${r.code} confirmada`, userName: userName(r.createdBy) })
      if (it.pickedUpAt) push(it.garmentId, { at: it.pickedUpAt, to: 'em_uso', reason: `Retirada — ${r.code}`, userName: userName(r.createdBy) })
      if (it.returnedAt) push(it.garmentId, { at: it.returnedAt, to: 'inspecao', reason: `Devolução — ${r.code}`, userName: USER.bruna.name })
    }
  }
  for (const i of w.inspections) {
    const bad = i.result === 'reprovada'
    push(i.garmentId, { at: i.inspectedAt, to: bad ? 'manutencao' : 'higienizacao', reason: bad ? 'Dano identificado na inspeção' : 'Enviada para higienização', userName: i.inspectorName })
  }
  for (const m of w.maintenances) {
    if (m.state === 'concluida' && m.kind === 'higienizacao' && m.closedAt) push(m.garmentId, { at: m.closedAt, to: 'disponivel', reason: 'Liberada para o acervo', userName: USER.bruna.name })
  }
  for (const g of w.garments) {
    const all: Ev[] = [...g.history.map(({ at, to, reason, userName }) => ({ at, to, reason, userName })), ...(evs.get(g.id) ?? [])].sort((a, b) => a.at.localeCompare(b.at))
    let prev: GarmentState | null = null
    g.history = all
      .map((e) => {
        const entry: GarmentHistoryEntry = { ...e, from: prev }
        prev = e.to
        return entry
      })
      .reverse()
  }
}
