/**
 * Alertas do Dashboard (spec `dashboard-inteligencia.md` §3.1): 12 tipos derivados ao vivo do mundo + "hoje".
 * Função pura; a ordem final é por severidade (crítico, atenção, info), estável (ordem de geração: reservas,
 * peças, manutenções, clientes, riscos, provas). Filtros por permissão ficam na tela.
 */
import type { World } from '@/data/fixture'
import { ACTIVE_RESERVATION_STATES, CLOSED_RESERVATION_STATES, GARMENT_STATE, MAINTENANCE_KIND } from '@/data/labels'
import type { Alert, AlertSeverity, Garment, Reservation } from '@/data/types'
import { brl, dateBR } from '@/lib/format'
import { diffDays, nextBirthday, relativeDay } from './dates'
import { balance } from './money'

type AlertWorld = Pick<World, 'reservations' | 'customers' | 'garments' | 'maintenances' | 'fittings' | 'fittingItems'>

const OUT_STATES = ['retirada', 'em_uso', 'aguardando_devolucao']
const PICKUP_STATES = ['confirmada', 'pronta_retirada']
const RISK_STATES = ['inspecao', 'higienizacao', 'ajuste', 'manutencao', 'bloqueado']
const SEV_ORDER: Record<AlertSeverity, number> = { critico: 0, atencao: 1, info: 2 }
const dm = (iso: string) => dateBR(iso).slice(0, 5)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function computeAlerts(world: AlertWorld, today: string): Alert[] {
  const out: Alert[] = []
  const customer = (id: string) => world.customers.find((c) => c.id === id)
  const garment = (id: string) => world.garments.find((g) => g.id === id)
  const nameOf = (r: Reservation) => customer(r.customerId)?.fullName ?? '—'
  const codesOf = (r: Reservation) =>
    r.items
      .filter((i) => i.itemState !== 'cancelado')
      .map((i) => garment(i.garmentId)?.code)
      .filter(Boolean)
      .join(', ')
  const route = (r: Reservation) => `/reservas/${r.id}`

  // 1. reservas
  for (const r of world.reservations) {
    if (OUT_STATES.includes(r.state)) {
      const d = diffDays(r.returnDueDate, today)
      if (d > 0) {
        out.push({ sev: 'critico', kind: 'devolucao_atrasada', icon: 'alerta', title: `Devolução atrasada — ${nameOf(r)}`, detail: `${codesOf(r)} · ${plural(d, 'dia', 'dias')} · prevista ${dm(r.returnDueDate)}`, route: route(r) })
      } else if (d === 0) {
        out.push({ sev: 'atencao', kind: 'devolucao_hoje', icon: 'relogio', title: `Devolução hoje — ${nameOf(r)}`, detail: codesOf(r), route: route(r) })
      }
    }
    if (PICKUP_STATES.includes(r.state)) {
      const d = diffDays(today, r.pickupDate)
      if (d === 1) out.push({ sev: 'info', kind: 'retirada_amanha', icon: 'presente', title: `Retirada amanhã — ${nameOf(r)}`, detail: `${codesOf(r)} · ${dm(r.pickupDate)}`, route: route(r) })
      const due = balance(r.totalNet, r.lateFee, r.payments).due
      if (due > 0.005 && d <= 3) {
        out.push({ sev: d <= 1 ? 'critico' : 'atencao', kind: 'pagamento_pendente', icon: 'moeda', title: `Pagamento pendente — ${nameOf(r)}`, detail: `${codesOf(r)} · falta ${brl(due)} · retirada ${dm(r.pickupDate)}`, route: route(r) })
      }
    }
    if (ACTIVE_RESERVATION_STATES.includes(r.state)) {
      for (const i of r.items.filter((x) => x.itemState === 'nao_entregue')) {
        const code = garment(i.garmentId)?.code ?? 'Peça'
        out.push({ sev: 'atencao', kind: 'item_nao_entregue', icon: 'alerta', title: `${code} não foi entregue na retirada`, detail: `${r.code} — ${nameOf(r)}${i.pickupNote ? ` · ${i.pickupNote}` : ''}`, route: route(r) })
      }
    }
  }

  // 2. peças aguardando inspeção
  for (const g of world.garments.filter((x) => x.state === 'inspecao')) {
    const entered = g.history.filter((h) => h.to === 'inspecao').map((h) => h.at.slice(0, 10)).sort().pop()
    const days = entered ? Math.max(0, diffDays(entered, today)) : 0
    if (days >= 1) out.push({ sev: 'atencao', kind: 'inspecao_parada', icon: 'alerta', title: `${g.code} aguarda inspeção há ${plural(days, 'dia', 'dias')}`, detail: g.name, route: `/acervo/${g.id}` })
    else out.push({ sev: 'info', kind: 'inspecao_pendente', icon: 'operacao', title: `${g.code} devolvida — aguardando inspeção`, detail: g.name, route: '/operacao' })
  }

  // 3. ordens de serviço abertas há muito tempo
  for (const m of world.maintenances.filter((x) => x.state === 'aberta' || x.state === 'em_andamento')) {
    const days = diffDays(m.openedAt.slice(0, 10), today)
    if (days < 7) continue
    out.push({ sev: 'atencao', kind: 'manutencao_longa', icon: 'costura', title: `${garment(m.garmentId)?.code ?? 'Peça'} há ${days} dias em ${MAINTENANCE_KIND[m.kind]}`, detail: m.description ?? '', route: '/operacao' })
  }

  // 4. aniversários (hoje e próximos 3 dias, com virada de ano)
  for (const c of world.customers) {
    if (!c.birthDate) continue
    const b = nextBirthday(c.birthDate, today)
    if (b.inDays === 0) out.push({ sev: 'info', kind: 'aniversario', icon: 'presente', title: `Aniversário hoje — ${c.fullName}`, detail: 'Boa hora para um contato', route: `/clientes/${c.id}` })
    else if (b.inDays <= 3) out.push({ sev: 'info', kind: 'aniversario', icon: 'presente', title: `Aniversário em ${plural(b.inDays, 'dia', 'dias')} — ${c.fullName}`, detail: dm(b.date), route: `/clientes/${c.id}` })
  }

  // 5. riscos de agenda
  const closed = new Set(world.reservations.filter((r) => CLOSED_RESERVATION_STATES.includes(r.state)).map((r) => r.id))
  const liveRentals = (g: Garment) => g.blocks.filter((b) => b.kind === 'locacao' && b.to >= today && !(b.reservationId && closed.has(b.reservationId))).sort((a, b) => a.from.localeCompare(b.from))
  const reservation = (id: string | null | undefined) => (id ? world.reservations.find((r) => r.id === id) : undefined)
  for (const g of world.garments.filter((x) => RISK_STATES.includes(x.state))) {
    const next = liveRentals(g)[0]
    if (!next) continue
    const days = diffDays(today, next.from)
    if (days > 7) continue
    const r = reservation(next.reservationId)
    const who = r ? ` · ${r.code} — ${nameOf(r)}` : ''
    out.push({
      sev: days <= 2 ? 'critico' : 'atencao',
      kind: 'peca_em_risco',
      icon: 'alerta',
      title: `${g.code} está em ${GARMENT_STATE[g.state].label.toLowerCase()} e tem retirada ${relativeDay(next.from, today)}`,
      detail: `${g.name}${who} · retirada ${dm(next.from)}`,
      route: `/acervo/${g.id}`,
    })
  }
  for (const r of world.reservations.filter((x) => OUT_STATES.includes(x.state) && x.returnDueDate < today)) {
    for (const i of r.items) {
      const g = garment(i.garmentId)
      const queued = g?.blocks.filter((b) => b.kind === 'locacao' && b.reservationId !== r.id && b.from >= today && !(b.reservationId && closed.has(b.reservationId))).sort((a, b) => a.from.localeCompare(b.from))[0]
      const other = reservation(queued?.reservationId)
      if (!g || !queued || !other) continue
      const first = nameOf(r).split(' ')[0]
      out.push({
        sev: 'critico',
        kind: 'atraso_com_fila',
        icon: 'alerta',
        title: `Atraso de ${first} compromete a próxima reserva de ${g.code}`,
        detail: `${g.code} venceu ${dm(r.returnDueDate)} · ${other.code} — ${nameOf(other)} retira ${dm(queued.from)}`,
        route: route(r),
      })
      break
    }
  }

  // 6. provas sem resultado
  for (const f of world.fittings.filter((x) => (x.state === 'agendada' || x.state === 'em_curso') && x.scheduledAt.slice(0, 10) <= today)) {
    const pending = world.fittingItems.filter((i) => i.fittingSessionId === f.id && i.outcome === 'nao_provou').length
    const name = customer(f.customerId)?.fullName ?? '—'
    out.push({
      sev: f.scheduledAt.slice(0, 10) < today ? 'atencao' : 'info',
      kind: 'prova_sem_resultado',
      icon: 'prova',
      title: `Prova de ${name} sem resultado registrado`,
      detail: `${f.code} · ${dm(f.scheduledAt)} ${f.scheduledAt.slice(11, 16)}${pending > 0 ? ` · ${pending} peça(s) sem avaliação` : ''}`,
      route: `/provas/${f.id}`,
    })
  }

  return out.map((a, i) => ({ a, i })).sort((x, y) => SEV_ORDER[x.a.sev] - SEV_ORDER[y.a.sev] || x.i - y.i).map((x) => x.a)
}
