import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError, type InspectionInput } from '../types'
import { economicsOf } from './acervo'
import { supabaseOperacao } from './operacao'

const GID = '9b2f4c1e-2222-4a2b-8c3d-000000000002'
const MID = '9b2f4c1e-4444-4a2b-8c3d-000000000004'

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

const garment = (id = GID) => ({ id, code: 'SZ-0001', name: 'Vestido Verona', photos: [{ id: 'p1', kind: 'frente', path: `${id}/a.jpg`, isCover: true }], blocks: [], history: [] })
const row = (id = GID) => ({ garment: garment(id), order: null, blockNote: null, nextRentalStart: null, daysOpen: null, waitingDays: 0 })
const input: InspectionInput = {
  garmentId: GID,
  reservationId: null,
  findings: [],
  photos: [{ kind: 'devolucao' }],
  perda: false,
  maintenanceKind: 'costura',
  provider: null,
  openRepair: false,
  notes: null,
}

describe('supabaseOperacao', () => {
  it('fila: chama operacao_queue e assina as fotos das peças de todas as filas de uma vez', async () => {
    const other = '9b2f4c1e-2222-4a2b-8c3d-000000000003'
    const f = fakeClient(() => ({
      data: { inspecao: [row()], higienizacao: [], ajuste: [], manutencao: [row(other)], bloqueado: [], openOrders: [], costLast30d: null },
    }))
    const q = await supabaseOperacao(f.client).operacaoQueue()
    expect(f.rpc).toHaveBeenCalledWith('operacao_queue', undefined)
    expect(f.bucket.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(q.inspecao[0]!.garment.photos[0]!.url).toBe(`https://x/${GID}/a.jpg?t=1`)
    expect(q.manutencao[0]!.garment.photos[0]!.url).toBe(`https://x/${other}/a.jpg?t=1`)
    expect(q.inspecao[0]!.waitingDays).toBe(0)
    expect(q.costLast30d).toBeNull()
  })

  it('leituras e escritas chamam as RPCs com os parâmetros do app', async () => {
    const f = fakeClient((fn) => {
      if (fn === 'register_inspection') return { data: { result: 'aprovada', garment: garment() } }
      if (fn === 'close_maintenance' || fn === 'release_garment') return { data: garment() }
      if (fn === 'operacao_suppliers') return { data: ['Ateliê próprio'] }
      return { data: [] }
    })
    const src = supabaseOperacao(f.client)
    await src.checklist()
    await src.inspectionTarget(GID)
    const insp = await src.registerInspection(input)
    const closed = await src.closeMaintenance({ maintenanceId: MID, cost: 58, provider: null, note: null, release: true })
    await src.releaseGarment(GID, 'Liberada pela Operação')
    expect(await src.suppliers()).toEqual(['Ateliê próprio'])
    expect(f.rpc.mock.calls).toEqual([
      ['operacao_checklist', undefined],
      ['inspection_target', { p_garment: GID }],
      ['register_inspection', { p: input }],
      ['close_maintenance', { p: { maintenanceId: MID, cost: 58, provider: null, note: null, release: true } }],
      ['release_garment', { p_garment: GID, p_note: 'Liberada pela Operação' }],
      ['operacao_suppliers', undefined],
    ])
    expect(insp.result).toBe('aprovada')
    expect(insp.garment.photos[0]!.url).toMatch(/^https:\/\/x\//)
    expect(closed.photos[0]!.url).toMatch(/^https:\/\/x\//)
  })

  it('histórico da peça: fotos com arquivo assinadas, só tipo fica sem URL; id que não é uuid não chega ao banco', async () => {
    const insp = {
      id: 'i1',
      garmentId: GID,
      reservationId: null,
      inspectedAt: '2026-10-24T10:00:00-03:00',
      inspectorId: 'u1',
      inspectorName: 'Bia',
      result: 'ressalva',
      findings: [],
      notes: null,
      photos: [
        { id: 'f1', kind: 'dano', path: `${GID}/dano.jpg` },
        { id: 'f2', kind: 'devolucao', path: null },
      ],
    }
    const f = fakeClient(() => ({ data: { maintenances: [{ id: MID, cost: null }], inspections: [insp] } }))
    const src = supabaseOperacao(f.client)
    const out = await src.maintenancesOf(GID)
    expect(f.rpc).toHaveBeenCalledWith('maintenances_of', { p_garment: GID })
    expect(f.bucket.createSignedUrls).toHaveBeenCalledWith([`${GID}/dano.jpg`], expect.any(Number))
    expect(out.maintenances[0]!.cost).toBeNull()
    expect(out.inspections[0]!.photos).toEqual([
      { id: 'f1', kind: 'dano', url: `https://x/${GID}/dano.jpg?t=1` },
      { id: 'f2', kind: 'devolucao', url: '' },
    ])
    f.rpc.mockClear()
    expect(await src.maintenancesOf('g-1')).toEqual({ maintenances: [], inspections: [] })
    expect(await src.inspectionTarget('g-1')).toBeNull()
    await expect(src.releaseGarment('g-1', '')).rejects.toMatchObject({ code: 'PECA_NAO_ENCONTRADA' })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('erros do banco viram SourceError com código e campo', async () => {
    const f = fakeClient(() => ({ error: { message: 'CUSTO_INVALIDO', details: 'cost', hint: null } }))
    const err = await supabaseOperacao(f.client)
      .closeMaintenance({ maintenanceId: MID, cost: -1, provider: null, note: null, release: false })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err).toMatchObject({ code: 'CUSTO_INVALIDO', field: 'cost' })
    const denied = fakeClient(() => ({ error: { message: 'SEM_PERMISSAO', details: null, hint: null } }))
    await expect(supabaseOperacao(denied.client).operacaoQueue()).rejects.toMatchObject({ code: 'SEM_PERMISSAO' })
  })

  it('economia da peça soma higienização e manutenção de garment_costs', () => {
    const e = economicsOf({ garment_id: GID, acquisition_cost: '900.00', rentals: 2, revenue: '1080.50', last_rental: '2026-10-20', cleaning: '58.00', maintenance: '120.46' }, '2026-10-27')
    expect(e).toMatchObject({ cleaning: 58, maintenance: 120.46, result: 2.04, paidBack: true })
  })

  it('a fonte do Supabase tem todos os métodos da Operação (sem stub)', async () => {
    const f = fakeClient(() => ({ data: { maintenances: [], inspections: [] } }))
    const src = createSupabaseSource(f.client)
    for (const k of ['operacaoQueue', 'checklist', 'inspectionTarget', 'registerInspection', 'closeMaintenance', 'releaseGarment', 'maintenancesOf', 'suppliers'])
      expect(k in src).toBe(true)
    await src.maintenancesOf(GID)
    expect(f.rpc).toHaveBeenCalledWith('maintenances_of', { p_garment: GID })
  })
})
