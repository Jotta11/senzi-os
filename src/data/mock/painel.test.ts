import { describe, expect, it } from 'vitest'
import type { Payment } from '../types'
import { createMockCtx } from './context'
import { painel } from './painel'

const TODAY = '2026-10-24'
const pay = (reservationId: string, kind: Payment['kind'], amount: number, day: string, extra: Partial<Payment> = {}): Payment => ({
  id: `px-${day}-${kind}-${amount}`, reservationId, kind, method: 'pix', amount, state: 'pago', paidAt: `${day}T10:00:00-03:00`, dueAt: null, reference: null, notes: null, createdBy: 'u-julia', createdAt: `${day}T10:00:00-03:00`, ...extra,
})

/** Mundo sem nenhum recebimento: só os pagamentos que o teste lança contam. */
function setup(payments: [Payment['kind'], number, string, Partial<Payment>?][]) {
  const ctx = createMockCtx({ latencyMs: 0, today: TODAY })
  ctx.db.reservations.forEach((r) => (r.payments = []))
  ctx.db.receivables = []
  const r = ctx.db.reservations[0]!
  r.payments = payments.map(([k, a, d, e]) => pay(r.id, k, a, d, e))
  return painel(ctx, { agendaRange: async () => [], agendaMonthDays: async () => [] })
}

describe('dashboardSummary — faturamento por período', () => {
  const lines: [Payment['kind'], number, string][] = [
    ['sinal', 1, '2026-10-18'], // 7 dias: dentro (limite)
    ['sinal', 10, '2026-10-17'], // 7 dias: fora; mês: dentro
    ['sinal', 100, '2026-10-01'], // mês: dentro (limite)
    ['sinal', 1000, '2026-09-30'], // mês: fora; 90: dentro
    ['sinal', 10000, '2026-07-27'], // 90 dias: dentro (limite)
    ['sinal', 100000, '2026-07-26'], // 90 dias: fora
  ]
  it.each([
    ['7', 1],
    ['30', 111],
    ['90', 11111],
  ] as const)('período %s soma só o que cai na janela', async (range, total) => {
    const s = await setup(lines).dashboardSummary(range)
    expect(s.finance!.revenue).toBe(total)
    expect(s.finance!.range).toBe(range)
  })

  it('a série tem 7 meses terminando no corrente (parcial) e caução não conta', async () => {
    const s = await setup([...lines, ['caucao', 500, '2026-10-20']]).dashboardSummary('30')
    expect(s.finance!.series.map((x) => x.label)).toEqual(['abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out'])
    expect(s.finance!.series.at(-1)).toMatchObject({ month: '2026-10', value: 111 })
    expect(s.finance!.series.find((x) => x.month === '2026-09')!.value).toBe(1000)
    expect(s.finance!.series.find((x) => x.month === '2026-07')!.value).toBe(110000)
  })

  it('estorno de receita subtrai do faturamento; estorno de caução não', async () => {
    const base = await setup([['sinal', 400, '2026-10-20']]).dashboardSummary('7')
    expect(base.finance!.revenue).toBe(400)
    const s = await setup([['sinal', 400, '2026-10-20'], ['estorno', 150, '2026-10-21'], ['estorno', 60, '2026-10-22', { refersTo: 'caucao' }]]).dashboardSummary('7')
    expect(s.finance!.revenue).toBe(250)
  })
})
