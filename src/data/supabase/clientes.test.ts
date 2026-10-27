import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError, type CustomerInput } from '../types'
import { supabaseClientes } from './clientes'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

function fakeClient(rpcImpl: (fn: string, args?: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const bucket = {
    createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://x/${p}?t=1`, error: null })), error: null })),
  }
  const client = {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => ({ data: null, error: null, ...rpcImpl(fn, args) })),
    storage: { from: vi.fn(() => bucket) },
  }
  return { client: client as unknown as SupabaseClient, rpc: client.rpc, bucket }
}

const input = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  fullName: 'Mariana Fontes Ribeiro',
  phone: '63996124478',
  birthDate: '1995-03-10',
  cpf: '52998224725',
  ...over,
})

describe('supabaseClientes', () => {
  it('busca e ficha chamam as RPCs com os parâmetros do app', async () => {
    const f = fakeClient((fn) => (fn === 'search_customers' ? { data: { items: [], total: 0 } } : { data: { id: ID } }))
    const src = supabaseClientes(f.client)
    await expect(src.searchCustomers('mari', 'gasto', { limit: 30, offset: 60 })).resolves.toEqual({ items: [], total: 0 })
    expect(f.rpc).toHaveBeenCalledWith('search_customers', { p_q: 'mari', p_sort: 'gasto', p_limit: 30, p_offset: 60 })
    await expect(src.getCustomer(ID)).resolves.toEqual({ id: ID })
    expect(f.rpc).toHaveBeenCalledWith('get_customer', { p_id: ID })
  })

  it('link com id que não é uuid → null sem chamar o banco', async () => {
    const f = fakeClient(() => ({}))
    await expect(supabaseClientes(f.client).getCustomer('cl-0001')).resolves.toBeNull()
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('cadastro valida antes de chamar o banco (todos os problemas de uma vez)', async () => {
    const f = fakeClient(() => ({}))
    const err = await supabaseClientes(f.client)
      .createCustomer({ fullName: '', phone: '123', birthDate: '', cpf: '111.111.111-11' })
      .catch((e: unknown) => e as SourceError)
    expect(err).toBeInstanceOf(SourceError)
    expect((err as SourceError).issues?.map((i) => i.code)).toEqual(['NOME_CLIENTE_OBRIGATORIO', 'TELEFONE_INVALIDO', 'NASCIMENTO_INVALIDO', 'CPF_INVALIDO'])
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('edição valida só os campos enviados e manda o input como está', async () => {
    const f = fakeClient(() => ({ data: { id: ID } }))
    const src = supabaseClientes(f.client)
    await src.updateCustomer(ID, { vip: true })
    expect(f.rpc).toHaveBeenCalledWith('update_customer', { p_id: ID, p: { vip: true } })
    await expect(src.updateCustomer(ID, { email: 'x@' })).rejects.toMatchObject({ code: 'EMAIL_INVALIDO', field: 'email' })
  })

  it('CPF repetido vem do banco como SourceError no campo cpf', async () => {
    const f = fakeClient(() => ({ error: { message: 'CPF_DUPLICADO', details: 'cpf', hint: '', code: 'P0001' } }))
    const err = await supabaseClientes(f.client).createCustomer(input()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err).toMatchObject({ code: 'CPF_DUPLICADO', field: 'cpf' })
    expect(f.rpc).toHaveBeenCalledWith('create_customer', { p: input() })
  })

  it('medidas fora da faixa e observação vazia não chegam ao banco', async () => {
    const f = fakeClient(() => ({}))
    const src = supabaseClientes(f.client)
    await expect(src.addMeasurement(ID, { heightCm: 400 })).rejects.toMatchObject({ code: 'PARAMETRO_INVALIDO', field: 'heightCm' })
    await expect(src.addNote(ID, '   ', 'presencial', false)).rejects.toMatchObject({ code: 'OBSERVACAO_OBRIGATORIA', field: 'content' })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('medidas, observações, fixar, favoritos e modelo ideal', async () => {
    const f = fakeClient(() => ({ data: { id: ID } }))
    const src = supabaseClientes(f.client)
    await src.addMeasurement(ID, { usualSize: 'M', bustCm: 88 })
    await src.addNote(ID, 'Prefere à noite.', 'whatsapp', true)
    await src.setNotePinned(ID, 'n1', false)
    await src.setFavorite(ID, 'g1', true)
    await src.idealMeasurements('g1')
    expect(f.rpc.mock.calls).toEqual([
      ['add_customer_measurement', { p_customer: ID, p: { usualSize: 'M', bustCm: 88 } }],
      ['add_customer_note', { p_customer: ID, p_content: 'Prefere à noite.', p_channel: 'whatsapp', p_pinned: true }],
      ['set_customer_note_pinned', { p_customer: ID, p_note: 'n1', p_pinned: false }],
      ['set_customer_favorite', { p_customer: ID, p_garment: 'g1', p_on: true }],
      ['ideal_measurements', { p_garment: 'g1' }],
    ])
  })

  it('recomendações: peças com URL assinada, pontuação e motivos', async () => {
    const garment = { id: 'g1', code: 'SZ-0001', name: 'Verona', photos: [{ id: 'p1', kind: 'frente', path: 'g1/a.jpg', isCover: true }], blocks: [], history: [] }
    const f = fakeClient(() => ({ data: [{ garment, score: 9, reasons: ['No tamanho dela (M)'] }] }))
    const recs = await supabaseClientes(f.client).recommend(ID)
    expect(f.rpc).toHaveBeenCalledWith('recommend_garments', { p_customer: ID, p_limit: 8 })
    expect(recs).toEqual([
      {
        garment: expect.objectContaining({ id: 'g1', photos: [{ id: 'p1', kind: 'frente', isCover: true, url: 'https://x/g1/a.jpg?t=1' }] }),
        score: 9,
        reasons: ['No tamanho dela (M)'],
      },
    ])
  })
})

describe('createSupabaseSource — clientes', () => {
  it('clientes no banco; reservas e provas da cliente vêm vazias', async () => {
    const f = fakeClient(() => ({ data: { items: [], total: 0 } }))
    const src = createSupabaseSource(f.client)
    await expect(src.searchCustomers('', 'nome', { limit: 10, offset: 0 })).resolves.toEqual({ items: [], total: 0 })
    await expect(src.reservationsOfCustomer(ID)).resolves.toEqual([])
    await expect(src.fittingsOfCustomer(ID)).resolves.toEqual([])
  })
})
