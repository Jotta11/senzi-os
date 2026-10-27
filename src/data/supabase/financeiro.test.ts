import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, todayISO } from '@/lib/format'
import type { PayableFilter, ReceivableFilter } from '../source-financeiro'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError } from '../types'
import { supabaseFinanceiro } from './financeiro'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const CAT = '9b2f4c1e-1111-4a2b-8c3d-000000000001'
const today = todayISO()

function fakeClient(rpcImpl: (fn: string, args?: Record<string, unknown>) => { data?: unknown; error?: unknown } = () => ({})) {
  const client = { rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => ({ data: null, error: null, ...rpcImpl(fn, args) })) }
  return { client: client as unknown as SupabaseClient, rpc: client.rpc }
}
const codes = (e: unknown) => (e as SourceError).issues!.map((i) => [i.code, i.field])

const RF: ReceivableFilter = { status: 'abertas', origin: 'todas', categoryId: CAT, q: 'ana', range: 'tudo' }
const PF: PayableFilter = { status: 'pagas', categoryId: null, recurrence: 'todas', q: '', range: '30' }
const LIST = { rows: [{ id: ID }], total: 1, totals: { open: 10, overdue: 0, dueIn7: 0, receivedInRange: 0 }, today }

describe('supabaseFinanceiro', () => {
  it('leituras chamam as RPCs com os parâmetros do app', async () => {
    const f = fakeClient((fn) => ({ data: fn.startsWith('list_') && fn !== 'list_fin_categories' ? LIST : [] }))
    const src = supabaseFinanceiro(f.client)
    await src.financeOverview('90')
    await src.listReceivables(RF)
    await src.listPayables(PF)
    await src.listFinCategories()
    expect(f.rpc.mock.calls).toEqual([
      ['finance_overview', { p_range: '90' }],
      ['list_receivables', { p_filter: RF }],
      ['list_payables', { p_filter: PF }],
      ['list_fin_categories', undefined],
    ])
  })

  it('filtro por categoria que não existe no banco: lista vazia, totais mantidos', async () => {
    const f = fakeClient(() => ({ data: LIST }))
    const list = await supabaseFinanceiro(f.client).listReceivables({ ...RF, categoryId: 'fc-venda' })
    expect(f.rpc).toHaveBeenCalledWith('list_receivables', { p_filter: { ...RF, categoryId: null } })
    expect(list).toEqual({ ...LIST, rows: [], total: 0 })
  })

  it('formulários: todos os problemas de uma vez, antes da RPC', async () => {
    const f = fakeClient()
    const src = supabaseFinanceiro(f.client)
    const rec = await src.createReceivable({ description: ' ', categoryId: '', amount: 0, dueDate: '', received: true, receivedAt: addDays(today, 1) }).catch((e: unknown) => e)
    expect(rec).toBeInstanceOf(SourceError)
    expect(codes(rec)).toEqual([
      ['DESCRICAO_OBRIGATORIA', 'description'],
      ['CATEGORIA_OBRIGATORIA', 'categoryId'],
      ['VALOR_INVALIDO', 'amount'],
      ['VENCIMENTO_OBRIGATORIO', 'dueDate'],
      ['DATA_FUTURA', 'receivedAt'],
    ])
    const pay = await src
      .createPayable({ description: 'Luz', categoryId: CAT, amount: 10, dueDate: today, recurrence: 'mensal', recurrenceEnd: addDays(today, -1), paid: true })
      .catch((e: unknown) => e)
    expect(codes(pay)).toEqual([
      ['RECORRENCIA_FIM_INVALIDO', 'recurrenceEnd'],
      ['DATA_OBRIGATORIA', 'paidAt'],
    ])
    expect(codes(await src.payPayable(ID, { paidAt: '', paidAmount: 0, method: 'pix' }).catch((e: unknown) => e))).toEqual([
      ['VALOR_INVALIDO', 'paidAmount'],
      ['DATA_OBRIGATORIA', 'paidAt'],
    ])
    expect(codes(await src.receiveReceivable(ID, { amount: -1, receivedAt: today, method: 'pix' }).catch((e: unknown) => e))).toEqual([['VALOR_INVALIDO', 'amount']])
    // Edição parcial: só os campos enviados.
    expect(codes(await src.updatePayable(ID, { description: '' }).catch((e: unknown) => e))).toEqual([['DESCRICAO_OBRIGATORIA', 'description']])
    expect(codes(await src.updateReceivable(ID, { categoryId: '' }).catch((e: unknown) => e))).toEqual([['CATEGORIA_OBRIGATORIA', 'categoryId']])
    await expect(src.createFinCategory({ name: ' ', type: 'receita' })).rejects.toMatchObject({ code: 'NOME_CATEGORIA_OBRIGATORIO', field: 'name' })
    await expect(src.updateFinCategory(ID, { name: '' })).rejects.toMatchObject({ code: 'NOME_CATEGORIA_OBRIGATORIO' })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('escritas chamam as RPCs; id que não é uuid → NAO_ENCONTRADO sem ir ao banco', async () => {
    const f = fakeClient(() => ({ data: { id: ID } }))
    const src = supabaseFinanceiro(f.client)
    const rin = { description: 'Venda', categoryId: CAT, amount: 100, dueDate: today }
    const pin = { description: 'Luz', categoryId: CAT, amount: 100, dueDate: today }
    await src.createReceivable(rin)
    await src.updateReceivable(ID, { amount: 120 })
    await src.receiveReceivable(ID, { amount: 10, receivedAt: today, method: 'pix' })
    await src.cancelReceivable(ID)
    await src.createPayable(pin)
    await src.updatePayable(ID, { notes: 'x' })
    await src.payPayable(ID, { paidAt: today, paidAmount: 100, method: 'dinheiro' })
    await expect(src.deletePayable(ID)).resolves.toBeUndefined()
    await src.createFinCategory({ name: 'Seguro', type: 'despesa' })
    await src.updateFinCategory(ID, { color: '#112233' })
    await src.archiveFinCategory(ID)
    await src.archiveFinCategory(ID, false)
    await expect(src.deleteFinCategory(ID)).resolves.toBeUndefined()
    expect(f.rpc.mock.calls).toEqual([
      ['create_receivable', { p: rin }],
      ['update_receivable', { p_id: ID, p: { amount: 120 } }],
      ['receive_receivable', { p_id: ID, p: { amount: 10, receivedAt: today, method: 'pix' } }],
      ['cancel_receivable', { p_id: ID }],
      ['create_payable', { p: pin }],
      ['update_payable', { p_id: ID, p: { notes: 'x' } }],
      ['pay_payable', { p_id: ID, p: { paidAt: today, paidAmount: 100, method: 'dinheiro' } }],
      ['delete_payable', { p_id: ID }],
      ['create_fin_category', { p: { name: 'Seguro', type: 'despesa' } }],
      ['update_fin_category', { p_id: ID, p: { color: '#112233' } }],
      ['archive_fin_category', { p_id: ID, p_archived: true }],
      ['archive_fin_category', { p_id: ID, p_archived: false }],
      ['delete_fin_category', { p_id: ID }],
    ])
    f.rpc.mockClear()
    for (const p of [src.cancelReceivable('rc-1'), src.deletePayable('pg-1'), src.archiveFinCategory('fc-1'), src.payPayable('pg-1', { paidAt: today, paidAmount: 1, method: 'pix' })])
      await expect(p).rejects.toMatchObject({ code: 'NAO_ENCONTRADO' })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('erro do banco vira SourceError com campo e detalhe; SEM_PERMISSAO também', async () => {
    const f = fakeClient((fn) => ({
      error: fn === 'receive_receivable' ? { message: 'VALOR_EXCEDE_SALDO', details: 'amount', hint: 'R$ 60,00', code: 'P0001' } : { message: 'SEM_PERMISSAO', details: null, hint: null, code: 'P0001' },
    }))
    const src = supabaseFinanceiro(f.client)
    await expect(src.receiveReceivable(ID, { amount: 70, receivedAt: today, method: 'pix' })).rejects.toMatchObject({ code: 'VALOR_EXCEDE_SALDO', field: 'amount', hint: 'R$ 60,00' })
    await expect(src.listFinCategories()).rejects.toMatchObject({ code: 'SEM_PERMISSAO' })
  })

  it('entra na fonte do Supabase', () => {
    const live = createSupabaseSource(fakeClient().client)
    for (const k of ['financeOverview', 'listReceivables', 'createReceivable', 'listPayables', 'payPayable', 'listFinCategories', 'deleteFinCategory']) expect(k in live).toBe(true)
  })
})
