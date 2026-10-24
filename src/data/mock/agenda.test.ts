import { addDays } from '@/lib/format'
import { conversionRate } from '@/domain/fittings'
import { createMockSource } from '../mockSource'
import type { DataSource } from '../source'
import { SourceError, type FittingListRow } from '../types'

const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })
const ALL = { limit: 200, offset: 0 }

async function errorOf(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(SourceError)
    return e as SourceError
  }
  throw new Error('esperava erro')
}

async function fittingBy(src: DataSource, state: string): Promise<FittingListRow> {
  const { items } = await src.listFittings('todas', ALL)
  const f = items.find((x) => x.state === state)
  if (!f) throw new Error(`prova ${state} não encontrada`)
  return f
}

describe('agenda', () => {
  it('agendaRange de hoje traz os compromissos do cenário ordenados por hora, sem cancelados', async () => {
    const src = newSource()
    const [day] = await src.agendaRange(TODAY, TODAY)
    expect(day!.date).toBe(TODAY)
    expect(day!.items.map((i) => i.time)).toEqual(['09:00', '10:30', '14:00', '16:00', '17:30', '19:00'])
    expect(day!.items.map((i) => i.kind)).toEqual(['prova', 'retirada', 'devolucao', 'atendimento', 'servico', 'evento'])
    expect(day!.items.every((i) => i.state !== 'cancelado')).toBe(true)
    const retirada = day!.items[1]!
    expect(retirada.customer?.fullName).toMatch(/Larissa/)
    expect(retirada.garments).toHaveLength(1)
    expect(day!.items[0]!.fitting).not.toBeNull()
  })

  it('devolve um dia por data, inclusive, e agendaMonthDays lista os dias com compromisso', async () => {
    const src = newSource()
    const days = await src.agendaRange(addDays(TODAY, -1), addDays(TODAY, 2))
    expect(days.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
    expect(days.every((d) => d.garmentBlocks.length <= 4)).toBe(true)
    const month = await src.agendaMonthDays('2026-10')
    expect(month).toContain(TODAY)
    expect(month.every((d) => d.startsWith('2026-10'))).toBe(true)
    expect([...month].sort()).toEqual(month)
  })

  it('blocos de acervo aparecem no dia (máx. 4, o excedente em moreBlocks)', async () => {
    const src = newSource()
    const [day] = await src.agendaRange(TODAY, TODAY)
    expect(day!.garmentBlocks.length + day!.moreBlocks).toBe(9)
    expect(day!.garmentBlocks).toHaveLength(4)
    expect(day!.moreBlocks).toBe(5)
  })

  it('valida compromisso manual: Interno exige observação, Atendimento exige cliente', async () => {
    const src = newSource()
    const interno = await errorOf(src.createAppointment({ date: TODAY, time: '10:00', kind: 'interno', customerId: null, notes: '  ' }))
    expect(interno.code).toBe('OBSERVACAO_OBRIGATORIA')
    const atend = await errorOf(src.createAppointment({ date: TODAY, time: '10:00', kind: 'atendimento', customerId: null, notes: null }))
    expect(atend.code).toBe('CLIENTE_OBRIGATORIA')
    expect((await errorOf(src.createAppointment({ date: '', time: '10:00', kind: 'interno', customerId: null, notes: 'x' }))).code).toBe('DATA_OBRIGATORIA')
    expect((await errorOf(src.createAppointment({ date: TODAY, time: '', kind: 'interno', customerId: null, notes: 'x' }))).code).toBe('HORARIO_OBRIGATORIO')
  })

  it('cria, edita e cancela compromisso manual; automático não cancela', async () => {
    const src = newSource()
    const a = await src.createAppointment({ date: TODAY, time: '08:00', kind: 'interno', customerId: null, notes: 'Limpar vitrine' })
    expect(a.internal).toBe(true)
    expect(a.title).toBe('Limpar vitrine')
    let [day] = await src.agendaRange(TODAY, TODAY)
    expect(day!.items[0]!.id).toBe(a.id)
    const b = await src.updateAppointment(a.id, { date: TODAY, time: '20:00', kind: 'interno', customerId: null, notes: 'Limpar vitrine 2' })
    expect(b.startsAt).toContain('T20:00')
    await src.cancelAppointment(a.id)
    ;[day] = await src.agendaRange(TODAY, TODAY)
    expect(day!.items.some((i) => i.id === a.id)).toBe(false)

    const auto = (await src.agendaRange(TODAY, TODAY))[0]!.items.find((i) => i.kind === 'retirada')!
    expect((await errorOf(src.cancelAppointment(auto.id))).code).toBe('ESTADO_INVALIDO')
    expect((await errorOf(src.updateAppointment(auto.id, { date: TODAY, time: '10:00', kind: 'atendimento', customerId: null, notes: null }))).code).toBe('ESTADO_INVALIDO')
  })

  it('lista os usuários', async () => {
    expect((await newSource().listUsers()).map((u) => u.id)).toEqual(['u-julia', 'u-ana', 'u-bruna'])
  })
})

describe('provas', () => {
  it('lista por filtro (scheduledAt desc) e KPIs batem com conversionRate', async () => {
    const src = newSource()
    const all = await src.listFittings('todas', ALL)
    expect(all.total).toBe(27)
    const dates = all.items.map((f) => f.scheduledAt)
    expect([...dates].sort().reverse()).toEqual(dates)
    const abertas = await src.listFittings('abertas', ALL)
    expect(abertas.items.every((f) => f.state === 'agendada' || f.state === 'em_curso')).toBe(true)
    const perdidas = await src.listFittings('perdidas', ALL)
    expect(perdidas.items.every((f) => f.state === 'perdida' || f.state === 'no_show')).toBe(true)

    const k = await src.fittingKpis()
    const c = conversionRate(all.items)
    expect(k.closed).toBe(c.closed)
    expect(k.converted).toBe(c.converted)
    expect(k.rate).toBe(c.rate ?? 0)
    expect(k.total).toBe(all.total)
    expect(k.open).toBe(abertas.total)
    expect(k.converted).toBe(all.items.filter((f) => f.state === 'convertida').length)
    expect(k.lost).toBe(all.items.filter((f) => f.state === 'perdida').length)
    // o cenário (spec agenda-provas §7) tem provas de todos os desfechos
    expect(Math.min(k.open, k.converted, k.lost, k.closed - k.converted - k.lost)).toBeGreaterThan(0)
  })

  it('getFitting traz itens com peça e favorito', async () => {
    const src = newSource()
    const row = await fittingBy(src, 'convertida')
    const d = (await src.getFitting(row.id))!
    expect(d.session.id).toBe(row.id)
    expect(d.customer.id).toBe(row.customerId)
    expect(d.items.length).toBe(row.itemCount)
    expect(d.items[0]!.garment.code).toMatch(/^SZ-/)
    expect(await src.getFitting('nada')).toBeNull()
  })

  it('createFitting com newCustomer de CPF duplicado falha e não cria prova', async () => {
    const src = newSource()
    const before = (await src.listFittings('todas', ALL)).total
    const e = await errorOf(
      src.createFitting({ newCustomer: { fullName: 'Helena Prado', phone: '(63) 99111-2233', birthDate: '1990-05-10', cpf: '529.982.247-25' }, date: TODAY }),
    )
    expect(e.code).toBe('CPF_DUPLICADO')
    expect((await src.listFittings('todas', ALL)).total).toBe(before)
  })

  it('createFitting valida e cria a prova com compromisso (horário padrão 15:00)', async () => {
    const src = newSource()
    expect((await errorOf(src.createFitting({ date: TODAY }))).code).toBe('CLIENTE_OBRIGATORIA')
    const { items } = await src.searchCustomers('CL-0001', 'nome', ALL)
    const cid = items[0]!.id
    expect((await errorOf(src.createFitting({ customerId: cid, date: '' }))).code).toBe('DATA_OBRIGATORIA')
    expect((await errorOf(src.createFitting({ customerId: cid, date: TODAY, eventDate: addDays(TODAY, -1) }))).code).toBe('DATAS_INCOERENTES')
    const f = await src.createFitting({ customerId: cid, date: addDays(TODAY, 5), time: '', eventType: 'Casamento' })
    expect(f.state).toBe('agendada')
    expect(f.scheduledAt).toContain('T15:00')
    expect(f.code).toMatch(/^PR-2026-\d{4}$/)
    const [day] = await src.agendaRange(addDays(TODAY, 5), addDays(TODAY, 5))
    expect(day!.items.some((i) => i.kind === 'prova' && i.fitting?.id === f.id)).toBe(true)
    // cliente nova também é criada
    const g = await src.createFitting({ newCustomer: { fullName: 'Helena Prado', phone: '(63) 99111-2233', birthDate: '1990-05-10', cpf: '123.456.789-09' }, date: TODAY })
    expect(g.customerId).toBeTruthy()
    expect((await src.getCustomer(g.customerId))!.fullName).toBe('Helena Prado')
  })

  it('setFittingOutcome: sem note mantém a anterior e agendada vira em_curso; favorita cria favorito da prova', async () => {
    const src = newSource()
    const { items } = await src.searchCustomers('CL-0001', 'nome', ALL)
    const cid = items[0]!.id
    const f = await src.createFitting({ customerId: cid, date: TODAY })
    const garment = (await src.searchGarments({ q: 'Siena', stateGroup: 'todos' }, ALL)).items[0]!
    let d = await src.addFittingGarment(f.id, garment.id)
    expect(d.items).toHaveLength(1)
    expect(d.items[0]!.outcome).toBe('nao_provou')
    d = await src.addFittingGarment(f.id, garment.id)
    expect(d.items).toHaveLength(1)
    d = await src.setFittingOutcome(f.id, garment.id, { outcome: 'gostou', note: 'Amou a cor' })
    expect(d.session.state).toBe('em_curso')
    expect(d.session.startedAt).not.toBeNull()
    d = await src.setFittingOutcome(f.id, garment.id, { outcome: 'serviu', needsAlteration: false })
    expect(d.items[0]!.outcome).toBe('serviu')
    expect(d.items[0]!.note).toBe('Amou a cor')
    d = await src.setFittingOutcome(f.id, garment.id, { outcome: 'favorita' })
    expect(d.items[0]!.favorite).toBe(true)
    const c = (await src.getCustomer(cid))!
    expect(c.favorites.find((x) => x.garmentId === garment.id)?.source).toBe('prova')
    d = await src.setFittingOutcome(f.id, garment.id, { note: null })
    expect(d.items[0]!.note).toBeNull()
    d = await src.removeFittingGarment(f.id, garment.id)
    expect(d.items).toHaveLength(0)
  })

  it('closeFitting fecha a prova e os compromissos; segunda vez e mutações → PROVA_ENCERRADA', async () => {
    const src = newSource()
    const open = await fittingBy(src, 'em_curso')
    const d = await src.closeFitting(open.id, 'concluida', 'Vai pensar')
    expect(d.session.state).toBe('concluida')
    expect(d.session.outcomeNotes).toBe('Vai pensar')
    expect(d.session.endedAt).not.toBeNull()
    const [day] = await src.agendaRange(TODAY, TODAY)
    expect(day!.items.find((i) => i.kind === 'prova')!.state).toBe('concluido')
    expect((await errorOf(src.closeFitting(open.id, 'perdida', null))).code).toBe('PROVA_ENCERRADA')
    const gid = d.items[0]!.garmentId
    expect((await errorOf(src.setFittingOutcome(open.id, gid, { outcome: 'gostou' }))).code).toBe('PROVA_ENCERRADA')
    expect((await errorOf(src.addFittingGarment(open.id, gid))).code).toBe('PROVA_ENCERRADA')
    expect((await errorOf(src.removeFittingGarment(open.id, gid))).code).toBe('PROVA_ENCERRADA')
  })

  it('no_show marca o compromisso como no_show', async () => {
    const src = newSource()
    const f = await fittingBy(src, 'agendada')
    await src.closeFitting(f.id, 'no_show', null)
    const day = (await src.agendaRange(f.scheduledAt.slice(0, 10), f.scheduledAt.slice(0, 10)))[0]!
    expect(day.items.find((i) => i.fitting?.id === f.id)!.state).toBe('no_show')
  })

  it('provas da cliente e estatísticas da peça', async () => {
    const src = newSource()
    const row = await fittingBy(src, 'convertida')
    const mine = await src.fittingsOfCustomer(row.customerId)
    expect(mine.some((f) => f.id === row.id)).toBe(true)
    expect(mine.find((f) => f.id === row.id)!.items).toHaveLength(row.itemCount)
    const milano = (await src.searchGarments({ q: 'Milano', stateGroup: 'todos' }, ALL)).items[0]!
    const st = await src.fittingStatsOf(milano.id)
    expect(st.fittings).toBeGreaterThanOrEqual(6)
    expect(st.converted).toBe(0)
    const hist = await src.fittingsOfGarment(milano.id)
    expect(hist.length).toBeGreaterThanOrEqual(6)
    expect(hist.every((h) => h.items.length === 1 && h.items[0]!.garmentId === milano.id)).toBe(true)
    expect(hist.map((h) => h.scheduledAt)).toEqual([...hist.map((h) => h.scheduledAt)].sort().reverse())
  })
})
