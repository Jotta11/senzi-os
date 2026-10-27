import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError } from '../types'
import { supabaseAgenda } from './agenda'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const CID = '9b2f4c1e-1111-4a2b-8c3d-000000000001'

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

const garment = { id: 'g1', code: 'SZ-0001', name: 'Verona', photos: [{ id: 'p1', kind: 'frente', path: 'g1/a.jpg', isCover: true }], blocks: [], history: [] }
const rawDetail = {
  session: { id: ID, code: 'PR-2026-0001', state: 'em_curso' },
  customer: { id: CID },
  attendantName: 'Ana',
  items: [{ fittingSessionId: ID, garmentId: 'g1', position: 0, outcome: 'gostou', needsAlteration: false, note: null, recordedBy: null, recordedAt: null, favorite: false, garment }],
  reservation: null,
}

describe('supabaseAgenda', () => {
  it('leituras chamam as RPCs com os parâmetros do app', async () => {
    const f = fakeClient(() => ({ data: [] }))
    const src = supabaseAgenda(f.client)
    await src.agendaRange('2026-10-24', '2026-10-30')
    await src.agendaMonthDays('2026-10')
    await src.listUsers()
    await src.listFittings('perdidas', { limit: 20, offset: 40 })
    await src.fittingKpis()
    await src.fittingsOfCustomer(CID)
    await src.fittingsOfGarment('g1')
    await src.fittingStatsOf('g1')
    expect(f.rpc.mock.calls).toEqual([
      ['agenda_range', { p_from: '2026-10-24', p_to: '2026-10-30' }],
      ['agenda_month_days', { p_month: '2026-10' }],
      ['list_staff', undefined],
      ['list_fittings', { p_filter: 'perdidas', p_limit: 20, p_offset: 40 }],
      ['fitting_kpis', undefined],
      ['fittings_of_customer', { p_customer: CID }],
      ['fittings_of_garment', { p_garment: 'g1' }],
      ['fitting_stats_of', { p_garment: 'g1' }],
    ])
  })

  it('detalhe da prova: fotos das peças assinadas; id que não é uuid → null sem chamar o banco', async () => {
    const f = fakeClient(() => ({ data: rawDetail }))
    const src = supabaseAgenda(f.client)
    const d = (await src.getFitting(ID))!
    expect(f.rpc).toHaveBeenCalledWith('get_fitting', { p_id: ID })
    expect(d.items[0]!.garment.photos).toEqual([{ id: 'p1', kind: 'frente', isCover: true, url: 'https://x/g1/a.jpg?t=1' }])
    expect(d.session.code).toBe('PR-2026-0001')
    await expect(src.getFitting('fit-1')).resolves.toBeNull()
    expect(f.rpc).toHaveBeenCalledTimes(1)
  })

  it('mutações da prova devolvem o detalhe; resultado só manda as chaves informadas (note: null apaga)', async () => {
    const f = fakeClient(() => ({ data: rawDetail }))
    const src = supabaseAgenda(f.client)
    await src.addFittingGarment(ID, 'g1')
    await src.removeFittingGarment(ID, 'g1')
    await src.setFittingOutcome(ID, 'g1', { outcome: 'favorita', needsAlteration: undefined, note: undefined })
    await src.setFittingOutcome(ID, 'g1', { note: null })
    const d = await src.closeFitting(ID, 'no_show', null)
    expect(d.items[0]!.garment.photos[0]!.url).toBe('https://x/g1/a.jpg?t=1')
    expect(f.rpc.mock.calls).toEqual([
      ['add_fitting_garment', { p_id: ID, p_garment: 'g1' }],
      ['remove_fitting_garment', { p_id: ID, p_garment: 'g1' }],
      ['set_fitting_outcome', { p_id: ID, p_garment: 'g1', p: { outcome: 'favorita' } }],
      ['set_fitting_outcome', { p_id: ID, p_garment: 'g1', p: { note: null } }],
      ['close_fitting', { p_id: ID, p_state: 'no_show', p_notes: null }],
    ])
  })

  it('compromisso valida antes do banco (todos os problemas de uma vez)', async () => {
    const f = fakeClient(() => ({ data: { id: 'a1' } }))
    const src = supabaseAgenda(f.client)
    const err = await src.createAppointment({ date: '', time: '', kind: 'interno', customerId: null, notes: ' ' }).catch((e: unknown) => e as SourceError)
    expect(err).toBeInstanceOf(SourceError)
    expect((err as SourceError).issues?.map((i) => i.code)).toEqual(['DATA_OBRIGATORIA', 'HORARIO_OBRIGATORIO', 'OBSERVACAO_OBRIGATORIA'])
    await expect(src.updateAppointment('a1', { date: '2026-10-24', time: '10:00', kind: 'atendimento', customerId: null, notes: null })).rejects.toMatchObject({
      code: 'CLIENTE_OBRIGATORIA',
      field: 'customerId',
    })
    expect(f.rpc).not.toHaveBeenCalled()
    const input = { date: '2026-10-24', time: '10:00', kind: 'atendimento' as const, customerId: CID, notes: null }
    await src.createAppointment(input)
    await src.updateAppointment('a1', input)
    await src.cancelAppointment('a1')
    expect(f.rpc.mock.calls).toEqual([
      ['create_appointment', { p: input }],
      ['update_appointment', { p_id: 'a1', p: input }],
      ['cancel_appointment', { p_id: 'a1' }],
    ])
  })

  it('prova nova: valida a prova e depois a cliente nova; erros do banco viram SourceError', async () => {
    const f = fakeClient(() => ({ error: { message: 'CPF_DUPLICADO', details: 'cpf', hint: '', code: 'P0001' } }))
    const src = supabaseAgenda(f.client)
    await expect(src.createFitting({ date: '2026-10-24' })).rejects.toMatchObject({ code: 'CLIENTE_OBRIGATORIA', field: 'customerId' })
    await expect(src.createFitting({ customerId: CID, date: '2026-10-24', eventDate: '2026-10-01' })).rejects.toMatchObject({ code: 'DATAS_INCOERENTES' })
    const nc = await src.createFitting({ newCustomer: { fullName: '', phone: '1', birthDate: '', cpf: '1' }, date: '2026-10-24' }).catch((e: unknown) => e as SourceError)
    expect((nc as SourceError).issues?.map((i) => i.code)).toEqual(['NOME_CLIENTE_OBRIGATORIO', 'TELEFONE_INVALIDO', 'NASCIMENTO_INVALIDO', 'CPF_INVALIDO'])
    expect(f.rpc).not.toHaveBeenCalled()
    const input = { newCustomer: { fullName: 'Helena Prado', phone: '63991112233', birthDate: '1990-05-10', cpf: '52998224725' }, date: '2026-10-24' }
    await expect(src.createFitting(input)).rejects.toMatchObject({ code: 'CPF_DUPLICADO', field: 'cpf' })
    expect(f.rpc).toHaveBeenCalledWith('create_fitting', { p: input })
  })
})

describe('createSupabaseSource — agenda', () => {
  it('agenda e provas no banco; provas da cliente vêm da RPC', async () => {
    const f = fakeClient(() => ({ data: [] }))
    const src = createSupabaseSource(f.client)
    await expect(src.fittingsOfCustomer(CID)).resolves.toEqual([])
    expect(f.rpc).toHaveBeenCalledWith('fittings_of_customer', { p_customer: CID })
    await expect(src.reservationsOfCustomer(CID)).resolves.toEqual([])
  })
})
