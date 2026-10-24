import { addDays } from '@/lib/format'
import { createMockCtx, type MockCtx } from './context'
import { operacao } from './operacao'
import { reservas } from './reservas'
import { SourceError, type Garment, type InspectionInput } from '../types'

const TODAY = '2026-10-24'
const D = (n: number) => addDays(TODAY, n)

function setup() {
  const ctx = createMockCtx({ latencyMs: 0, today: TODAY })
  return { ctx, src: operacao(ctx), res: reservas(ctx) }
}
const byName = (ctx: MockCtx, n: string): Garment => ctx.db.garments.find((g) => g.name.endsWith(` ${n}`))!

async function inspect(src: ReturnType<typeof operacao>, g: Garment, extra: Partial<InspectionInput> = {}) {
  const target = await src.inspectionTarget(g.id)
  return src.registerInspection({
    garmentId: g.id,
    reservationId: target?.reservationId ?? null,
    findings: [],
    photos: [],
    perda: false,
    maintenanceKind: 'costura',
    provider: null,
    openRepair: false,
    notes: null,
    ...extra,
  })
}
const grave = { label: 'Zíper e fechos', ok: false as const, severity: 'grave' as const, note: 'Rompido' }
const leve = { label: 'Barra', ok: false as const, severity: 'leve' as const, note: null }

describe('Operação — fonte em memória', () => {
  it('fila: peças em inspeção, ordens em aberto e custo dos últimos 30 dias', async () => {
    const { src } = setup()
    const q = await src.operacaoQueue()
    expect(q.inspecao.map((r) => r.garment.name.split(' ')[1]).sort()).toEqual(['Modena', 'Ravello'])
    expect(q.higienizacao).toHaveLength(2)
    expect(q.manutencao[0]!.order?.kind).toBe('ziper')
    expect(q.bloqueado[0]!.blockNote).toMatch(/Ensaio fotográfico/)
    expect(q.openOrders).toHaveLength(4)
    expect(q.openOrders[0]!.openedAt <= q.openOrders[3]!.openedAt).toBe(true)
    expect(q.costLast30d).toBeGreaterThan(0)
    expect(q.inspecao.every((r) => r.waitingDays !== null)).toBe(true)
  })

  it('inspeção aprovada: peça em higienização com ordem em andamento; última peça finaliza a reserva', async () => {
    const { ctx, src } = setup()
    const modena = byName(ctx, 'Modena')
    const target = await src.inspectionTarget(modena.id)
    expect(target?.customerName).toMatch(/^Ana Paula/)
    const out = await inspect(src, modena)
    expect(out.result).toBe('aprovada')
    expect(out.garment.state).toBe('higienizacao')
    const m = ctx.db.maintenances.find((x) => x.garmentId === modena.id && x.state === 'em_andamento')!
    expect(m.kind).toBe('higienizacao')
    expect(m.blocksGarment).toBe(true)
    expect(m.dueAt! >= D(1)).toBe(true)
    expect(out.garment.blocks.some((b) => b.maintenanceId === m.id && b.kind === 'higienizacao')).toBe(true)
    const r = ctx.reservation(target!.reservationId)
    expect(r.items[0]!.itemState).toBe('inspecionado')
    expect(r.state).toBe('finalizada')
    expect(r.history.at(-1)!.reason).toBe('Todas as peças inspecionadas')
  })

  it('reserva com outra peça ainda na rua não finaliza (Ravello)', async () => {
    const { ctx, src } = setup()
    const ravello = byName(ctx, 'Ravello')
    const target = (await src.inspectionTarget(ravello.id))!
    await inspect(src, ravello, { findings: [leve], openRepair: true, maintenanceKind: 'barra' })
    expect(ctx.reservation(target.reservationId).state).toBe('aguardando_devolucao')
    const orders = ctx.db.maintenances.filter((x) => x.garmentId === ravello.id && x.state !== 'concluida')
    expect(orders.map((o) => o.kind).sort()).toEqual(['barra', 'higienizacao'])
    expect(orders.find((o) => o.kind === 'barra')!.blocksGarment).toBe(false)
  })

  it('dano grave: manutenção com bloco de 5 dias; grave + perda: bloqueada 30 dias sem ordem', async () => {
    const a = setup()
    const ravello = byName(a.ctx, 'Ravello')
    const g = await inspect(a.src, ravello, { findings: [grave], maintenanceKind: 'ziper', provider: 'Ateliê Dona Neuza' })
    expect(g.result).toBe('reprovada')
    expect(g.garment.state).toBe('manutencao')
    const m = a.ctx.db.maintenances.find((x) => x.garmentId === ravello.id && x.state === 'aberta')!
    expect(m).toMatchObject({ kind: 'ziper', blocksGarment: true, dueAt: D(5), provider: 'Ateliê Dona Neuza' })
    expect(g.garment.blocks.find((b) => b.maintenanceId === m.id)).toMatchObject({ kind: 'manutencao', from: TODAY, to: D(5) })

    const b = setup()
    const modena = byName(b.ctx, 'Modena')
    const before = b.ctx.db.maintenances.length
    const p = await inspect(b.src, modena, { findings: [grave], perda: true })
    expect(p.result).toBe('perda')
    expect(p.garment.state).toBe('bloqueado')
    expect(b.ctx.db.maintenances).toHaveLength(before)
    expect(p.garment.blocks.find((x) => x.kind === 'bloqueio_manual')).toMatchObject({ from: TODAY, to: D(30) })
  })

  it('só peça em inspeção pode ser inspecionada', async () => {
    const { ctx, src } = setup()
    await expect(inspect(src, byName(ctx, 'Capri'))).rejects.toMatchObject({ code: 'ESTADO_INVALIDO' })
  })

  it('devolução na reserva aparece na fila e a inspeção finaliza a reserva (Ostuni)', async () => {
    const { ctx, src, res } = setup()
    const ostuni = byName(ctx, 'Ostuni')
    const r = ctx.db.reservations.find((x) => x.state === 'em_uso' && x.items.some((i) => i.garmentId === ostuni.id))!
    await res.returnItems(r.id, r.items.map((i) => ({ itemId: i.id, returned: true })))
    expect((await src.operacaoQueue()).inspecao.map((x) => x.garment.id)).toContain(ostuni.id)
    await inspect(src, ostuni)
    expect(ctx.reservation(r.id).state).toBe('finalizada')
    expect((await src.operacaoQueue()).higienizacao.map((x) => x.garment.id)).toContain(ostuni.id)
  })

  it('concluir com custo 58 cria conta a pagar paga de Higienização e libera a peça', async () => {
    const { ctx, src } = setup()
    const g = byName(ctx, 'Trastevere')
    const m = ctx.db.maintenances.find((x) => x.garmentId === g.id && x.state === 'em_andamento')!
    const out = await src.closeMaintenance({ maintenanceId: m.id, cost: 58, provider: 'Tinturaria Aurora', note: 'Lavada e passada', release: true })
    expect(out.state).not.toBe('higienizacao')
    expect(ctx.db.maintenances.find((x) => x.id === m.id)).toMatchObject({ state: 'concluida', cost: 58, provider: 'Tinturaria Aurora' })
    expect(ctx.db.maintenances.find((x) => x.id === m.id)!.description).toBe('Higienização pós-locação · Lavada e passada')
    const pay = ctx.db.payables.find((p) => p.maintenanceId === m.id)!
    expect(pay).toMatchObject({ amount: 58, status: 'paga', source: 'operacao', categoryId: 'fc-higienizacao', garmentId: g.id })
    expect(out.blocks.some((b) => b.maintenanceId === m.id)).toBe(false)
    await expect(src.closeMaintenance({ maintenanceId: m.id, cost: 0, provider: null, note: null, release: false })).rejects.toBeInstanceOf(SourceError)
  })

  it('custo negativo é recusado; custo zero não cria despesa', async () => {
    const { ctx, src } = setup()
    const m = ctx.db.maintenances.find((x) => x.state === 'aberta' && x.kind === 'ajuste')!
    await expect(src.closeMaintenance({ maintenanceId: m.id, cost: -1, provider: null, note: null, release: false })).rejects.toMatchObject({ code: 'CUSTO_INVALIDO', field: 'cost' })
    const before = ctx.db.payables.length
    await src.closeMaintenance({ maintenanceId: m.id, cost: 0, provider: null, note: null, release: true })
    expect(ctx.db.payables).toHaveLength(before)
  })

  it('liberar peça bloqueada remove o bloqueio editorial que cobre hoje', async () => {
    const { ctx, src } = setup()
    const genova = byName(ctx, 'Gênova')
    const out = await src.releaseGarment(genova.id, 'Liberada pela Operação')
    expect(out.state).toBe('disponivel')
    expect(out.blocks.some((b) => b.kind === 'editorial')).toBe(false)
    expect(out.history[0]).toMatchObject({ to: 'disponivel', reason: 'Liberada pela Operação' })
    await expect(src.releaseGarment(byName(ctx, 'Capri').id, '')).rejects.toMatchObject({ code: 'ESTADO_INVALIDO' })
  })

  it('liberar peça com reserva futura volta reservada e encerra as ordens abertas (Parma)', async () => {
    const { ctx, src } = setup()
    const parma = byName(ctx, 'Parma')
    const out = await src.releaseGarment(parma.id, 'Liberada pela Operação')
    expect(out.state).toBe('reservado')
    expect(ctx.db.maintenances.filter((m) => m.garmentId === parma.id && m.state !== 'concluida')).toHaveLength(0)
    const hist = await src.maintenancesOf(parma.id)
    expect(hist.maintenances.length).toBeGreaterThan(1)
    expect(hist.inspections.length).toBeGreaterThan(0)
  })

  it('checklist ativo e fornecedores sugeridos', async () => {
    const { src } = setup()
    expect(await src.checklist()).toHaveLength(10)
    expect(await src.suppliers()).toEqual(expect.arrayContaining(['Lavanderia Branca Neve', 'Ateliê Dona Neuza', 'Ateliê próprio', 'Tinturaria Aurora']))
  })
})
