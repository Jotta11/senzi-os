/**
 * Provas e compromissos fictícios (spec agenda-provas §7): convertida do Verona, perdida por orçamento,
 * prova em curso hoje, agendada, o Milano que "encanta e não fecha", conversões normais, uma `concluida`
 * e uma `no_show`. Compromissos: os automáticos das reservas e os manuais (atendimento, serviço, internos).
 */
import { addDays } from '@/lib/format'
import { addAppointment, addReservationAppointments } from '../mock/appointments'
import type { AppointmentState, FitOutcome, FittingSession, FittingState, Garment, Reservation } from '../types'
import { at, EVENTOS, USER, type Rng } from './kit'
import type { World } from './world'

type Piece = [name: string, outcome: FitOutcome, note: string | null, alteration?: boolean]
type FitSpec = {
  customer: string
  when: string
  state: FittingState
  pieces: (Piece | [Garment, FitOutcome, string | null, boolean?])[]
  eventType?: string | null
  eventDate?: string | null
  budget?: number | null
  notes?: string | null
  outcome?: string | null
  reservation?: Reservation | null
  attendant: string
}

function addFitting(w: World, s: FitSpec): FittingSession {
  const id = `fit-${String(w.fittings.length + 1).padStart(4, '0')}`
  const closed = s.state === 'convertida' || s.state === 'perdida' || s.state === 'no_show' || s.state === 'concluida'
  const f: FittingSession = {
    id,
    code: '',
    customerId: s.customer,
    state: s.state,
    scheduledAt: s.when,
    startedAt: s.state === 'agendada' || s.state === 'no_show' ? null : s.when,
    endedAt: closed && s.state !== 'no_show' ? s.when.replace(/T(\d\d)/, (_, h: string) => `T${String(Number(h) + 1).padStart(2, '0')}`) : null,
    attendantId: s.attendant,
    eventType: s.eventType ?? null,
    eventDate: s.eventDate ?? null,
    budget: s.budget ?? null,
    notes: s.notes ?? null,
    outcomeNotes: s.outcome ?? null,
    reservationId: s.reservation?.id ?? null,
    createdBy: s.attendant,
  }
  w.fittings.push(f)
  if (s.reservation) s.reservation.fittingId = id
  const byName = (n: string) => w.garments.find((g) => g.name.endsWith(` ${n}`))!
  s.pieces.forEach(([p, outcome, note, alteration], position) => {
    const g = typeof p === 'string' ? byName(p) : p
    w.fittingItems.push({
      fittingSessionId: id,
      garmentId: g.id,
      position,
      outcome,
      needsAlteration: !!alteration,
      note,
      recordedBy: outcome === 'nao_provou' ? null : s.attendant,
      recordedAt: outcome === 'nao_provou' ? null : s.when,
    })
    const c = w.customers.find((x) => x.id === s.customer)!
    if (outcome === 'favorita' && !c.favorites.some((x) => x.garmentId === g.id)) c.favorites.push({ garmentId: g.id, source: 'prova', note, at: s.when })
  })
  const appt: AppointmentState = s.state === 'agendada' || s.state === 'em_curso' ? 'agendado' : s.state === 'no_show' ? 'no_show' : 'concluido'
  addAppointment(w, { kind: 'prova', startsAt: s.when, title: 'Prova', notes: s.notes ?? null, state: appt, customerId: s.customer, fittingId: id, assignedTo: s.attendant })
  return f
}

/** Locação finalizada da peça/cliente mais próxima depois de `from` (ainda sem prova vinculada). */
function rentalAfter(w: World, from: string, f: (r: Reservation) => boolean): Reservation | null {
  return (
    w.reservations
      .filter((r) => r.state === 'finalizada' && !r.fittingId && r.pickupDate > from && f(r))
      .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))[0] ?? null
  )
}

export function buildFittings(w: World, rng: Rng, refs: Record<string, Reservation>): void {
  const D = (n: number) => addDays(w.today, n)
  const cu = (i: number) => w.customers[i]!.id
  const byName = (n: string) => w.garments.find((g) => g.name.endsWith(` ${n}`))!
  const attendant = () => rng.pick([USER.ana.id, USER.bruna.id])

  addFitting(w, {
    customer: cu(0), when: at(D(-21), '19:30'), state: 'convertida', reservation: refs.verona, attendant: USER.ana.id,
    eventType: 'Casamento', eventDate: D(7), budget: 1000, notes: 'Trouxe o sapato do evento.', outcome: 'Fechou o Verona na hora.',
    pieces: [
      ['Verona', 'favorita', 'Amou o comprimento e a fenda. Disse que era exatamente o que imaginava.'],
      ['Amalfi', 'nao_gostou', 'Achou a manga pesada para novembro.'],
      ['Modena', 'apertada', 'Marcou no quadril; não quis ajuste.'],
    ],
  })
  addFitting(w, {
    customer: cu(9), when: at(D(-12), '18:00'), state: 'perdida', attendant: USER.bruna.id, eventType: 'Premiação', eventDate: D(4), budget: 700,
    outcome: 'Ficou de voltar depois do 13º. Peça favorita R$ 1.250, acima do orçamento de R$ 700.',
    pieces: [
      ['Portofino', 'favorita', 'Apaixonou-se, mas disse que passava do orçamento.'],
      ['Bolonha', 'gostou', 'Gostou, achou parecido demais com um que já usou.'],
      ['Milano', 'larga', 'Ficou larga no busto; precisaria de ajuste grande.', true],
    ],
  })
  addFitting(w, {
    customer: cu(5), when: at(w.today, '09:00'), state: 'em_curso', attendant: USER.ana.id, eventType: 'Jantar de noivado', eventDate: D(25), budget: 650,
    notes: 'Quer ver midi e curto, tons sóbrios. Executiva, prefere fora do horário comercial.',
    pieces: [
      ['Siena', 'serviu', 'Serviu bem; achou o vermelho forte para o ambiente.'],
      ['Milano', 'nao_provou', null],
      ['Bari', 'nao_provou', null],
    ],
  })
  addFitting(w, {
    customer: cu(12), when: at(D(2), '15:00'), state: 'agendada', attendant: USER.bruna.id, eventType: 'Casamento civil', eventDate: D(10), budget: 950,
    pieces: [
      ['Bolonha', 'nao_provou', null],
      ['Firenze', 'nao_provou', null],
    ],
  })

  // Milano: muita prova, nenhuma conversão dele — quando a prova converte, a cliente leva outra peça.
  const milano = byName('Milano')
  const MILANO: [number, FitOutcome, string, boolean][] = [
    [2, 'larga', 'Ficou larga no busto.', true],
    [5, 'nao_gostou', 'Gola alta incomodou.', true],
    [7, 'apertada', 'Alfaiataria não cedeu na cintura.', true],
    [8, 'gostou', 'Gostou do modelo, mas levou o outro que provou junto.', true],
    [10, 'descartada', 'Achou séria demais para festa.', false],
    [1, 'precisa_ajuste', 'Precisaria de ajuste grande na cintura — não compensava.', false],
  ]
  MILANO.forEach(([ci, outcome, note, converts], i) => {
    const when = D(-100 + i * 13)
    const alvo = converts ? rentalAfter(w, when, (r) => r.customerId === cu(ci) && r.items[0]!.garmentId !== milano.id) : null
    const levada = alvo ? w.garments.find((g) => g.id === alvo.items[0]!.garmentId)! : null
    addFitting(w, {
      customer: cu(ci), when: at(when, '16:00'), state: alvo ? 'convertida' : 'perdida', reservation: alvo, attendant: attendant(),
      eventType: alvo?.eventType ?? rng.pick(EVENTOS), eventDate: alvo?.eventDate ?? null,
      outcome: levada ? `Levou ${levada.name}; o Milano ficou.` : note,
      pieces: [[milano, outcome, note, outcome === 'precisa_ajuste'], ...(levada ? [[levada, 'favorita', 'Provou junto e levou esta.', false] as [Garment, FitOutcome, string, boolean]] : [])],
    })
  })

  // Conversões normais: a locação da peça logo depois da prova passa a ser da cliente da prova.
  for (const [ci, name, off] of [[0, 'Firenze', -60], [4, 'Lecce', -47], [8, 'Toscana', -33], [2, 'Sorrento', -25], [7, 'Ostuni', -17]] as const) {
    const g = byName(name)
    let when = D(off)
    let alvo = rentalAfter(w, when, (r) => r.items[0]!.garmentId === g.id)
    if (!alvo) {
      alvo = w.reservations.filter((r) => r.state === 'finalizada' && !r.fittingId && r.items[0]!.garmentId === g.id).sort((a, b) => b.pickupDate.localeCompare(a.pickupDate))[0] ?? null
      if (!alvo) continue
      when = addDays(alvo.pickupDate, -5)
    }
    alvo.customerId = cu(ci)
    alvo.contract!.signerName = w.customers[ci]!.fullName
    addFitting(w, {
      customer: cu(ci), when: at(when, '18:30'), state: 'convertida', reservation: alvo, attendant: attendant(),
      eventType: alvo.eventType, eventDate: alvo.eventDate, budget: Math.round((g.rentalPrice * 1.2) / 50) * 50,
      outcome: 'Saiu daqui com a reserva feita.', pieces: [[g, 'favorita', 'Fechou na prova.']],
    })
  }

  addFitting(w, {
    customer: cu(13), when: at(D(-6), '17:00'), state: 'concluida', attendant: USER.ana.id, eventType: 'Formatura', eventDate: D(40), budget: 900,
    outcome: 'Encerrada sem decisão — vai pensar com a família.',
    pieces: [
      ['Bolonha', 'gostou', 'Ficou ótima, mas quer manga longa.'],
      ['Ostuni', 'gostou', 'Gostou do cetim; achou o decote nas costas ousado.'],
    ],
  })
  addFitting(w, {
    customer: cu(16), when: at(D(-4), '18:00'), state: 'no_show', attendant: USER.bruna.id, eventType: 'Formatura', eventDate: D(20), budget: 800,
    pieces: [
      ['Sorrento', 'nao_provou', null],
      ['Positano', 'nao_provou', null],
    ],
  })
}

/** Horários dos compromissos automáticos que a spec fixa (por chave do cenário); o resto usa 10:00 / 11:00 / 19:00. */
const TIMES: Record<string, Partial<Record<'retirada' | 'devolucao', string>>> = {
  firenze: { retirada: '10:30', devolucao: '10:00' },
  ostuni: { retirada: '14:00', devolucao: '14:00' },
  sorrento: { retirada: '11:00' },
  parma: { retirada: '14:00' },
  verona: { retirada: '09:30' },
  portofino: { retirada: '10:00' },
  modena: { retirada: '11:00', devolucao: '17:40' },
  milano: { retirada: '17:10' },
}

/** Compromissos das reservas (criados na confirmação) e os manuais. */
export function buildAppointments(w: World, refs: Record<string, Reservation>): void {
  const D = (n: number) => addDays(w.today, n)
  const keyOf = new Map(Object.entries(refs).map(([k, r]) => [r.id, k]))
  const windowStart = D(-20)
  let turn = 0
  for (const r of w.reservations) {
    if (r.state === 'rascunho' || r.returnDueDate < windowStart) continue
    const key = keyOf.get(r.id) ?? ''
    const out = r.items.filter((i) => i.itemState !== 'pendente' && i.itemState !== 'cancelado').length
    const allOut = out === r.items.length
    const back = r.state === 'devolvida' || r.state === 'em_inspecao' || r.state === 'finalizada'
    const closed = r.state === 'cancelada' || r.state === 'no_show'
    const st = (done: boolean): AppointmentState => (closed ? 'cancelado' : done ? 'concluido' : 'agendado')
    addReservationAppointments(w, r, {
      assignedTo: turn++ % 2 ? USER.bruna.id : USER.ana.id,
      createdBy: r.createdBy,
      times: TIMES[key],
      state: (kind) =>
        kind === 'retirada'
          ? r.state === 'no_show'
            ? 'no_show'
            : st(allOut)
          : kind === 'evento'
            ? closed
              ? 'cancelado'
              : r.eventDate! < w.today
                ? 'concluido'
                : 'agendado'
            : st(back),
    })
  }

  const juliana = w.customers[3]!.id
  addAppointment(w, { kind: 'atendimento', startsAt: at(w.today, '16:00'), title: 'Atendimento — primeira visita', state: 'agendado', customerId: juliana, assignedTo: USER.bruna.id, notes: 'Formatura da filha em dezembro. Ver midi e longo tamanho G.' })
  addAppointment(w, { kind: 'servico', startsAt: at(w.today, '17:30'), title: 'Coleta da lavanderia', state: 'agendado', assignedTo: USER.bruna.id, notes: '2 peças em higienização' })
  addAppointment(w, { kind: 'servico', startsAt: at(D(3), '09:00'), title: 'Entrega do ateliê', state: 'agendado', assignedTo: USER.bruna.id, notes: 'Parma volta da troca de zíper.' })
  for (const [n, time, text, state] of [
    [-3, '08:30', 'Inventário das clutches', 'concluido'],
    [1, '08:30', 'Reunião de equipe', 'agendado'],
    [4, '14:00', 'Fotos do acervo novo', 'agendado'],
  ] as const) {
    addAppointment(w, { kind: 'interno', startsAt: at(D(n), time), title: text, notes: text, state, assignedTo: USER.julia.id })
  }
}
