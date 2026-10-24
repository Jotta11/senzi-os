/**
 * Calendário das peças: janela ocupada, disponibilidade, blocos da reserva, realinhamento na devolução,
 * estado derivado e alternativas (spec reservas §4.5). Funções puras; "hoje" é sempre parâmetro.
 */
import { BLOCK_KIND, CLOSED_RESERVATION_STATES } from '@/data/labels'
import type { AvailabilityConflict, AvailabilityResult, Category, Garment, GarmentBlock, GarmentState, ItemState, ReservationState, Settings } from '@/data/types'
import { addDays } from '@/lib/format'

const CLOSED_STATES: readonly ReservationState[] = CLOSED_RESERVATION_STATES

/** Dias de higienização: peça > categoria > padrão do sistema. */
export function effectiveCleaningDays(garment: Garment, categories: Category[], settings: Settings): number {
  return garment.cleaningDays ?? categories.find((c) => c.slug === garment.categorySlug)?.cleaningDays ?? settings.defaultCleaningDays
}

/** Intervalo ocupado: preparação antes da retirada e higienização depois da devolução. */
export function occupiedWindow(pickup: string, returnDue: string, prepDays: number, cleaningDays: number): { from: string; to: string } {
  return { from: addDays(pickup, -prepDays), to: addDays(returnDue, cleaningDays) }
}

/** Rascunho de outra reserva com a mesma peça (quem chama já filtra pela peça). */
export type AvailabilityDraft = { reservationId: string; code: string; pickupDate: string; returnDueDate: string }

export type CheckAvailabilityInput = {
  garment: Garment
  /** Blocos ativos da peça. */
  blocks: GarmentBlock[]
  pickup: string
  returnDue: string
  /** Reserva em edição: seus blocos/rascunho não contam. */
  ignoreReservationId?: string | null
  drafts: AvailabilityDraft[]
  settings: Settings
  categories: Category[]
  /** Código e estado das reservas donas dos blocos (para código no conflito e para ignorar histórico). */
  reservations?: Record<string, { code: string; state: ReservationState }>
}

const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string) => aFrom <= bTo && aTo >= bFrom

/** Disponibilidade da peça no período (com preparação e higienização). Rascunhos viram conflito `draft: true`. */
export function checkAvailability(input: CheckAvailabilityInput): AvailabilityResult {
  const { garment, blocks, pickup, returnDue, drafts, settings, categories, reservations = {} } = input
  const ignore = input.ignoreReservationId ?? null
  const cleaningDays = effectiveCleaningDays(garment, categories, settings)
  const prep = settings.defaultPrepDays
  const win = occupiedWindow(pickup, returnDue, prep, cleaningDays)
  const window = { ...win, cleaningDays }
  if (garment.state === 'baixado') return { garmentId: garment.id, ok: false, conflicts: [], reason: 'Peça baixada do acervo.', window }

  const conflicts: AvailabilityConflict[] = []
  for (const b of blocks) {
    if (ignore && b.reservationId === ignore) continue
    const res = b.reservationId ? reservations[b.reservationId] : undefined
    if (b.kind === 'locacao' && res && CLOSED_STATES.includes(res.state)) continue
    if (!overlaps(b.from, b.to, win.from, win.to)) continue
    conflicts.push({ kind: b.kind, label: BLOCK_KIND[b.kind].label, from: b.from, to: b.to, reservationCode: res?.code ?? null, draft: false })
  }
  for (const d of drafts) {
    if (ignore && d.reservationId === ignore) continue
    const w = occupiedWindow(d.pickupDate, d.returnDueDate, prep, cleaningDays)
    if (!overlaps(w.from, w.to, win.from, win.to)) continue
    conflicts.push({ kind: 'locacao', label: 'Rascunho', from: w.from, to: w.to, reservationCode: d.code, draft: true })
  }
  return { garmentId: garment.id, ok: conflicts.length === 0, conflicts, reason: null, window }
}

export type NewBlock = Omit<GarmentBlock, 'id'>

/** Blocos criados ao confirmar a reserva, por peça: preparação (se houver), locação e higienização pós-uso (se houver). */
export function makeBlocks(input: {
  garment: Garment
  pickup: string
  returnDue: string
  reservationId: string
  settings: Settings
  categories: Category[]
}): NewBlock[] {
  const { garment, pickup, returnDue, reservationId, settings, categories } = input
  const cleaning = effectiveCleaningDays(garment, categories, settings)
  const prep = settings.defaultPrepDays
  const out: NewBlock[] = []
  if (prep > 0) out.push({ kind: 'inspecao', from: addDays(pickup, -prep), to: addDays(pickup, -1), note: 'Preparação', reservationId })
  out.push({ kind: 'locacao', from: pickup, to: returnDue, note: 'Locação', reservationId })
  if (cleaning > 0) out.push({ kind: 'higienizacao', from: addDays(returnDue, 1), to: addDays(returnDue, cleaning), note: 'Higienização pós-uso', reservationId })
  return out
}

/**
 * Realinha os blocos da reserva na devolução real (buffer comprimível): a locação termina na devolução
 * (nunca antes do início); a higienização passa a `[real+1, real+cleaning]`, cortada no início do próximo
 * bloco de outra reserva; sem espaço, é liberada (sai da lista); se não existia, é criada (id `{locação}-hig`).
 * Devolve a lista completa de blocos da peça, sem mutar a entrada.
 */
export function realignOnReturn(input: { blocks: GarmentBlock[]; reservationId: string; actualReturn: string; cleaningDays: number }): GarmentBlock[] {
  const { blocks, reservationId, actualReturn, cleaningDays } = input
  const mine = (b: GarmentBlock) => b.reservationId === reservationId
  const loc = blocks.find((b) => mine(b) && b.kind === 'locacao')
  if (!loc) return blocks
  const end = actualReturn > loc.from ? actualReturn : loc.from
  const cleanFrom = addDays(actualReturn, 1)
  let cleanTo = addDays(actualReturn, cleaningDays)
  const starts = blocks.filter((b) => !mine(b) && b.from >= cleanFrom && b.from <= cleanTo).map((b) => b.from)
  if (starts.length) cleanTo = addDays(starts.sort()[0]!, -1)
  const wantsClean = cleaningDays > 0 && cleanTo >= cleanFrom

  const out: GarmentBlock[] = []
  let hadClean = false
  for (const b of blocks) {
    if (b.id === loc.id) out.push({ ...b, to: end })
    else if (mine(b) && b.kind === 'higienizacao') {
      hadClean = true
      if (wantsClean) out.push({ ...b, from: cleanFrom, to: cleanTo })
    } else out.push(b)
  }
  if (wantsClean && !hadClean) out.push({ id: `${loc.id}-hig`, kind: 'higienizacao', from: cleanFrom, to: cleanTo, note: 'Higienização pós-uso', reservationId })
  return out
}

/** Reserva que contém a peça, com o estado do item dela. */
export type GarmentReservationLink = { reservationId: string; state: ReservationState; itemState: ItemState }

const STICKY: GarmentState[] = ['baixado', 'bloqueado', 'higienizacao', 'inspecao', 'ajuste', 'manutencao']

/**
 * Estado derivado da peça. Estados operacionais só saem por ação da Operação; o fato vence o plano
 * (peça na rua → `em_uso`/`aguardando_devolucao`); senão o plano de hoje. Blocos de reservas encerradas não contam.
 */
export function deriveGarmentState(input: { current: GarmentState; blocks: GarmentBlock[]; links: GarmentReservationLink[]; today: string }): GarmentState {
  const { current, blocks, links, today } = input
  if (STICKY.includes(current)) return current
  const out = links.find((l) => l.itemState === 'retirado' && ['retirada', 'em_uso', 'aguardando_devolucao'].includes(l.state))
  if (out) return out.state === 'aguardando_devolucao' ? 'aguardando_devolucao' : 'em_uso'

  const live = blocks.filter((b) => {
    const link = links.find((l) => l.reservationId === b.reservationId)
    return !(b.kind === 'locacao' && link && CLOSED_STATES.includes(link.state))
  })
  const covers = (b: GarmentBlock) => b.from <= today && b.to >= today
  // Peça já devolvida não fica presa pela locação; peça na rua já saiu acima (fato). O que sobra é plano: reservado.
  const back = (b: GarmentBlock) => {
    const item = links.find((l) => l.reservationId === b.reservationId)?.itemState
    return item === 'devolvido' || item === 'inspecionado'
  }
  if (live.some((b) => b.kind === 'locacao' && covers(b) && !back(b))) return 'reservado'
  if (live.some((b) => b.kind === 'higienizacao' && covers(b))) return 'higienizacao'
  if (live.some((b) => b.kind === 'locacao' && b.from > today)) return 'reservado'
  return 'disponivel'
}

/**
 * Alternativas livres: mesma categoria, não baixadas, diferentes da peça. Pontos: +4 mesma etiqueta, +3 mesmo
 * tamanho equivalente, +2 mesmo comprimento, +2 mesma cor, +1 se a diferença de preço é menor que R$ 150. Até 4.
 */
export function alternatives(target: Garment, candidates: Garment[], availabilityOf: (g: Garment) => boolean): { garment: Garment; score: number }[] {
  return candidates
    .filter((g) => g.id !== target.id && g.categorySlug === target.categorySlug && g.state !== 'baixado' && availabilityOf(g))
    .map((g) => ({
      garment: g,
      score:
        (g.labelSize === target.labelSize ? 4 : 0) +
        (g.sizeEquiv === target.sizeEquiv ? 3 : 0) +
        (g.length === target.length ? 2 : 0) +
        (g.colorPrimary === target.colorPrimary ? 2 : 0) +
        (Math.abs(g.rentalPrice - target.rentalPrice) < 150 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
}
