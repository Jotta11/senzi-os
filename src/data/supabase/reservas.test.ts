import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, todayISO } from '@/lib/format'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError, type ReservationInput } from '../types'
import { economicsOf, supabaseAcervo } from './acervo'
import { supabaseReservas } from './reservas'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const CID = '9b2f4c1e-1111-4a2b-8c3d-000000000001'
const GID = '9b2f4c1e-2222-4a2b-8c3d-000000000002'
const EXC = '9b2f4c1e-3333-4a2b-8c3d-000000000003'

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

const garment = { id: GID, code: 'SZ-0001', name: 'Vestido Verona', photos: [{ id: 'p1', kind: 'frente', path: `${GID}/a.jpg`, isCover: true }], blocks: [], history: [] }
const today = todayISO()
const input: ReservationInput = {
  customerId: CID,
  pickupDate: addDays(today, 3),
  eventDate: addDays(today, 4),
  returnDueDate: addDays(today, 5),
  discount: 0,
  items: [{ garmentId: GID, unitPrice: 450 }],
}

describe('supabaseReservas', () => {
  it('leituras chamam as RPCs com os parâmetros do app', async () => {
    const f = fakeClient((fn) => ({ data: fn === 'check_availability' ? [{ garmentId: GID, ok: true }, { garmentId: '00000000-0000-0000-0000-000000000000', ok: false }] : [] }))
    const src = supabaseReservas(f.client)
    await src.listReservations('encerradas', { limit: 50, offset: 100 })
    await src.reservationSummary()
    const av = await src.checkAvailability([GID, 'g-x'], '2026-11-01', '2026-11-03', ID)
    await src.reservationsOfCustomer(CID)
    await src.reservationsOfGarment(GID)
    await src.getSettings()
    await src.listActiveAdmins()
    expect(f.rpc.mock.calls).toEqual([
      ['list_reservations', { p_filter: 'encerradas', p_limit: 50, p_offset: 100 }],
      ['reservation_summary', undefined],
      ['check_availability', { p_garments: [GID, '00000000-0000-0000-0000-000000000000'], p_pickup: '2026-11-01', p_return: '2026-11-03', p_ignore: ID }],
      ['reservations_of_customer', { p_customer: CID }],
      ['reservations_of_garment', { p_garment: GID }],
      ['get_settings', undefined],
      ['list_active_admins', undefined],
    ])
    // A resposta mantém o id pedido, mesmo o que não é uuid.
    expect(av.map((a) => a.garmentId)).toEqual([GID, 'g-x'])
    await expect(src.reservationsOfCustomer('c-1')).resolves.toEqual([])
  })

  it('ficha: fotos das peças assinadas; id que não é uuid → null sem chamar o banco', async () => {
    const f = fakeClient(() => ({ data: { id: ID, code: 'RS-2026-0001', garments: [garment], customer: { id: CID } } }))
    const src = supabaseReservas(f.client)
    const d = (await src.getReservation(ID))!
    expect(f.rpc).toHaveBeenCalledWith('get_reservation', { p_id: ID })
    expect(d.garments[0]!.photos).toEqual([{ id: 'p1', kind: 'frente', isCover: true, url: `https://x/${GID}/a.jpg?t=1` }])
    await expect(src.getReservation('res-1')).resolves.toBeNull()
    expect(f.rpc).toHaveBeenCalledTimes(1)
    const alt = await supabaseReservas(fakeClient(() => ({ data: [garment] })).client).alternatives(GID, '2026-11-01', '2026-11-03')
    expect(alt[0]!.photos[0]!.url).toContain('https://x/')
  })

  it('rascunho: valida tudo antes da RPC (todos os problemas, texto do desconto) e manda a exceção', async () => {
    const f = fakeClient(() => ({ data: { id: ID } }))
    const src = supabaseReservas(f.client)
    const err = await src.createDraft({ ...input, customerId: '', items: [], discount: -1 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect((err as SourceError).issues!.map((i) => i.code)).toEqual(['RESERVA_SEM_CLIENTE', 'RESERVA_SEM_PECAS', 'DESCONTO_NEGATIVO'])
    const big = (await src.createDraft({ ...input, discount: 500 }).catch((e: unknown) => e)) as SourceError
    expect(big).toMatchObject({ code: 'DESCONTO_MAIOR_QUE_BRUTO', field: 'discount', hint: 'O desconto (R$ 500,00) é maior que o valor das peças (R$ 450,00).' })
    expect(f.rpc).not.toHaveBeenCalled()

    await src.createDraft(input, EXC)
    await src.updateDraft(ID, input)
    await src.addDraftItem(ID, GID)
    await src.removeDraftItem(ID, 'i1')
    const sign = await src.markContractSigned(ID, { signedAt: addDays(today, 1), signerName: ' ', notes: null }).catch((e: SourceError) => e)
    expect((sign as SourceError).issues!.map((i) => [i.code, i.field])).toEqual([
      ['DATA_FUTURA', 'signedAt'],
      ['NOME_CLIENTE_OBRIGATORIO', 'signerName'],
    ])
    await src.markContractSigned(ID, { signedAt: today, signerName: 'Maria', notes: null })
    expect(f.rpc.mock.calls).toEqual([
      ['create_reservation_draft', { p: input, p_exception: EXC }],
      ['update_reservation_draft', { p_id: ID, p: input, p_exception: null }],
      ['add_reservation_draft_item', { p_id: ID, p_garment: GID }],
      ['remove_reservation_draft_item', { p_id: ID, p_item: 'i1' }],
      ['sign_reservation_contract', { p_id: ID, p: { signedAt: today, signerName: 'Maria', notes: null } }],
    ])
  })

  it('ciclo e pagamentos: parâmetros das RPCs; erro do banco vira SourceError com campo e detalhe', async () => {
    const f = fakeClient((fn) =>
      fn === 'pickup_reservation_items'
        ? { error: { message: 'SALDO_EM_ABERTO', details: null, hint: 'R$ 225,00', code: 'P0001' } }
        : { data: fn === 'confirm_reservation' ? { ok: false, conflicts: [] } : { id: ID } },
    )
    const src = supabaseReservas(f.client)
    const signal = { amount: 225, method: 'pix' as const, reference: null, notes: null }
    await expect(src.confirmReservation(ID, signal)).resolves.toEqual({ ok: false, conflicts: [] })
    await src.markReady(ID)
    const e = await src.pickupItems(ID, [{ itemId: 'i1', delivered: true }], EXC).catch((x: SourceError) => x)
    expect(e).toMatchObject({ code: 'SALDO_EM_ABERTO', hint: 'R$ 225,00' })
    await src.returnItems(ID, [{ itemId: 'i1', returned: true }])
    await src.cancelReservation(ID, 'Desistiu')
    await src.markNoShow(ID)
    const pay = { kind: 'saldo' as const, method: 'pix' as const, amount: 100, reference: null, notes: null }
    await src.registerPayment(ID, pay)
    await src.returnDeposit(ID, 'pix', { amount: 80, reason: 'Mancha' })
    await src.returnDeposit(ID, 'dinheiro')
    expect(f.rpc.mock.calls).toEqual([
      ['confirm_reservation', { p_id: ID, p: signal, p_exception: null }],
      ['mark_reservation_ready', { p_id: ID }],
      ['pickup_reservation_items', { p_id: ID, p_decisions: [{ itemId: 'i1', delivered: true }], p_exception: EXC }],
      ['return_reservation_items', { p_id: ID, p_decisions: [{ itemId: 'i1', returned: true }] }],
      ['cancel_reservation', { p_id: ID, p_reason: 'Desistiu' }],
      ['mark_reservation_no_show', { p_id: ID }],
      ['register_reservation_payment', { p_id: ID, p: pay }],
      ['return_reservation_deposit', { p_id: ID, p_method: 'pix', p_retain: { amount: 80, reason: 'Mancha' } }],
      ['return_reservation_deposit', { p_id: ID, p_method: 'dinheiro', p_retain: null }],
    ])
  })

  it('autorização de exceção: id provisório do rascunho vai como null; falha (devolvida ou lançada) volta no retorno', async () => {
    let reply: { data?: unknown; error?: unknown } = { data: { ok: true, id: EXC } }
    const f = fakeClient(() => reply)
    const src = supabaseReservas(f.client)
    const args = { email: 'ana@senzi.test', pin: '1234', kind: 'desconto_acima_limite' as const, reason: 'Cliente antiga', refType: 'reserva_rascunho', refId: 'tmp-:r1:', maxAmount: 144 }
    await expect(src.authorizeException(args)).resolves.toEqual({ ok: true, id: EXC })
    expect(f.rpc).toHaveBeenCalledWith('authorize_exception', {
      p_admin_email: 'ana@senzi.test',
      p_pin: '1234',
      p_kind: 'desconto_acima_limite',
      p_reason: 'Cliente antiga',
      p_ref_type: 'reserva_rascunho',
      p_ref_id: null,
      p_max_amount: 144,
    })
    reply = { data: { ok: false, error: 'PIN_BLOQUEADO' } }
    await expect(src.authorizeException({ ...args, refType: 'reserva', refId: ID })).resolves.toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
    expect(f.rpc).toHaveBeenLastCalledWith('authorize_exception', expect.objectContaining({ p_ref_id: ID }))
    await src.authorizeException({ ...args, kind: 'retirada_com_saldo', maxAmount: undefined })
    expect(f.rpc).toHaveBeenLastCalledWith('authorize_exception', expect.objectContaining({ p_max_amount: null }))
    reply = { error: { message: 'MOTIVO_OBRIGATORIO' } }
    await expect(src.authorizeException(args)).resolves.toEqual({ ok: false, error: 'MOTIVO_OBRIGATORIO' })
  })

  it('economia da peça: locações, receita e última locação de garment_costs', async () => {
    const f = fakeClient(() => ({ data: [{ garment_id: GID, acquisition_cost: '900.00', rentals: 2, revenue: '1080.50', last_rental: '2026-10-20' }] }))
    const [e] = await supabaseAcervo(f.client).garmentEconomics([GID])
    expect(f.rpc).toHaveBeenCalledWith('garment_costs', { p_ids: [GID] })
    expect(e).toMatchObject({ garmentId: GID, rentals: 2, revenue: 1080.5, acquisitionCost: 900, paidBack: true, cleaning: 0, maintenance: 0, result: 180.5, lastRental: '2026-10-20' })
    expect(economicsOf({ garment_id: GID, acquisition_cost: null, rentals: 0, revenue: 0, last_rental: null }, '2026-10-27')).toMatchObject({
      payback: null,
      paidBack: false,
      idleDays: null,
    })
    expect(economicsOf({ garment_id: GID, acquisition_cost: 100, rentals: 1, revenue: 50, last_rental: '2026-10-20' }, '2026-10-27')).toMatchObject({ payback: 0.5, idleDays: 7 })
  })

  it('a fonte do Supabase tem todos os métodos de Reservas e exceções (sem stub)', () => {
    const src = createSupabaseSource(fakeClient(() => ({})).client)
    for (const k of ['listReservations', 'getReservation', 'createDraft', 'confirmReservation', 'pickupItems', 'returnDeposit', 'getSettings', 'listActiveAdmins', 'authorizeException'])
      expect(k in src).toBe(true)
  })
})
