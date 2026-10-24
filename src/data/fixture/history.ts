/**
 * Histórico fictício: ~7 meses de locações `finalizada`, uma peça por reserva, sem sobreposição por peça
 * (spec reservas §8, operação §1.7, dashboard §6). Popularidade do protótipo: peças `3` alugam a cada
 * 11–26 dias, `2` a cada 24–52, `1` a cada 58–96; Turim, Nápoles e Rimini (`0`) nunca.
 * Cada locação: sinal 50% + saldo na retirada, contrato assinado, inspeção (86% aprovada / 14% ressalva),
 * higienização paga (R$ 38–86) e, com ressalva, reparo (R$ 25–115).
 */
import { effectiveCleaningDays } from '@/domain/calendar'
import { addDays } from '@/lib/format'
import type { Garment, InspectionFinding, InspectionResult, MaintenanceKind, PaymentMethod, Reservation } from '../types'
import { addOperationExpense, FIN_CAT } from './finance'
import { acquiredDaysAgo } from './garments'
import { at, EVENTOS, LOCAIS, makeReservation, USER, type Rng } from './kit'
import type { World } from './world'

export const POP: Record<string, 0 | 1 | 2 | 3> = {
  Verona: 3, Amalfi: 3, Sorrento: 3, Capri: 2, Positano: 2, Portofino: 3, Ravello: 2, Toscana: 2, Siena: 3, Bolonha: 3,
  Milano: 1, Firenze: 3, Trastevere: 2, Modena: 2, Parma: 1, Ostuni: 3, Lecce: 2, Bari: 2, Assis: 2, Gênova: 1,
  Urbino: 2, Como: 1, Pisa: 1, Turim: 0, Nápoles: 0, Rimini: 0, Carrara: 2, Umbria: 1,
}
const GAPS: Record<1 | 2 | 3, [number, number]> = { 3: [11, 26], 2: [24, 52], 1: [58, 96] }
const METHODS: PaymentMethod[] = ['pix', 'pix', 'credito', 'debito', 'dinheiro', 'link']
const FINDINGS: [label: string, kind: MaintenanceKind][] = [
  ['Barra', 'barra'],
  ['Zíper e fechos', 'ziper'],
  ['Costuras', 'costura'],
  ['Manchas', 'mancha'],
]

export type RentalOpts = {
  garment: Garment
  customerId: string
  pickup: string
  event: string
  ret: string
  discountPct: number
  /** Inspeção forçada (cenário). Sem ela: sorteio 86% aprovada / 14% ressalva. */
  inspection?: { result: InspectionResult; findings: InspectionFinding[]; notes: string }
  /** `true`: a ordem pós-inspeção ainda está aberta (cenário da Operação) — nada de higienização concluída aqui. */
  openAfter?: boolean
}

/** Uma locação finalizada completa: reserva, pagamentos, contrato, inspeção, ordens e despesas. */
export function finalizeRental(w: World, rng: Rng, o: RentalOpts): Reservation {
  const g = o.garment
  const cleaning = effectiveCleaningDays(g, w.categories, w.settings)
  const created = addDays(o.pickup, -rng.int(7, 40))
  const net = g.rentalPrice - Math.round(g.rentalPrice * o.discountPct)
  const sinal = Math.round(net * 0.5)
  const method = rng.pick(METHODS)
  const by = rng.pick([USER.ana.id, USER.bruna.id, USER.julia.id])
  const customer = w.customers.find((c) => c.id === o.customerId)!
  const inspDay = addDays(o.ret, 1)
  const r = makeReservation(w, {
    customerId: o.customerId,
    state: 'finalizada',
    pickup: o.pickup,
    event: o.event,
    ret: o.ret,
    eventType: rng.pick(EVENTOS),
    venue: rng.pick(LOCAIS),
    channel: rng.pick(['loja', 'whatsapp', 'instagram'] as const),
    discount: g.rentalPrice - net,
    createdAt: at(created, '15:00'),
    createdBy: by,
    items: [{ garment: g, state: 'inspecionado', pickedUpAt: at(o.pickup, '10:30'), returnedAt: at(o.ret, '11:15') }],
    payments: [
      { kind: 'sinal', method, amount: sinal, paidAt: at(created, '15:20') },
      { kind: 'saldo', method, amount: net - sinal, paidAt: at(o.pickup, '10:30') },
    ],
    steps: [
      { to: 'confirmada', at: at(created, '15:20'), reason: 'Contrato assinado e sinal recebido' },
      { to: 'em_uso', at: at(o.pickup, '10:30'), reason: 'Todas as peças retiradas pela cliente' },
      { to: 'em_inspecao', at: at(o.ret, '11:15'), reason: 'Devolvida no prazo' },
      { to: 'finalizada', at: at(inspDay, '09:00'), reason: 'Todas as peças inspecionadas', by: USER.bruna.id },
    ],
    contractSignedAt: at(created, '15:10'),
    signerName: customer.fullName,
    pickedUpAt: at(o.pickup, '10:30'),
    returnedAt: at(o.ret, '11:15'),
  })

  const danoso = !o.inspection && rng.next() < 0.14
  const finding = danoso ? rng.pick(FINDINGS) : null
  const insp = o.inspection ?? {
    result: danoso ? 'ressalva' : 'aprovada',
    findings: finding ? [{ label: finding[0], ok: false as const, severity: 'leve' as const, note: 'Reparo simples realizado no ateliê.' }] : [],
    notes: danoso ? 'Pequeno reparo antes de liberar.' : 'Peça devolvida em boas condições.',
  }
  const inspectionId = `insp-${String(w.inspections.length + 1).padStart(4, '0')}`
  w.inspections.push({
    id: inspectionId,
    garmentId: g.id,
    reservationId: r.id,
    inspectedAt: at(inspDay, '09:00'),
    inspectorId: USER.bruna.id,
    inspectorName: USER.bruna.name,
    result: insp.result,
    findings: insp.findings,
    notes: insp.notes,
    photos: [],
  })
  if (o.openAfter) return r

  const hig = 38 + rng.int(0, 6) * 8
  const mHig = `mnt-${String(w.maintenances.length + 1).padStart(4, '0')}`
  w.maintenances.push({
    id: mHig,
    garmentId: g.id,
    inspectionId,
    reservationId: r.id,
    kind: 'higienizacao',
    state: 'concluida',
    openedAt: at(inspDay, '09:10'),
    dueAt: addDays(o.ret, Math.max(1, cleaning)),
    closedAt: at(addDays(o.ret, Math.max(1, cleaning)), '17:00'),
    description: 'Higienização pós-locação',
    provider: 'Lavanderia Branca Neve',
    cost: hig,
    blocksGarment: true,
    createdBy: USER.bruna.id,
  })
  addOperationExpense(w, { date: inspDay, categoryId: FIN_CAT.higienizacao, amount: hig, supplier: 'Lavanderia Branca Neve', description: 'Higienização pós-locação', garmentId: g.id, maintenanceId: mHig, reservationId: r.id })

  if (finding) {
    const cost = 25 + rng.int(0, 9) * 10
    const mRep = `mnt-${String(w.maintenances.length + 1).padStart(4, '0')}`
    const day = addDays(o.ret, 2)
    w.maintenances.push({
      id: mRep,
      garmentId: g.id,
      inspectionId,
      reservationId: r.id,
      kind: finding[1],
      state: 'concluida',
      openedAt: at(inspDay, '09:15'),
      dueAt: day,
      closedAt: at(day, '16:00'),
      description: 'Reparo identificado na inspeção',
      provider: 'Ateliê Dona Neuza',
      cost,
      blocksGarment: false,
      createdBy: USER.bruna.id,
    })
    addOperationExpense(w, { date: day, categoryId: FIN_CAT.manutencao, amount: cost, supplier: 'Ateliê Dona Neuza', description: 'Reparo identificado na inspeção', garmentId: g.id, maintenanceId: mRep, reservationId: r.id })
  }
  return r
}

/** Intervalo (offsets a partir de hoje, inclusivos) em que a peça já está ocupada pelo cenário. */
export type Busy = { from: number; to: number }

/**
 * Sete meses de locações por peça, terminando até 9 dias atrás e desviando dos intervalos `busy`
 * (cenário atual, reservas encerradas sem locação, baixa). Clientes: as 14 de relacionamento pesam 5×.
 */
export function buildHistory(w: World, rng: Rng, busy: Map<string, Busy[]>): void {
  const bag: string[] = []
  w.customers.forEach((c, i) => {
    for (let k = 0; k < (i < 14 ? 5 : 1); k++) bag.push(c.id)
  })
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j]!, bag[i]!]
  }
  let bagI = 0
  const D = (n: number) => addDays(w.today, n)

  w.garments.forEach((g, idx) => {
    const pop = POP[g.name.split(' ').at(-1)!] ?? 0
    if (!pop) return
    const [lo, hi] = GAPS[pop]
    const buf = effectiveCleaningDays(g, w.categories, w.settings)
    const windows = busy.get(g.id) ?? []
    let cursor = Math.max(-212 + rng.int(0, 18), -acquiredDaysAgo(idx) + 1)
    for (let guard = 0; guard < 40; guard++) {
      const pickup = cursor + rng.int(lo, hi)
      const event = pickup + rng.int(0, 1)
      const ret = event + 1
      if (ret + buf > -9) break
      const clash = windows.find((b) => pickup <= b.to && b.from <= ret + buf)
      if (clash) {
        cursor = clash.to + 1
        continue
      }
      finalizeRental(w, rng, { garment: g, customerId: bag[bagI++ % bag.length]!, pickup: D(pickup), event: D(event), ret: D(ret), discountPct: rng.pick([0, 0, 0, 0, 0.05, 0.1]) })
      cursor = ret + buf + 1
    }
  })
}
