/**
 * Situação atual (offsets a partir de hoje = T): as 15 situações da spec reservas §8 traduzidas para o
 * modelo novo, mais uma retirada parcial (para existir o estado `retirada`), as reservas encerradas sem
 * locação (cancelada, no-show) e a operação da spec operacao-financeiro §1.7.
 * Clientes por índice do fixture (0 Mariana … 13 Aline; 14+ cauda longa), como no protótipo.
 */
import { lateFee } from '@/domain/money'
import { addDays } from '@/lib/format'
import type { Channel, ItemState, Reservation, ReservationState } from '../types'
import { finalizeRental } from './history'
import { at, byAdmin, makeReservation, USER, type PaySpec, type Rng, type ReservationSpec, type Step } from './kit'
import type { World } from './world'

type Cur = {
  c: number
  g: string[]
  state: ReservationState
  /** Retirada, evento e devolução (offsets). */
  d: [number, number | null, number]
  eventType: string
  venue?: string
  channel?: Channel
  discount?: number
  ago: number
  pay?: (net: number, D: (n: number) => string) => PaySpec[]
  items?: ItemState[]
  pickedAt?: [number, string]
  returnedAt?: [number, string]
  notes?: string
  alteration?: string
  returnNote?: string
  pickupNote?: string
  contract?: 'assinado' | 'gerado' | 'nenhum'
  cancelReason?: string
  by?: string
  auth?: (D: (n: number) => string) => ReservationSpec['authorizations']
}

/** Offset da baixa do Como (o histórico dele termina antes). */
export const COMO_BAIXA = -30

const paid = (kind: PaySpec['kind'], method: PaySpec['method'], amount: number, when: string): PaySpec => ({ kind, method, amount, paidAt: when })

export const CURRENT: Record<string, Cur> = {
  portofino: { c: 9, g: ['Portofino'], state: 'em_uso', d: [-5, -4, -2], eventType: 'Baile de gala', ago: 22, pickedAt: [-5, '10:00'], pay: (n, D) => [paid('integral', 'pix', n, at(D(-22), '15:20'))], notes: 'Cliente avisou que devolveria segunda-feira. Sem retorno desde então.' },
  ostuni: { c: 7, g: ['Ostuni'], state: 'em_uso', d: [-3, -2, 0], eventType: 'Casamento', ago: 26, pickedAt: [-3, '14:00'], pay: (_, D) => [paid('sinal', 'pix', 490, at(D(-26), '15:20')), paid('saldo', 'credito', 490, at(D(-3), '14:00'))] },
  firenze: { c: 4, g: ['Firenze'], state: 'pronta_retirada', d: [0, 1, 3], eventType: 'Formatura de Direito', ago: 31, pay: (_, D) => [paid('sinal', 'pix', 525, at(D(-31), '15:20')), paid('saldo', 'debito', 525, at(D(-1), '16:00'))], alteration: 'Barra ajustada para salto 8 cm — feita em 06/09.' },
  sorrento: {
    c: 2, g: ['Sorrento'], state: 'confirmada', d: [1, 2, 4], eventType: 'Casamento', ago: 38, pay: (_, D) => [paid('sinal', 'pix', 400, at(D(-38), '15:20'))], notes: 'Saldo combinado para o ato da retirada.',
    auth: (D) => [byAdmin('dispensa_sinal_minimo', 190, 'Cliente antiga; saldo combinado para o ato da retirada.', at(D(-38), '15:15'))],
  },
  bolonha: { c: 12, g: ['Bolonha'], state: 'rascunho', d: [9, 10, 12], eventType: 'Casamento civil', ago: 1, contract: 'gerado', notes: 'Cliente pediu 24h para confirmar com a mãe.' },
  capri: { c: 6, g: ['Capri'], state: 'rascunho', d: [16, 17, 19], eventType: 'Aniversário', ago: 0, contract: 'nenhum' },
  verona: { c: 0, g: ['Verona'], state: 'confirmada', d: [6, 7, 9], eventType: 'Casamento', ago: 21, pay: (n, D) => [paid('integral', 'link', n, at(D(-21), '20:10'))] },
  toscana: { c: 8, g: ['Toscana'], state: 'confirmada', d: [19, 20, 22], eventType: 'Premiação', ago: 12, pay: (_, D) => [paid('sinal', 'pix', 380, at(D(-12), '15:20'))] },
  amalfi: { c: 10, g: ['Amalfi'], state: 'confirmada', d: [31, 32, 34], eventType: 'Casamento', ago: 6, pay: (_, D) => [paid('sinal', 'transferencia', 390, at(D(-6), '15:20'))] },
  modena: { c: 1, g: ['Modena'], state: 'em_inspecao', d: [-4, -3, -1], eventType: 'Festa corporativa', ago: 20, pickedAt: [-4, '11:00'], returnedAt: [-1, '17:40'], pay: (n, D) => [paid('integral', 'credito', n, at(D(-20), '15:20'))] },
  lecce: { c: 6, g: ['Lecce'], state: 'confirmada', d: [2, 3, 5], eventType: 'Aniversário', ago: 15, pay: (n, D) => [paid('integral', 'pix', n, at(D(-15), '15:20'))], notes: 'Confirmada antes de a peça ir para a lavanderia.' },
  parma: { c: 3, g: ['Parma'], state: 'confirmada', d: [3, 4, 6], eventType: 'Casamento civil', ago: 24, pay: (_, D) => [paid('sinal', 'credito', 325, at(D(-24), '15:20'))], notes: 'Reserva feita antes de o zíper romper na devolução anterior.' },
  multi: {
    c: 3, g: ['Positano', 'Carrara'], state: 'confirmada', d: [12, 14, 16], eventType: 'Formatura de Medicina', venue: 'Clube Ipê · Palmas', channel: 'loja', discount: 180, ago: 9, by: USER.julia.id,
    pay: (_, D) => [paid('sinal', 'pix', 400, at(D(-9), '15:20'))], notes: 'Pacote vestido + clutch com desconto de conjunto negociado pela gerente.',
    auth: (D) => [byAdmin('desconto_acima_limite', 180, 'Pacote vestido + clutch para formanda indicada por cliente VIP.', at(D(-9), '15:05'))],
  },
  parcial: {
    c: 11, g: ['Ravello', 'Umbria'], state: 'aguardando_devolucao', d: [-5, -3, -1], eventType: 'Aniversário de 15 anos', venue: 'Salão Vila Real · Gurupi', channel: 'whatsapp', ago: 18, by: USER.bruna.id,
    items: ['devolvido', 'retirado'], pickedAt: [-5, '15:00'], returnedAt: [-1, '18:20'], returnNote: 'Vestido recebido em bom estado.',
    pay: (n, D) => [paid('integral', 'pix', n, at(D(-5), '14:50'))], notes: 'Cliente avisou que traz a clutch na quinta — esqueceu em casa.',
  },
  milano: {
    c: 13, g: ['Milano'], state: 'em_uso', d: [-1, 0, 2], eventType: 'Festa corporativa', venue: 'Hotel Serrano · Araguaína', channel: 'loja', ago: 11, by: USER.ana.id,
    pickedAt: [-1, '17:10'], pickupNote: 'Entregue com capa protetora.', pay: (n, D) => [paid('sinal', 'pix', Math.round(n / 2), at(D(-11), '15:20'))],
    notes: 'Cliente pagou metade; combinou o restante por PIX até as 18h de hoje.',
    auth: (D) => [byAdmin('retirada_com_saldo', 270, 'Pagamento combinado para as 18h de hoje; cliente recorrente com histórico limpo.', at(D(-1), '17:05'))],
  },
  retiradaParcial: {
    c: 14, g: ['Urbino', 'Pisa'], state: 'retirada', d: [-1, 1, 2], eventType: 'Festa corporativa', channel: 'instagram', ago: 10, items: ['retirado', 'pendente'], pickedAt: [-1, '16:30'],
    pay: (n, D) => [paid('sinal', 'pix', Math.round(n / 2), at(D(-10), '15:20')), paid('saldo', 'pix', n - Math.round(n / 2), at(D(-1), '16:20'))], notes: 'Levou o macacão; volta amanhã para buscar o conjunto da irmã.',
  },
  cancelada: { c: 6, g: ['Lecce'], state: 'cancelada', d: [-36, -34, -33], eventType: 'Aniversário', channel: 'whatsapp', ago: 50, pay: (n, D) => [paid('sinal', 'pix', Math.round(n / 2), at(D(-50), '15:20'))], cancelReason: 'Cliente adiou a festa' },
  noshow: { c: 11, g: ['Bari'], state: 'no_show', d: [-21, -19, -18], eventType: 'Festa corporativa', channel: 'instagram', ago: 30, pay: (n, D) => [paid('sinal', 'pix', Math.round(n / 2), at(D(-30), '15:20'))], cancelReason: 'Não compareceu para a retirada' },
}

const OUT: ReservationState[] = ['retirada', 'em_uso', 'aguardando_devolucao', 'em_inspecao']
const ITEM_BY_STATE: Partial<Record<ReservationState, ItemState>> = { retirada: 'retirado', em_uso: 'retirado', aguardando_devolucao: 'retirado', em_inspecao: 'devolvido' }

/** Reservas da situação atual. Devolve-as por chave (`CURRENT`). */
export function buildCurrent(w: World, rng: Rng): Record<string, Reservation> {
  const D = (n: number) => addDays(w.today, n)
  const byName = (n: string) => w.garments.find((g) => g.name.endsWith(` ${n}`))!
  const out: Record<string, Reservation> = {}
  for (const [key, o] of Object.entries(CURRENT)) {
    const garments = o.g.map(byName)
    const net = garments.reduce((s, g) => s + g.rentalPrice, 0) - (o.discount ?? 0)
    const customer = w.customers[o.c]!
    const by = o.by ?? rng.pick([USER.ana.id, USER.bruna.id])
    const created = D(-o.ago)
    const picked = o.pickedAt ? at(D(o.pickedAt[0]), o.pickedAt[1]) : null
    const returned = o.returnedAt ? at(D(o.returnedAt[0]), o.returnedAt[1]) : null
    const states = o.items ?? garments.map(() => ITEM_BY_STATE[o.state] ?? 'pendente')
    const steps: Step[] = []
    const waived = key === 'sorrento' ? ` — sinal abaixo do mínimo, exceção autorizada por ${USER.julia.name}` : ''
    if (o.state !== 'rascunho') steps.push({ to: 'confirmada', at: at(created, '15:20'), reason: `Contrato assinado e sinal recebido${waived}` })
    if (o.state === 'pronta_retirada') steps.push({ to: 'pronta_retirada', at: at(D(o.d[0] - 1), '17:00'), reason: 'Peça pronta para retirada' })
    if (OUT.includes(o.state) && picked) {
      const n = states.filter((s) => s !== 'pendente').length
      const all = n === states.length
      const reason = key === 'milano' ? `Exceção autorizada: retirada com saldo (${USER.julia.name})` : all ? 'Todas as peças retiradas pela cliente' : `Retirada parcial — ${n} de ${states.length} peça(s)`
      steps.push({ to: all ? 'em_uso' : 'retirada', at: picked, reason })
    }
    if (o.state === 'aguardando_devolucao') steps.push({ to: 'aguardando_devolucao', at: returned!, reason: 'Devolução parcial — 1 peça(s) recebida(s), 1 pendente(s)' })
    if (o.state === 'em_inspecao') steps.push({ to: 'em_inspecao', at: returned!, reason: 'Devolvida no prazo' })
    if (o.state === 'cancelada' || o.state === 'no_show') steps.push({ to: o.state, at: at(D(o.state === 'cancelada' ? o.d[0] - 4 : o.d[0] + 1), '11:00'), reason: o.cancelReason! })

    const payments = o.pay?.(net, D) ?? []
    let fee = 0
    if (o.state === 'aguardando_devolucao') {
      fee = lateFee(net, w.settings.lateFeeDailyPercent, 1)
      payments.push({ kind: 'multa', method: 'pix', amount: fee, paidAt: null, state: 'pendente', dueAt: w.today, notes: '1 dia(s) de atraso · 1 peça(s) ainda na rua' })
    }
    const contract = o.contract ?? 'assinado'
    out[key] = makeReservation(w, {
      customerId: customer.id,
      state: o.state,
      pickup: D(o.d[0]),
      event: o.d[1] == null ? null : D(o.d[1]),
      ret: D(o.d[2]),
      eventType: o.eventType,
      venue: o.venue ?? rng.pick(['Espaço Jardins · Palmas', 'Clube Ipê · Palmas', 'Casa de Festas Bela Vista', 'Resort Lago Norte · Palmas']),
      channel: o.channel ?? rng.pick(['loja', 'whatsapp', 'instagram'] as const),
      discount: o.discount ?? 0,
      createdAt: at(created, '15:00'),
      createdBy: by,
      items: garments.map((g, k) => ({
        garment: g,
        state: states[k]!,
        pickedUpAt: states[k] !== 'pendente' ? picked : null,
        returnedAt: states[k] === 'devolvido' ? returned : null,
        returnNote: states[k] === 'devolvido' ? (o.returnNote ?? null) : null,
        pickupNote: states[k] === 'retirado' ? (o.pickupNote ?? null) : null,
        alteration: o.alteration ?? null,
      })),
      payments,
      steps,
      contractSignedAt: contract === 'nenhum' ? null : contract === 'gerado' ? '' : at(created, '15:10'),
      signerName: customer.fullName,
      notes: o.notes ?? null,
      cancelReason: o.cancelReason ?? null,
      pickedUpAt: picked,
      returnedAt: o.state === 'em_inspecao' ? returned : null,
      lateFee: fee,
      authorizations: o.auth?.(D) ?? [],
    })
    for (const [k, g] of garments.entries()) if (states[k] === 'devolvido') g.state = 'inspecao'
  }
  return out
}

/**
 * Operação de hoje: as últimas locações de Trastevere, Lecce e Parma (devolvidas há 2, 3 e 10 dias),
 * ordens abertas, blocos operacionais, bloqueios manuais e a peça baixada (Como, há `COMO_BAIXA` dias).
 */
export function buildOperation(w: World, rng: Rng): void {
  const D = (n: number) => addDays(w.today, n)
  const byName = (n: string) => w.garments.find((g) => g.name.endsWith(` ${n}`))!
  const order = (o: Omit<World['maintenances'][number], 'id' | 'closedAt' | 'cost' | 'createdBy'>) => {
    const id = `mnt-${String(w.maintenances.length + 1).padStart(4, '0')}`
    w.maintenances.push({ ...o, id, closedAt: null, cost: 0, createdBy: USER.bruna.id })
    return id
  }
  const tail = (name: string, customer: number, ret: number, inspection?: Parameters<typeof finalizeRental>[2]['inspection']) => {
    const r = finalizeRental(w, rng, { garment: byName(name), customerId: w.customers[customer]!.id, pickup: D(ret - 3), event: D(ret - 1), ret: D(ret), discountPct: 0, inspection, openAfter: true })
    return { r, insp: w.inspections.at(-1)! }
  }

  for (const [name, cust, ret, since, until] of [
    ['Trastevere', 17, -2, -1, 1],
    ['Lecce', 18, -3, -2, 2],
  ] as const) {
    const { r, insp } = tail(name, cust, ret)
    const g = byName(name)
    const m = order({ garmentId: g.id, inspectionId: insp.id, reservationId: r.id, kind: 'higienizacao', state: 'em_andamento', openedAt: at(D(since), '09:30'), dueAt: D(until), description: 'Higienização pós-locação', provider: 'Lavanderia Branca Neve', blocksGarment: true })
    g.blocks.push({ id: `${m}-b`, kind: 'higienizacao', from: D(since), to: D(until), note: 'Higienização', maintenanceId: m })
    g.state = 'higienizacao'
  }

  const parma = byName('Parma')
  const pt = tail('Parma', 19, -10, {
    result: 'reprovada',
    findings: [{ label: 'Zíper e fechos', ok: false, severity: 'grave', note: 'Zíper invisível rompido na altura do quadril.' }],
    notes: 'Ressalvas registradas na inspeção.',
  })
  const mz = order({ garmentId: parma.id, inspectionId: pt.insp.id, reservationId: pt.r.id, kind: 'ziper', state: 'em_andamento', openedAt: at(D(-9), '10:00'), dueAt: D(2), description: 'Zíper invisível rompido na altura do quadril. Substituição completa.', provider: 'Ateliê Dona Neuza', blocksGarment: true })
  parma.blocks.push({ id: `${mz}-b`, kind: 'manutencao', from: D(-9), to: D(3), note: 'Troca de zíper', maintenanceId: mz })
  parma.state = 'manutencao'

  const assis = byName('Assis')
  const ma = order({ garmentId: assis.id, inspectionId: null, reservationId: null, kind: 'ajuste', state: 'aberta', openedAt: at(D(-2), '11:00'), dueAt: D(1), description: 'Pences laterais para a prova de quinta.', provider: 'Ateliê próprio', blocksGarment: true })
  assis.blocks.push({ id: `${ma}-b`, kind: 'ajuste', from: D(-2), to: D(1), note: 'Ajuste de pences', maintenanceId: ma })
  assis.state = 'ajuste'
  assis.history.push({ at: at(D(-2), '11:00'), from: null, to: 'ajuste', reason: 'Enviada para ajuste', userName: USER.bruna.name })

  const genova = byName('Gênova')
  genova.blocks.push({ id: 'blq-genova', kind: 'editorial', from: D(-1), to: D(4), note: 'Ensaio fotográfico da coleção — fotógrafa Marina Dias' })
  genova.state = 'bloqueado'
  genova.history.push({ at: at(D(-1), '09:00'), from: null, to: 'bloqueado', reason: 'Reservada para ensaio editorial', userName: USER.julia.name })

  byName('Verona').blocks.push({ id: 'blq-verona', kind: 'bloqueio_manual', from: D(30), to: D(32), note: 'Separada para prova de noiva' })
  byName('Bolonha').blocks.push({ id: 'blq-bolonha', kind: 'bloqueio_manual', from: D(12), to: D(14), note: 'Separada para desfile beneficente' })
  byName('Firenze').blocks.push({ id: 'blq-firenze', kind: 'editorial', from: D(20), to: D(21), note: 'Ensaio de fotos da coleção' })

  const como = byName('Como')
  como.state = 'baixado'
  como.history.push({ at: at(D(COMO_BAIXA), '16:00'), from: null, to: 'baixado', reason: 'Mancha permanente no crepe — baixada do acervo', userName: USER.julia.name })
}
