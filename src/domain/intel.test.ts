import { buildWorld, type World } from '@/data/fixture'
import { REALIZED_RESERVATION_STATES } from '@/data/labels-ops'
import { addDays } from '@/lib/format'
import { intelReport } from './intel'
import { coveredDays, customerTotals, intelBase } from './intel-base'
import { intelInsights } from './intel-insights'

const T = '2026-10-24'
const world = () => buildWorld(T)
const name = (w: World, id: string) => w.garments.find((g) => g.id === id)!.name

describe('intelReport — conjuntos base', () => {
  it('período inclusivo [hoje − dias + 1, hoje]', () => {
    for (const days of [90, 180, 365] as const) {
      const r = intelReport(world(), days, T, null)
      expect(r.period).toEqual({ days, from: addDays(T, -days + 1), to: T })
    }
  })

  it('locação = item: ticket por item ≠ ticket por reserva do dashboard quando há reserva multi-peça', () => {
    const w = world()
    const r = intelReport(w, 90, T, null)
    const from = addDays(T, -89)
    const res = w.reservations.filter((x) => REALIZED_RESERVATION_STATES.includes(x.state) && x.pickupDate >= from && x.pickupDate <= T)
    expect(res.some((x) => x.items.length > 1)).toBe(true)
    const dashTicket = res.reduce((s, x) => s + x.totalNet, 0) / res.length
    expect(r.kpis.rentals).toBeGreaterThan(res.length)
    expect(r.kpis.avgTicket).toBeCloseTo(r.kpis.revenue / r.kpis.rentals, 2)
    expect(Math.abs(r.kpis.avgTicket - dashTicket)).toBeGreaterThan(1)
  })

  it('período sem locações: ticket 0, sem insight de tamanho; tiles de cliente seguem o histórico', () => {
    const w = world()
    const from = addDays(T, -89)
    w.reservations = w.reservations.filter((x) => !(REALIZED_RESERVATION_STATES.includes(x.state) && x.pickupDate >= from))
    const r = intelReport(w, 90, T, null)
    expect(r.kpis.rentals).toBe(0)
    expect(r.kpis.revenue).toBe(0)
    expect(r.kpis.avgTicket).toBe(0)
    expect(r.insights.find((i) => i.id === 'tamanho-top')).toBeUndefined()
    expect(r.revenueByGarment).toEqual([])
    expect(r.kpis.activeCustomers).toBeGreaterThan(0)
  })

  it('clientes: ativas = já alugaram; recorrência < 100% (cauda longa) e top 8 por gasto', () => {
    const w = world()
    const r = intelReport(w, 180, T, null)
    expect(r.kpis.totalCustomers).toBeGreaterThanOrEqual(r.kpis.activeCustomers)
    expect(r.kpis.activeCustomers).toBe(w.customers.filter((c) => w.reservations.some((x) => x.customerId === c.id && REALIZED_RESERVATION_STATES.includes(x.state))).length)
    expect(r.kpis.recurrenceRate).toBeGreaterThan(0)
    expect(r.kpis.recurrenceRate).toBeLessThan(1)
    expect(r.kpis.recurrenceRate).toBeCloseTo(r.kpis.recurrentCount / r.kpis.activeCustomers, 6)
    expect(r.topCustomers).toHaveLength(8)
    const spent = r.topCustomers.map((c) => c.spent)
    expect([...spent].sort((a, b) => b - a)).toEqual(spent)
    expect(r.customerRevenue.recurrentCount).toBe(r.kpis.recurrentCount)
    expect(r.customerRevenue.recurrentCount + r.customerRevenue.singleCount).toBe(r.kpis.activeCustomers)
  })
})

describe('intelReport — provas', () => {
  it('Milano aparece em "Encanta e não fecha" e no insight de conversão baixa', () => {
    const w = world()
    const r = intelReport(w, 180, T, null)
    const milano = r.fittedNotRented.find((g) => g.name === name(w, 'sz-0177'))
    expect(milano).toBeDefined()
    expect(milano!.fittings).toBeGreaterThanOrEqual(4)
    expect(milano!.rate ?? 0).toBeLessThan(0.35)
    expect(r.insights.some((i) => i.id === 'prova-sem-conversao' && i.html.includes('SZ-0177'))).toBe(true)
  })

  it('taxa de conversão do período ignora `concluida`', () => {
    const w = world()
    const from = addDays(T, -179)
    const inPeriod = w.fittings.filter((f) => f.scheduledAt.slice(0, 10) >= from && f.scheduledAt.slice(0, 10) <= T)
    expect(inPeriod.some((f) => f.state === 'concluida')).toBe(true)
    const closed = inPeriod.filter((f) => ['convertida', 'perdida', 'no_show'].includes(f.state))
    const r = intelReport(w, 180, T, null)
    expect(r.kpis.closedFittings).toBe(closed.length)
    expect(r.kpis.fittingConversion).toBeCloseTo(closed.filter((f) => f.state === 'convertida').length / closed.length, 6)
    expect(r.fittingFunnel.scheduled).toBe(inPeriod.length)
    expect(r.fittingFunnel.converted).toBeLessThanOrEqual(r.fittingFunnel.held)
  })

  it('sem provas encerradas no período: taxa null e sem insight de conversão', () => {
    const w = world()
    w.fittings = w.fittings.map((f) => ({ ...f, state: 'agendada' as const }))
    const r = intelReport(w, 90, T, null)
    expect(r.kpis.fittingConversion).toBeNull()
    expect(r.insights.find((i) => i.id === 'taxa-prova')).toBeUndefined()
  })
})

describe('intelReport — acervo', () => {
  it('Turim, Nápoles e Rimini em Capital parado como "nunca alugada", ordenado por custo', () => {
    const r = intelReport(world(), 180, T, null)
    for (const code of ['SZ-0268', 'SZ-0275', 'SZ-0282']) {
      const row = r.idleCapital.find((g) => g.code === code)
      expect(row, code).toBeDefined()
      expect(row!.idleDays).toBeNull()
    }
    const costs = r.idleCapital.map((g) => g.cost ?? 0)
    expect([...costs].sort((a, b) => b - a)).toEqual(costs)
    expect(r.kpis.idleGarments).toBe(r.idleCapital.length)
    expect(r.idleCapital.some((g) => g.state === 'baixado')).toBe(false)
  })

  it('peça cadastrada há menos de 30 dias não conta como parada; o limiar vem de `idleAlertDays`', () => {
    const w = world()
    const turim = w.garments.find((g) => g.code === 'SZ-0268')!
    turim.history = [{ at: `${addDays(T, -10)}T10:00:00-03:00`, from: null, to: 'disponivel', reason: 'Peça cadastrada no acervo', userName: 'Júlia Senzi' }]
    expect(intelReport(w, 180, T, null).idleCapital.some((g) => g.code === 'SZ-0268')).toBe(false)
    const base = intelReport(world(), 180, T, null).kpis.idleGarments
    const w2 = world()
    w2.settings = { ...w2.settings, idleAlertDays: 20 }
    const r2 = intelReport(w2, 180, T, null)
    expect(r2.kpis.idleGarments).toBeGreaterThan(base)
    expect(r2.idleAlertDays).toBe(20)
    expect(r2.idleCapital.filter((g) => g.idleDays != null).every((g) => g.idleDays! > 20)).toBe(true)
    expect(r2.insights.find((i) => i.id === 'pecas-paradas')!.html).toContain('nos últimos 20 dias')
  })

  it('ocupação por categoria entre 0 e 100% em todos os períodos; pressão com fórmula da spec', () => {
    for (const days of [90, 180, 365] as const) {
      const r = intelReport(world(), days, T, null)
      expect(r.occupancyByCategory.length).toBeGreaterThan(0)
      for (const c of r.occupancyByCategory) {
        expect(c.rate).toBeGreaterThanOrEqual(0)
        expect(c.rate).toBeLessThanOrEqual(1)
        expect(c.occupiedDays).toBeLessThanOrEqual(c.garments * days)
      }
      for (const p of [...r.pressureBySize, ...r.pressureByCategory]) {
        expect(p.pressure).toBeCloseTo((p.rentals + 0.5 * p.fittings) / p.garments, 6)
        expect(p.occupancy).toBeLessThanOrEqual(1)
      }
      const pr = r.pressureBySize.map((p) => p.pressure)
      expect([...pr].sort((a, b) => b - a)).toEqual(pr)
    }
  })

  it('receita por peça: top 8 por receita, soma dos itens = faturamento; cores e tamanhos somam as locações', () => {
    const r = intelReport(world(), 365, T, null)
    expect(r.revenueByGarment.length).toBeLessThanOrEqual(8)
    const rev = r.revenueByGarment.map((g) => g.revenue)
    expect([...rev].sort((a, b) => b - a)).toEqual(rev)
    expect(r.sizes.reduce((s, x) => s + x.rentals, 0)).toBe(r.kpis.rentals)
    expect(r.colors.reduce((s, x) => s + x.rentals, 0)).toBe(r.kpis.rentals)
    expect(r.monthly.reduce((s, m) => s + m.rentals, 0)).toBe(r.kpis.rentals)
    expect(r.monthly.reduce((s, m) => s + m.revenue, 0)).toBeCloseTo(r.kpis.revenue, 2)
  })

  it('peças que já se pagaram: receita ≥ custo e payback = receita ÷ custo', () => {
    const r = intelReport(world(), 180, T, null)
    expect(r.paidBack.length).toBeGreaterThan(0)
    for (const p of r.paidBack) {
      expect(p.revenue).toBeGreaterThanOrEqual(p.cost)
      expect(p.payback).toBeCloseTo(p.revenue / p.cost, 6)
    }
    const ins = r.insights.filter((i) => i.id === 'payback')
    expect(ins.length).toBe(Math.min(2, r.paidBack.length))
    expect(ins.every((i) => i.requires === 'acervo.cost')).toBe(true)
  })

  it('filtro de categoria restringe peças, receita e ocupação; clientes e provas ficam globais', () => {
    const all = intelReport(world(), 180, T, null)
    const r = intelReport(world(), 180, T, 'macacao')
    expect(r.category).toBe('macacao')
    expect(r.revenueByGarment.every((g) => g.name.startsWith('Macacão'))).toBe(true)
    expect(r.occupancyByCategory.map((c) => c.category)).toEqual(['Macacão'])
    expect(r.kpis.rentals).toBeLessThan(all.kpis.rentals)
    expect(r.kpis.activeCustomers).toBe(all.kpis.activeCustomers)
    expect(r.kpis.fittingConversion).toBe(all.kpis.fittingConversion)
  })
})

describe('intelReport — insights', () => {
  it('textos das regras com negrito e porquê; #3 dispara com > 14% e cita as duas faixas', () => {
    const r = intelReport(world(), 180, T, null)
    const size = r.insights.find((i) => i.id === 'tamanho-top')!
    expect(size.html).toMatch(/^Tamanho <b>(PP|P|M|G|GG|U)<\/b> concentra <b>\d+%<\/b> das locações do período \(\d+ de \d+\)\.$/)
    expect(size.why).toMatch(/^O acervo tem \d+ peças? nesse tamanho, de \d+\. Próximas compras deveriam respeitar essa proporção\.$/)
    for (const i of r.insights.filter((x) => x.id === 'ocupacao-categoria')) {
      expect(i.why).toContain('atenção > 14%')
      expect(i.why).toContain('falta acervo > 25%')
    }
    const occ = r.occupancyByCategory.slice(0, 2).filter((c) => c.rate > 0.14).length
    expect(r.insights.filter((i) => i.id === 'ocupacao-categoria')).toHaveLength(occ)
    const idle = r.insights.find((i) => i.id === 'pecas-paradas')!
    expect(idle.html).toBe(`<b>${r.kpis.idleGarments} peças</b> sem locação nos últimos 90 dias.`)
    expect(idle.requires).toBe('acervo.cost')
    expect(idle.why).toMatch(/de capital parado\. Avaliar redução de preço, reposicionamento na vitrine ou baixa\.$/)
    const ids = r.insights.map((i) => i.id)
    const order = ['tamanho-top', 'cor-giro', 'ocupacao-categoria', 'pecas-paradas', 'payback', 'recorrencia', 'prova-sem-conversao', 'pressao-tamanho', 'pouco-provadas', 'taxa-prova', 'ticket-categoria']
    const seen = order.filter((o) => ids.includes(o))
    expect([...new Set(ids)]).toEqual(seen)
    for (const i of r.insights) expect(i.ref).toBeTruthy()
  })
})

describe('coveredDays', () => {
  const span = (from: string, to: string) => ({ from, to })
  it('une sobreposições sem contar dia duplicado', () => {
    expect(coveredDays([span('2026-10-01', '2026-10-05'), span('2026-10-04', '2026-10-08')], '2026-09-01', '2026-10-31')).toBe(8)
    expect(coveredDays([span('2026-10-01', '2026-10-10'), span('2026-10-03', '2026-10-04')], '2026-09-01', '2026-10-31')).toBe(10)
  })
  it('intervalos encostados somam sem lacuna nem duplicidade; separados somam cada um', () => {
    expect(coveredDays([span('2026-10-01', '2026-10-03'), span('2026-10-04', '2026-10-06')], '2026-09-01', '2026-10-31')).toBe(6)
    expect(coveredDays([span('2026-10-06', '2026-10-06'), span('2026-10-01', '2026-10-02')], '2026-09-01', '2026-10-31')).toBe(3)
  })
  it('corta no período (inclusive) e ignora o que fica fora', () => {
    expect(coveredDays([span('2026-09-28', '2026-10-02')], '2026-10-01', '2026-10-31')).toBe(2)
    expect(coveredDays([span('2026-10-30', '2026-11-04')], '2026-10-01', '2026-10-31')).toBe(2)
    expect(coveredDays([span('2026-08-01', '2026-08-05'), span('2026-11-01', '2026-11-02')], '2026-10-01', '2026-10-31')).toBe(0)
    expect(coveredDays([span('2025-12-30', '2026-01-02')], '2025-12-31', '2026-01-01')).toBe(2)
    expect(coveredDays([], '2026-10-01', '2026-10-31')).toBe(0)
  })
})

describe('intelReport — mundo de demonstração', () => {
  it('6 meses: sereia > 25%, longo entre 14% e 25%; insight #3 dispara', () => {
    const r = intelReport(world(), 180, T, null)
    const occ = (c: string) => r.occupancyByCategory.find((x) => x.category === c)!.rate
    expect(occ('Vestido sereia')).toBeGreaterThan(0.25)
    expect(occ('Vestido longo')).toBeGreaterThan(0.14)
    expect(occ('Vestido longo')).toBeLessThanOrEqual(0.25)
    expect(r.insights.filter((i) => i.id === 'ocupacao-categoria').length).toBeGreaterThanOrEqual(1)
  })
  it('capital parado tem ao menos 3 peças paradas há 90+ dias além das nunca alugadas; ≥ 4 barras de conversão por peça', () => {
    const r = intelReport(world(), 180, T, null)
    expect(r.idleCapital.filter((g) => g.idleDays != null && g.idleDays > 90).length).toBeGreaterThanOrEqual(3)
    expect(r.fittingConversionByGarment.length).toBeGreaterThanOrEqual(4)
    expect(new Set(r.fittingConversionByGarment.map((g) => g.rate)).size).toBeGreaterThanOrEqual(3)
  })
  it('cor sem peça ativa só vira insight com 3+ locações', () => {
    const w = world()
    const base = intelBase(w, 180, T, null)
    const rest = intelReport(w, 180, T, null)
    const colorInsights = (rentals: number) =>
      intelInsights({ ...rest, colors: [{ color: 'Ciano', hex: '#00A0B0', rentals, inStock: 0, revenue: 100 }] }, base, customerTotals(w)).filter((i) => i.id === 'cor-giro')
    expect(colorInsights(2)).toHaveLength(0)
    const [three] = colorInsights(3)
    expect(three!.html).toBe('<b>Ciano</b> gira 3× sem estoque ativo — alta procura com estoque baixo.')
  })
})
