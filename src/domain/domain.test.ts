import { describe, expect, it } from 'vitest'
import type { Category, Garment, GarmentBlock } from '@/data/types'
import type { FittingItem, FittingSession } from '@/data/types-agenda'
import type { Payment } from '@/data/types-reservas'
import { addDays } from '@/lib/format'
import { checkAvailability, deriveGarmentState, makeBlocks, alternatives, realignOnReturn, effectiveCleaningDays } from './calendar'
import { dayRange, daysInMonth, diffDays, lastMonths, longDate, monthAbbr, monthLabel, nextBirthday, relativeDay, shiftMonth, weekdayIndex, weekStart } from './dates'
import { systemCategoryId, systemCategoryIds } from './fin-categories'
import { conversionRate, fittingStats } from './fittings'
import { balance, daysLate, depositSuggestion, discountNeedsException, hasReceivable, lateFee, lateFeePercent, minSignal, openReceivableDue, pendingTargets, prorate } from './money'
import { DEFAULT_SETTINGS } from './settings'

const categories: Category[] = [
  { slug: 'vestido-longo', name: 'Vestido longo', cleaningDays: 3 },
  { slug: 'saia', name: 'Saia', cleaningDays: 1 },
]
const garment = (over: Partial<Garment> = {}): Garment =>
  ({ id: 'g1', code: 'SZ-001', categorySlug: 'vestido-longo', state: 'disponivel', cleaningDays: null, rentalPrice: 800, labelSize: 'M', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Vinho', retailReference: 1000, ...over }) as Garment
const block = (over: Partial<GarmentBlock>): GarmentBlock => ({ id: 'b', kind: 'locacao', from: '2026-10-10', to: '2026-10-15', note: null, reservationId: 'r1', ...over })
const pay = (over: Partial<Payment>): Payment =>
  ({ id: 'p', reservationId: 'r', kind: 'sinal', method: 'pix', amount: 0, state: 'pago', paidAt: null, dueAt: null, reference: null, notes: null, createdBy: 'u', createdAt: '', ...over }) as Payment

describe('dates', () => {
  it('semana começa na segunda', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(weekdayIndex('2026-10-19')).toBe(0)
    expect(weekdayIndex('2026-10-25')).toBe(6)
  })
  it('diffDays, dayRange, relativeDay', () => {
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2)
    expect(dayRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(relativeDay('2026-10-24', '2026-10-24')).toBe('hoje')
    expect(relativeDay('2026-10-25', '2026-10-24')).toBe('amanhã')
    expect(relativeDay('2026-10-23', '2026-10-24')).toBe('ontem')
    expect(relativeDay('2026-10-29', '2026-10-24')).toBe('em 5 dias')
    expect(relativeDay('2026-10-20', '2026-10-24')).toBe('há 4 dias')
  })
  it('aniversário com virada de ano e 29/02', () => {
    expect(nextBirthday('1990-01-02', '2026-12-31')).toEqual({ date: '2027-01-02', inDays: 2 })
    expect(nextBirthday('2000-02-29', '2027-02-27')).toEqual({ date: '2027-02-28', inDays: 1 })
    expect(nextBirthday('2000-02-29', '2028-02-27')).toEqual({ date: '2028-02-29', inDays: 2 })
    expect(nextBirthday('1990-10-24', '2026-10-24')).toEqual({ date: '2026-10-24', inDays: 0 })
  })
  it('rótulos longos', () => {
    expect(longDate('2026-10-23')).toBe('sexta-feira, 23 de outubro')
    expect(monthLabel('2026-10-05')).toBe('Outubro de 2026')
  })
})

describe('dates — meses', () => {
  it('daysInMonth, shiftMonth (virada de ano), monthAbbr e lastMonths (o corrente vai até hoje)', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-10', -13)).toBe('2025-09')
    expect(monthAbbr('2026-10')).toBe('out')
    expect(lastMonths('2026-02-10', 3)).toEqual([
      { month: '2025-12', from: '2025-12-01', to: '2025-12-31' },
      { month: '2026-01', from: '2026-01-01', to: '2026-01-31' },
      { month: '2026-02', from: '2026-02-01', to: '2026-02-10' },
    ])
  })
})

describe('money — a receber, multa e atraso', () => {
  const r = (state: Parameters<typeof hasReceivable>[0]['state'], payments: Payment[] = [pay({ kind: 'sinal', amount: 300 })]) => ({ state, totalNet: 1000, lateFee: 0, payments })
  it('openReceivableDue: saldo nos estados com conta a receber; 0 em rascunho, cancelada e no-show', () => {
    for (const st of ['confirmada', 'em_uso', 'em_inspecao', 'finalizada'] as const) expect(openReceivableDue(r(st))).toBe(700)
    for (const st of ['rascunho', 'cancelada', 'no_show'] as const) {
      expect(hasReceivable({ state: st })).toBe(false)
      expect(openReceivableDue(r(st))).toBe(0)
    }
  })
  it('pendingTargets: saldo da locação primeiro, o resto é multa; Σ = due', () => {
    expect(pendingTargets(1000, 200, [pay({ kind: 'sinal', amount: 300 })])).toEqual({ saldo: 700, multa: 200 })
    expect(pendingTargets(1000, 200, [pay({ kind: 'integral', amount: 1000 })])).toEqual({ saldo: 0, multa: 200 })
    expect(pendingTargets(1000, 0, [pay({ kind: 'integral', amount: 1000 }), pay({ kind: 'estorno', amount: 100 })])).toEqual({ saldo: 100, multa: 0 })
  })
  it('daysLate só com a peça na rua e depois do prazo; lateFeePercent prefere o contrato', () => {
    expect(daysLate({ state: 'em_uso', returnDueDate: '2026-10-21' }, '2026-10-24')).toBe(3)
    expect(daysLate({ state: 'em_uso', returnDueDate: '2026-10-25' }, '2026-10-24')).toBe(0)
    expect(daysLate({ state: 'em_inspecao', returnDueDate: '2026-10-21' }, '2026-10-24')).toBe(0)
    const contract = { terms: { lateFeeDailyPercent: 15, deposit: 0 } } as Parameters<typeof lateFeePercent>[0]['contract']
    expect(lateFeePercent({ contract }, { lateFeeDailyPercent: 20 })).toBe(15)
    expect(lateFeePercent({ contract: null }, { lateFeeDailyPercent: 20 })).toBe(20)
    expect(lateFeePercent({ contract: null }, undefined)).toBe(0)
  })
})

describe('fin-categories', () => {
  it('acha categorias de sistema pela systemKey, nunca pelo id', () => {
    const cats = [
      { id: 'x1', systemKey: 'locacao' as const },
      { id: 'x2', systemKey: 'manutencao' as const },
      { id: 'x3', systemKey: 'ajuste' as const },
      { id: 'x4', systemKey: null },
    ]
    expect(systemCategoryId(cats, 'locacao')).toBe('x1')
    expect(systemCategoryId(cats, 'aquisicao')).toBeNull()
    expect(systemCategoryIds(cats, ['manutencao', 'ajuste'])).toEqual(['x2', 'x3'])
  })
})

describe('money', () => {
  it('prorate rateia o desconto sem perder centavos', () => {
    const a = prorate([{ gross: 300 }, { gross: 300 }, { gross: 400 }], 100)
    expect(a.map((x) => x.alloc)).toEqual([30, 30, 40])
    const b = prorate([{ gross: 100 }, { gross: 100 }, { gross: 100 }], 100)
    expect(Math.round(b.reduce((s, x) => s + x.net, 0) * 100)).toBe(20000)
    expect(b.map((x) => x.alloc)).toEqual([33.34, 33.33, 33.33])
    const c = prorate([{ gross: 100 }, { gross: 200 }, { gross: 200 }], 10.01)
    expect(Math.round(c.reduce((s, x) => s + x.net, 0) * 100)).toBe(50000 - 1001)
    expect(prorate([{ gross: 100 }], 0)).toEqual([{ alloc: 0, net: 100 }])
    expect(prorate([{ gross: 100 }], 500)[0]).toEqual({ alloc: 100, net: 0 })
  })
  it('balance com caução e estornos', () => {
    const base = [pay({ kind: 'sinal', amount: 500 }), pay({ kind: 'caucao', amount: 200 })]
    const r = balance(1000, 0, [...base, pay({ kind: 'estorno', amount: 200, refersTo: 'caucao' })])
    expect(r).toMatchObject({ devido: 1000, pago: 500, caucao: 0, due: 500, status: 'parcial' })
    const r2 = balance(1000, 0, [...base, pay({ kind: 'estorno', amount: 100 })])
    expect(r2).toMatchObject({ pago: 400, caucao: 200, due: 600, status: 'parcial' })
    expect(balance(1000, 0, [pay({ kind: 'sinal', amount: 300, state: 'pendente' })])).toMatchObject({ pago: 0, status: 'nao_pago', due: 1000 })
    expect(balance(1000, 250, [pay({ kind: 'integral', amount: 1000 })])).toMatchObject({ devido: 1250, due: 250, status: 'parcial' })
    expect(balance(1000, 0, [pay({ kind: 'integral', amount: 1000 })])).toMatchObject({ due: 0, status: 'pago' })
  })
  it('multa, sinal mínimo e limite de desconto', () => {
    expect(lateFee(1250, 20, 2)).toBe(500)
    expect(lateFee(1250, 20, 0)).toBe(0)
    expect(minSignal(1180, 50)).toBe(590)
    expect(discountNeedsException(1000, 150, 15)).toBe(false)
    expect(discountNeedsException(1000, 150.01, 15)).toBe(true)
    expect(discountNeedsException(0, 10, 15)).toBe(false)
  })
  it('caução sugerida', () => {
    const gs = [garment({ retailReference: 1000 }), garment({ id: 'g2', retailReference: 500 })]
    expect(depositSuggestion(gs, 1000, 20)).toBe(300)
    expect(depositSuggestion(gs, 1000, 0)).toBe(100)
    expect(depositSuggestion([garment({ categorySlug: 'bolsa-acessorio' })], 400, 0)).toBe(40)
  })
})

describe('calendar', () => {
  const base = { garment: garment(), pickup: '2026-10-14', returnDue: '2026-10-20', drafts: [], settings: DEFAULT_SETTINGS, categories }
  it('limpeza efetiva: peça > categoria > padrão', () => {
    expect(effectiveCleaningDays(garment({ cleaningDays: 5 }), categories, DEFAULT_SETTINGS)).toBe(5)
    expect(effectiveCleaningDays(garment(), categories, DEFAULT_SETTINGS)).toBe(3)
    expect(effectiveCleaningDays(garment({ categorySlug: 'x' }), categories, DEFAULT_SETTINGS)).toBe(2)
  })
  it('bloco de locação sobreposto conflita', () => {
    const r = checkAvailability({ ...base, blocks: [block({})] })
    expect(r.ok).toBe(false)
    expect(r.conflicts[0]).toMatchObject({ kind: 'locacao', from: '2026-10-10', to: '2026-10-15', draft: false })
    expect(r.window).toEqual({ from: '2026-10-14', to: '2026-10-23', cleaningDays: 3 })
  })
  it('reserva finalizada é histórico e não conflita', () => {
    const r = checkAvailability({ ...base, blocks: [block({})], reservations: { r1: { code: 'RS-1', state: 'finalizada' } } })
    expect(r.ok).toBe(true)
  })
  it('ignora os blocos da própria reserva', () => {
    expect(checkAvailability({ ...base, blocks: [block({})], ignoreReservationId: 'r1' }).ok).toBe(true)
  })
  it('encostar no buffer de higienização conflita', () => {
    const start = (d: string) => checkAvailability({ ...base, returnDue: '2026-10-20', blocks: [block({ id: 'x', reservationId: 'r2', from: d, to: addDays(d, 3) })] })
    expect(start('2026-10-23').ok).toBe(false)
    expect(start('2026-10-24').ok).toBe(true)
  })
  it('rascunho da mesma peça vira conflito draft', () => {
    const r = checkAvailability({ ...base, blocks: [], drafts: [{ reservationId: 'd1', code: 'RS-9', pickupDate: '2026-10-18', returnDueDate: '2026-10-19' }] })
    expect(r.ok).toBe(false)
    expect(r.conflicts[0]).toMatchObject({ draft: true, reservationCode: 'RS-9' })
  })
  it('peça baixada reprova', () => {
    expect(checkAvailability({ ...base, garment: garment({ state: 'baixado' }), blocks: [] })).toMatchObject({ ok: false, reason: 'Peça baixada do acervo.' })
  })
  it('makeBlocks gera locação e higienização (e preparação)', () => {
    const b = makeBlocks({ garment: garment(), pickup: '2026-10-14', returnDue: '2026-10-20', reservationId: 'r1', settings: { ...DEFAULT_SETTINGS, defaultPrepDays: 1 }, categories })
    expect(b.map((x) => [x.kind, x.from, x.to])).toEqual([
      ['inspecao', '2026-10-13', '2026-10-13'],
      ['locacao', '2026-10-14', '2026-10-20'],
      ['higienizacao', '2026-10-21', '2026-10-23'],
    ])
    expect(b.every((x) => x.reservationId === 'r1')).toBe(true)
  })
  describe('realignOnReturn', () => {
    const blocks = [block({ id: 'l' , from: '2026-10-10', to: '2026-10-15' }), block({ id: 'h', kind: 'higienizacao', from: '2026-10-16', to: '2026-10-18' })]
    it('antecipada encolhe a locação e puxa a higienização', () => {
      const r = realignOnReturn({ blocks, reservationId: 'r1', actualReturn: '2026-10-12', cleaningDays: 3 })
      expect(r.map((x) => [x.id, x.from, x.to])).toEqual([['l', '2026-10-10', '2026-10-12'], ['h', '2026-10-13', '2026-10-15']])
    })
    it('atrasada empurra a higienização e corta no próximo bloco', () => {
      const next = block({ id: 'n', reservationId: 'r2', from: '2026-10-20', to: '2026-10-25' })
      const r = realignOnReturn({ blocks: [...blocks, next], reservationId: 'r1', actualReturn: '2026-10-18', cleaningDays: 3 })
      expect(r.find((x) => x.id === 'l')).toMatchObject({ to: '2026-10-18' })
      expect(r.find((x) => x.id === 'h')).toMatchObject({ from: '2026-10-19', to: '2026-10-19' })
    })
    it('libera a limpeza quando não sobra espaço e cria se não existia', () => {
      const next = block({ id: 'n', reservationId: 'r2', from: '2026-10-19', to: '2026-10-25' })
      expect(realignOnReturn({ blocks: [blocks[0]!, blocks[1]!, next], reservationId: 'r1', actualReturn: '2026-10-18', cleaningDays: 3 }).some((x) => x.id === 'h')).toBe(false)
      const created = realignOnReturn({ blocks: [blocks[0]!], reservationId: 'r1', actualReturn: '2026-10-15', cleaningDays: 2 })
      expect(created.find((x) => x.kind === 'higienizacao')).toMatchObject({ from: '2026-10-16', to: '2026-10-17', reservationId: 'r1' })
    })
  })
  describe('deriveGarmentState', () => {
    const today = '2026-10-24'
    it('estados operacionais só saem por ação', () => {
      expect(deriveGarmentState({ current: 'manutencao', blocks: [], links: [], today })).toBe('manutencao')
      expect(deriveGarmentState({ current: 'baixado', blocks: [], links: [], today })).toBe('baixado')
    })
    it('o fato vence o plano', () => {
      const links = [{ reservationId: 'r1', state: 'em_uso' as const, itemState: 'retirado' as const }]
      expect(deriveGarmentState({ current: 'reservado', blocks: [], links, today })).toBe('em_uso')
      const late = [{ reservationId: 'r1', state: 'aguardando_devolucao' as const, itemState: 'retirado' as const }]
      expect(deriveGarmentState({ current: 'em_uso', blocks: [], links: late, today })).toBe('aguardando_devolucao')
    })
    it('plano: reservado, higienização, disponível; histórico ignorado', () => {
      const links = [{ reservationId: 'r1', state: 'confirmada' as const, itemState: 'pendente' as const }]
      expect(deriveGarmentState({ current: 'disponivel', blocks: [block({ from: '2026-10-30', to: '2026-11-02' })], links, today })).toBe('reservado')
      expect(deriveGarmentState({ current: 'disponivel', blocks: [block({ kind: 'higienizacao', from: '2026-10-23', to: '2026-10-25' })], links, today })).toBe('higienizacao')
      const hist = [{ reservationId: 'r1', state: 'finalizada' as const, itemState: 'inspecionado' as const }]
      expect(deriveGarmentState({ current: 'reservado', blocks: [block({ from: '2026-10-20', to: '2026-10-26' })], links: hist, today })).toBe('disponivel')
      expect(deriveGarmentState({ current: 'reservado', blocks: [], links: [], today })).toBe('disponivel')
    })
    it('item pendente de reserva com retirada parcial continua reservado; item devolvido não prende a peça', () => {
      const loc = [block({ from: '2026-10-23', to: '2026-10-26' })]
      const pend = [{ reservationId: 'r1', state: 'retirada' as const, itemState: 'pendente' as const }]
      expect(deriveGarmentState({ current: 'disponivel', blocks: loc, links: pend, today })).toBe('reservado')
      const parcial = [{ reservationId: 'r1', state: 'aguardando_devolucao' as const, itemState: 'pendente' as const }]
      expect(deriveGarmentState({ current: 'disponivel', blocks: loc, links: parcial, today })).toBe('reservado')
      const devolvido = [{ reservationId: 'r1', state: 'aguardando_devolucao' as const, itemState: 'devolvido' as const }]
      expect(deriveGarmentState({ current: 'disponivel', blocks: loc, links: devolvido, today })).toBe('disponivel')
      const comLimpeza = [...loc, block({ id: 'h', kind: 'higienizacao', from: '2026-10-24', to: '2026-10-25' })]
      expect(deriveGarmentState({ current: 'disponivel', blocks: comLimpeza, links: devolvido, today })).toBe('higienizacao')
    })
  })
  it('alternativas pontuam e limitam a 4', () => {
    const target = garment()
    const cands = [
      garment({ id: 'a', labelSize: 'M', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Vinho', rentalPrice: 850 }),
      garment({ id: 'b', labelSize: 'G', sizeEquiv: 'M', length: 'curto', colorPrimary: 'Azul', rentalPrice: 1200 }),
      garment({ id: 'c', labelSize: 'G', sizeEquiv: 'G', length: 'longo', colorPrimary: 'Azul', rentalPrice: 800 }),
      garment({ id: 'd', categorySlug: 'saia' }),
      garment({ id: 'e', state: 'baixado' }),
      garment({ id: 'f', labelSize: 'P', sizeEquiv: 'P', length: 'midi', colorPrimary: 'Preto', rentalPrice: 2000 }),
      garment({ id: 'g', labelSize: 'P', sizeEquiv: 'P', length: 'midi', colorPrimary: 'Preto', rentalPrice: 2000 }),
      garment({ id: 'h', labelSize: 'P', sizeEquiv: 'P', length: 'midi', colorPrimary: 'Preto', rentalPrice: 2000 }),
      target,
    ]
    const r = alternatives(target, cands, (g) => g.id !== 'c')
    expect(r.map((x) => x.garment.id)).toEqual(['a', 'b', 'f', 'g'])
    expect(r[0]!.score).toBe(4 + 3 + 2 + 2 + 1)
    expect(r[1]!.score).toBe(3)
  })
})

describe('fittings', () => {
  const s = (id: string, state: FittingSession['state'], reservationId: string | null = null): FittingSession =>
    ({ id, code: id, customerId: 'c', state, scheduledAt: `2026-10-0${id}T10:00:00`, reservationId }) as FittingSession
  const it_ = (sid: string, outcome: FittingItem['outcome'], extra: Partial<FittingItem> = {}): FittingItem =>
    ({ fittingSessionId: sid, garmentId: 'g1', position: 0, outcome, needsAlteration: false, note: null, recordedBy: null, recordedAt: null, ...extra }) as FittingItem
  it('conversionRate ignora concluída e abertas', () => {
    const r = conversionRate([s('1', 'convertida'), s('2', 'perdida'), s('3', 'no_show'), s('4', 'concluida'), s('5', 'agendada')])
    expect(r).toEqual({ closed: 3, converted: 1, rate: 1 / 3 })
    expect(conversionRate([s('1', 'agendada')])).toEqual({ closed: 0, converted: 0, rate: null })
  })
  it('fittingStats', () => {
    const sessions = [s('1', 'convertida', 'r1'), s('2', 'perdida'), s('3', 'convertida', 'r2'), s('4', 'agendada')]
    const items = [
      it_('1', 'favorita', { note: 'amou' }),
      it_('2', 'descartada', { note: 'caro' }),
      it_('3', 'precisa_ajuste'),
      it_('4', 'nao_provou'),
      it_('2', 'apertada', { garmentId: 'outra' }),
    ]
    const st = fittingStats('g1', sessions, items, [{ reservationId: 'r1', garmentId: 'g1' }, { reservationId: 'r2', garmentId: 'zzz' }])
    expect(st).toMatchObject({ fittings: 3, converted: 1, favorites: 1, discards: 1, alterations: 1 })
    expect(st.rate).toBeCloseTo(1 / 3)
    expect(st.reasons).toEqual([{ outcome: 'descartada', note: 'caro' }, { outcome: 'favorita', note: 'amou' }])
    expect(fittingStats('nada', sessions, items, []).rate).toBeNull()
  })
})
