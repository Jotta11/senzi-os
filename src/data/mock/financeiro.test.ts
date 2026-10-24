import { reservationReceivables } from '@/domain/finance'
import { balance, round2 } from '@/domain/money'
import { addDays } from '@/lib/format'
import { createMockCtx } from './context'
import { financeiro } from './financeiro'
import { SourceError, type SourceErrorCode } from '../types'
import { FIN_CAT } from '../fixture/finance'

const TODAY = '2026-10-24'
const D = (n: number) => addDays(TODAY, n)
const ALL = { status: 'todas', origin: 'todas', categoryId: null, q: '', range: 'tudo' } as const
const PALL = { status: 'todas', categoryId: null, recurrence: 'todas', q: '', range: 'tudo' } as const

function setup() {
  const ctx = createMockCtx({ latencyMs: 0, today: TODAY })
  return { ctx, src: financeiro(ctx) }
}
async function code(p: Promise<unknown>): Promise<SourceErrorCode | undefined> {
  try {
    await p
  } catch (e) {
    return (e as SourceError).code
  }
}
const day = (s: string | null) => s!.slice(0, 10)

/** A fixture não traz caução paga: acrescenta uma na reserva confirmada. */
function addCaucao(ctx: ReturnType<typeof setup>['ctx'], amount: number) {
  const r = ctx.db.reservations.find((x) => x.state === 'confirmada')!
  r.payments.push({ id: 'cx', reservationId: r.id, kind: 'caucao', method: 'pix', amount, state: 'pago', paidAt: `${TODAY}T10:00:00-03:00`, dueAt: null, reference: null, notes: null, createdBy: 'u-julia', createdAt: `${TODAY}T10:00:00-03:00` })
}

describe('Financeiro — visão geral', () => {
  it('Recebido = sinal/saldo/integral/multa pagos − estornos de receita (+ avulsos); caução fica em custody; result = received − paid', async () => {
    const { ctx, src } = setup()
    addCaucao(ctx, 300)
    const o = await src.financeOverview('90')
    const from = D(-89)
    let exp = 0
    for (const r of ctx.db.reservations)
      for (const p of r.payments) {
        if (p.state !== 'pago' || day(p.paidAt) < from || day(p.paidAt) > TODAY) continue
        if (['sinal', 'saldo', 'integral', 'multa'].includes(p.kind)) exp += p.amount
        if (p.kind === 'estorno' && p.refersTo !== 'caucao') exp -= p.amount
      }
    for (const a of ctx.db.receivables) if (a.paidAmount > 0 && day(a.receivedAt) >= from) exp += a.paidAmount
    expect(o.received).toBe(round2(exp))
    expect(o.received).toBeGreaterThan(0)
    const caucao = round2(ctx.db.reservations.filter((r) => r.state !== 'rascunho').reduce((s, r) => s + balance(r.totalNet, r.lateFee, r.payments).caucao, 0))
    expect(o.custody).toBe(caucao)
    expect(o.custody).toBeGreaterThan(0)
    expect(o.result).toBe(round2(o.received - o.paid!))
    expect(o.operatingMargin).toBeCloseTo(1 - o.operatingCost! / o.received, 10)
    expect(o.monthly).toHaveLength(12)
    expect(o.monthly[11]!.k).toBe('2026-10')
  })

  it('caução paga não entra no Recebido; estorno de receita subtrai; estorno de caução não', async () => {
    const { ctx, src } = setup()
    const before = (await src.financeOverview('30')).received
    const r = ctx.db.reservations.find((x) => x.state === 'confirmada')!
    const base = { reservationId: r.id, method: 'pix' as const, state: 'pago' as const, paidAt: `${TODAY}T10:00:00-03:00`, dueAt: null, reference: null, notes: null, createdBy: 'u-julia', createdAt: `${TODAY}T10:00:00-03:00` }
    r.payments.push({ ...base, id: 'x1', kind: 'caucao', amount: 500 })
    expect((await src.financeOverview('30')).received).toBe(before)
    r.payments.push({ ...base, id: 'x2', kind: 'estorno', amount: 40, refersTo: 'caucao' })
    expect((await src.financeOverview('30')).received).toBe(before)
    r.payments.push({ ...base, id: 'x3', kind: 'estorno', amount: 40, refersTo: null })
    expect((await src.financeOverview('30')).received).toBe(round2(before - 40))
  })

  it('margem operacional é null quando o Recebido é 0', async () => {
    const { ctx, src } = setup()
    ctx.db.reservations.forEach((r) => (r.payments = []))
    ctx.db.receivables = []
    const o = await src.financeOverview('30')
    expect(o.received).toBe(0)
    expect(o.operatingMargin).toBeNull()
  })
})

describe('Financeiro — contas a receber', () => {
  it('saldo de reserva confirmada aparece com vencimento na retirada; caução isCustody e fora dos totais', async () => {
    const { ctx, src } = setup()
    addCaucao(ctx, 300)
    const r = ctx.db.reservations.find((x) => x.payments.some((p) => p.kind === 'saldo' && p.state === 'pendente') && x.state === 'confirmada')!
    const list = await src.listReceivables({ ...ALL, status: 'abertas' })
    const saldo = list.rows.find((x) => x.reservationId === r.id && x.kind === 'saldo')!
    expect(saldo.dueDate).toBe(r.pickupDate)
    expect(saldo.source).toBe('reserva')
    expect(saldo.description).toBe(`Saldo · ${r.code}`)
    const all = await src.listReceivables(ALL)
    const caucao = all.rows.filter((x) => x.kind === 'caucao')
    expect(caucao.length).toBeGreaterThan(0)
    expect(caucao.every((x) => x.isCustody)).toBe(true)
    expect(list.rows.some((x) => x.isCustody)).toBe(false)
    expect(list.totals.open).toBe(round2(list.rows.reduce((s, x) => s + x.amount - x.paidAmount, 0)))
  })

  it('pendências de reserva cancelada viram cancelado e saem das abertas', async () => {
    const { ctx, src } = setup()
    const r = ctx.db.reservations.find((x) => x.state === 'confirmada' && x.payments.some((p) => p.kind === 'saldo' && p.state === 'pendente'))!
    r.state = 'cancelada'
    const rows = reservationReceivables(ctx.db).filter((x) => x.reservationId === r.id)
    expect(rows.find((x) => x.kind === 'saldo')!.status).toBe('cancelado')
    const open = await src.listReceivables({ ...ALL, status: 'abertas' })
    expect(open.rows.some((x) => x.reservationId === r.id)).toBe(false)
  })

  it('avulso: criar valida, receber parcial/total, excede saldo, data futura e cancelar', async () => {
    const { src } = setup()
    const base = { description: 'Venda', categoryId: 'fc-venda', amount: 100, dueDate: D(3) }
    expect(await code(src.createReceivable({ ...base, description: ' ' }))).toBe('DESCRICAO_OBRIGATORIA')
    expect(await code(src.createReceivable({ ...base, categoryId: FIN_CAT.aquisicao }))).toBe('CATEGORIA_OBRIGATORIA')
    expect(await code(src.createReceivable({ ...base, amount: 0 }))).toBe('VALOR_INVALIDO')
    expect(await code(src.createReceivable({ ...base, dueDate: '' }))).toBe('VENCIMENTO_OBRIGATORIO')
    const r = await src.createReceivable(base)
    expect(r.status).toBe('aberto')
    expect(await code(src.receiveReceivable(r.id, { amount: 101, receivedAt: TODAY, method: 'pix' }))).toBe('VALOR_EXCEDE_SALDO')
    expect(await code(src.receiveReceivable(r.id, { amount: 50, receivedAt: D(1), method: 'pix' }))).toBe('DATA_FUTURA')
    expect((await src.receiveReceivable(r.id, { amount: 40, receivedAt: TODAY, method: 'pix' })).status).toBe('parcial')
    expect((await src.receiveReceivable(r.id, { amount: 60, receivedAt: TODAY, method: 'dinheiro' })).status).toBe('pago')
    expect(await code(src.cancelReceivable(r.id))).toBe('ESTADO_INVALIDO')
    const r2 = await src.createReceivable({ ...base, received: true, receivedAt: TODAY })
    expect(r2.status).toBe('pago')
    const r3 = await src.createReceivable(base)
    expect((await src.cancelReceivable(r3.id)).status).toBe('cancelado')
  })

  it('parcela de reserva não é editável nem baixável aqui', async () => {
    const { ctx, src } = setup()
    const p = reservationReceivables(ctx.db).find((x) => x.status === 'aberto')!
    expect(await code(src.receiveReceivable(p.id, { amount: 1, receivedAt: TODAY, method: 'pix' }))).toBe('ESTADO_INVALIDO')
    expect(await code(src.cancelReceivable('nada'))).toBe('NAO_ENCONTRADO')
  })

  it('vencidas: só com vencimento antes de hoje', async () => {
    const { src } = setup()
    const v = await src.listReceivables({ ...ALL, status: 'vencidas' })
    expect(v.rows.length).toBeGreaterThan(0)
    expect(v.rows.every((x) => x.dueDate < TODAY && x.status !== 'pago')).toBe(true)
    expect(v.totals.overdue).toBeGreaterThan(0)
  })
})

describe('Financeiro — contas a pagar', () => {
  it('pagar o aluguel mensal cria a ocorrência do mês seguinte (mesma descrição e valor)', async () => {
    const { ctx, src } = setup()
    const open = ctx.db.payables.find((p) => p.description === 'Aluguel da loja' && p.status === 'aberta')!
    const before = ctx.db.payables.length
    await src.payPayable(open.id, { paidAt: TODAY, paidAmount: open.amount, method: 'pix' })
    expect(ctx.db.payables).toHaveLength(before + 1)
    const next = ctx.db.payables.at(-1)!
    expect(next).toMatchObject({ description: 'Aluguel da loja', amount: open.amount, status: 'aberta', recurrence: 'mensal' })
    expect(next.dueDate.slice(8)).toBe('05')
    expect(next.dueDate > open.dueDate).toBe(true)
  })

  it('recorrência respeita a data final e fim de mês; não duplica', async () => {
    const { ctx, src } = setup()
    const p = await src.createPayable({ description: 'Seguro', categoryId: 'fc-outras-despesas', amount: 100, dueDate: '2026-01-31', recurrence: 'mensal', recurrenceEnd: '2026-02-28' })
    await src.payPayable(p.id, { paidAt: TODAY, paidAmount: 100, method: 'pix' })
    const n = ctx.db.payables.at(-1)!
    expect(n.dueDate).toBe('2026-02-28')
    await src.payPayable(n.id, { paidAt: TODAY, paidAmount: 100, method: 'pix' })
    expect(ctx.db.payables.at(-1)).toBe(n)
    expect(await code(src.createPayable({ description: 'x', categoryId: 'fc-aluguel', amount: 1, dueDate: D(5), recurrence: 'mensal', recurrenceEnd: D(1) }))).toBe('RECORRENCIA_FIM_INVALIDO')
  })

  it('baixa: valor > 0 (juros permitido), data não futura, só em aberto; já paga nasce paga', async () => {
    const { src } = setup()
    const p = await src.createPayable({ description: 'Luz', categoryId: 'fc-energia', amount: 100, dueDate: D(2) })
    expect(await code(src.payPayable(p.id, { paidAt: TODAY, paidAmount: 0, method: 'pix' }))).toBe('VALOR_INVALIDO')
    expect(await code(src.payPayable(p.id, { paidAt: D(1), paidAmount: 100, method: 'pix' }))).toBe('DATA_FUTURA')
    const paid = await src.payPayable(p.id, { paidAt: TODAY, paidAmount: 103.5, method: 'pix' })
    expect(paid).toMatchObject({ status: 'paga', paidAmount: 103.5 })
    expect(await code(src.payPayable(p.id, { paidAt: TODAY, paidAmount: 1, method: 'pix' }))).toBe('ESTADO_INVALIDO')
    expect((await src.createPayable({ description: 'Água', categoryId: 'fc-energia', amount: 50, dueDate: TODAY, paid: true, paidAt: TODAY })).status).toBe('paga')
  })

  it('despesas automáticas são somente leitura (editar/excluir → ESTADO_INVALIDO); manual exclui', async () => {
    const { ctx, src } = setup()
    const auto = ctx.db.payables.find((p) => p.source === 'aquisicao')!
    expect(await code(src.updatePayable(auto.id, { amount: 1 }))).toBe('ESTADO_INVALIDO')
    expect(await code(src.deletePayable(auto.id))).toBe('ESTADO_INVALIDO')
    const m = await src.createPayable({ description: 'Café', categoryId: 'fc-outras-despesas', amount: 20, dueDate: D(1) })
    expect((await src.updatePayable(m.id, { amount: 25 })).amount).toBe(25)
    expect(await code(src.updatePayable(m.id, { categoryId: 'fc-venda' }))).toBe('CATEGORIA_OBRIGATORIA')
    await src.deletePayable(m.id)
    expect(ctx.db.payables.some((p) => p.id === m.id)).toBe(false)
  })

  it('totais e filtros da lista', async () => {
    const { src } = setup()
    const abertas = await src.listPayables({ ...PALL, status: 'abertas' })
    expect(abertas.rows.every((p) => p.status === 'aberta')).toBe(true)
    expect(abertas.totals.open).toBe(round2(abertas.rows.reduce((s, p) => s + p.amount, 0)))
    const venc = await src.listPayables({ ...PALL, status: 'vencidas' })
    expect(venc.rows.every((p) => p.dueDate < TODAY)).toBe(true)
    const rec = await src.listPayables({ ...PALL, recurrence: 'recorrente', q: 'aluguel' })
    expect(rec.rows.length).toBeGreaterThan(0)
    const pagas30 = await src.listPayables({ ...PALL, status: 'pagas', range: '30' })
    expect(pagas30.rows.every((p) => day(p.paidAt) >= D(-29))).toBe(true)
  })
})

describe('Financeiro — categorias', () => {
  it('lista com contagem de uso; sistema não altera/exclui; em uso não exclui', async () => {
    const { src } = setup()
    const cats = await src.listFinCategories()
    expect(cats.find((c) => c.id === 'fc-aluguel')!.usageCount).toBeGreaterThan(0)
    expect(await code(src.deleteFinCategory(FIN_CAT.locacao))).toBe('CATEGORIA_SISTEMA')
    expect(await code(src.updateFinCategory(FIN_CAT.ajuste, { name: 'X' }))).toBe('CATEGORIA_SISTEMA')
    expect(await code(src.archiveFinCategory(FIN_CAT.ajuste))).toBe('CATEGORIA_SISTEMA')
    expect(await code(src.deleteFinCategory('fc-aluguel'))).toBe('CATEGORIA_EM_USO')
  })

  it('criar: nome único por tipo (sem acento/caixa), mesmo nome em outro tipo vale; arquivar some das escolhas; excluir sem uso', async () => {
    const { src } = setup()
    expect(await code(src.createFinCategory({ name: '  ', type: 'despesa' }))).toBe('NOME_OBRIGATORIO')
    expect(await code(src.createFinCategory({ name: 'ALUGUEL', type: 'despesa' }))).toBe('CATEGORIA_DUPLICADA')
    const c = await src.createFinCategory({ name: 'Aluguel', type: 'receita' })
    expect(c.isSystem).toBe(false)
    expect(await code(src.updateFinCategory(c.id, { name: 'venda de peça' }))).toBe('CATEGORIA_DUPLICADA')
    await src.archiveFinCategory(c.id)
    expect(await code(src.createReceivable({ description: 'x', categoryId: c.id, amount: 1, dueDate: TODAY }))).toBe('CATEGORIA_OBRIGATORIA')
    await src.deleteFinCategory(c.id)
    expect((await src.listFinCategories()).some((x) => x.id === c.id)).toBe(false)
  })

  it('mudar o tipo de categoria em uso → CATEGORIA_EM_USO', async () => {
    const { src } = setup()
    expect(await code(src.updateFinCategory('fc-aluguel', { type: 'receita' }))).toBe('CATEGORIA_EM_USO')
  })
})
