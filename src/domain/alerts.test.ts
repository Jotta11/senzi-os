import { describe, expect, it } from 'vitest'
import { buildWorld } from '@/data/fixture'
import { addDays } from '@/lib/format'
import { computeAlerts } from './alerts'

const TODAY = '2026-10-24'
const kinds = (w = buildWorld(TODAY), today = TODAY) => computeAlerts(w, today)
const garment = (w: ReturnType<typeof buildWorld>, name: string) => w.garments.find((g) => g.name.endsWith(` ${name}`))!
const reservationOf = (w: ReturnType<typeof buildWorld>, name: string) => w.reservations.find((r) => r.items.some((i) => i.garmentId === garment(w, name).id) && r.state !== 'finalizada' && r.state !== 'cancelada' && r.state !== 'no_show')!

describe('computeAlerts', () => {
  it('devolução atrasada (Portofino) é crítica e vem antes de qualquer atenção', () => {
    const list = kinds()
    const i = list.findIndex((a) => a.kind === 'devolucao_atrasada' && a.title.includes('Vitória'))
    expect(list[0]!.sev).toBe('critico')
    expect(list[i]!.sev).toBe('critico')
    expect(list[i]!.title).toMatch(/^Devolução atrasada — Vitória/)
    expect(list[i]!.detail).toMatch(/2 dias · prevista 22\/10/)
    const firstAtencao = list.findIndex((a) => a.sev === 'atencao')
    const lastCritico = list.map((a) => a.sev).lastIndexOf('critico')
    expect(lastCritico).toBeLessThan(firstAtencao)
    const firstInfo = list.findIndex((a) => a.sev === 'info')
    expect(list.map((a) => a.sev).lastIndexOf('atencao')).toBeLessThan(firstInfo)
  })

  it('cobre devolução hoje, retirada amanhã, pagamento pendente, inspeção, manutenção, risco e prova', () => {
    const list = kinds()
    const has = (k: string) => list.some((a) => a.kind === k)
    for (const k of ['devolucao_hoje', 'retirada_amanha', 'pagamento_pendente', 'inspecao_parada', 'manutencao_longa', 'peca_em_risco', 'prova_sem_resultado']) expect(has(k), k).toBe(true)
    expect(list.find((a) => a.kind === 'devolucao_hoje')!.title).toMatch(/Fernanda|Aline|Tatiane/)
    expect(list.find((a) => a.kind === 'manutencao_longa')!.title).toMatch(/há 9 dias em Zíper/)
    const risco = list.filter((a) => a.kind === 'peca_em_risco')
    expect(risco.find((a) => a.title.includes('higienização'))!.sev).toBe('critico')
    expect(risco.find((a) => a.title.includes('manutenção'))!.sev).toBe('atencao')
    const prova = list.find((a) => a.kind === 'prova_sem_resultado')!
    expect(prova.detail).toMatch(/09:00 · 2 peça\(s\) sem avaliação/)
    expect(prova.sev).toBe('info')
  })

  it('aniversário em 01/01 visto de 30/12 gera "Aniversário em 2 dia(s)"; hoje gera "Aniversário hoje"', () => {
    const w = buildWorld(TODAY)
    w.customers[0]!.birthDate = '1990-01-01'
    const list = computeAlerts(w, '2026-12-30')
    const a = list.find((x) => x.kind === 'aniversario' && x.title.includes(w.customers[0]!.fullName))!
    expect(a.title).toBe(`Aniversário em 2 dias — ${w.customers[0]!.fullName}`)
    expect(a.detail).toBe('01/01')
    w.customers[1]!.birthDate = '1985-10-24'
    const hoje = computeAlerts(w, TODAY).find((x) => x.title === `Aniversário hoje — ${w.customers[1]!.fullName}`)!
    expect(hoje.detail).toBe('Boa hora para um contato')
  })

  it('pagamento_pendente some quando o saldo é quitado', () => {
    const w = buildWorld(TODAY)
    const r = reservationOf(w, 'Sorrento')
    expect(computeAlerts(w, TODAY).some((a) => a.kind === 'pagamento_pendente' && a.route === `/reservas/${r.id}`)).toBe(true)
    r.payments.push({ id: 'pg-x', reservationId: r.id, kind: 'saldo', method: 'pix', amount: r.totalNet, state: 'pago', paidAt: `${TODAY}T10:00:00-03:00`, dueAt: null, reference: null, notes: null, createdBy: 'u-julia', createdAt: `${TODAY}T10:00:00-03:00` })
    expect(computeAlerts(w, TODAY).some((a) => a.kind === 'pagamento_pendente' && a.route === `/reservas/${r.id}`)).toBe(false)
  })

  it('atraso_com_fila quando outra reserva espera a peça atrasada', () => {
    const w = buildWorld(TODAY)
    const late = reservationOf(w, 'Portofino')
    const next = reservationOf(w, 'Verona')
    garment(w, 'Portofino').blocks.push({ id: 'b-fila', kind: 'locacao', from: '2026-10-26', to: '2026-10-28', note: null, reservationId: next.id })
    const a = computeAlerts(w, TODAY).find((x) => x.kind === 'atraso_com_fila')!
    expect(a.sev).toBe('critico')
    expect(a.title).toBe('Atraso de Vitória compromete a próxima reserva de SZ-0142')
    expect(a.detail).toMatch(/venceu 22\/10 · RS-.* — Mariana.* retira 26\/10/)
    expect(a.route).toBe(`/reservas/${late.id}`)
  })

  it('item não entregue em reserva ativa vira alerta de atenção', () => {
    const w = buildWorld(TODAY)
    const r = reservationOf(w, 'Firenze')
    r.items[0]!.itemState = 'nao_entregue'
    r.items[0]!.pickupNote = 'Cliente esqueceu'
    const a = computeAlerts(w, TODAY).find((x) => x.kind === 'item_nao_entregue')!
    expect(a.title).toBe('SZ-0184 não foi entregue na retirada')
    expect(a.detail).toMatch(/Larissa.*· Cliente esqueceu/)
  })

  it('pagamento_pendente: crítico com retirada em até 1 dia; atenção com 2 a 3; some com 4+', () => {
    const sev = (offset: number) => {
      const w = buildWorld(TODAY)
      const r = reservationOf(w, 'Parma') // saldo em aberto
      r.pickupDate = addDays(TODAY, offset)
      return computeAlerts(w, TODAY).find((a) => a.kind === 'pagamento_pendente' && a.route === `/reservas/${r.id}`)?.sev
    }
    expect(sev(0)).toBe('critico')
    expect(sev(1)).toBe('critico')
    expect(sev(2)).toBe('atencao')
    expect(sev(3)).toBe('atencao')
    expect(sev(4)).toBeUndefined()
  })
})
