import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError } from '../types'
import { PHOTO_BUCKET, supabaseAcervo } from './acervo'

const raw = (photos: { id: string; path: string; isCover: boolean }[] = []) => ({
  id: 'g1',
  code: 'SZ-0001',
  name: 'Verona',
  photos: photos.map((p) => ({ ...p, kind: 'frente' })),
  blocks: [],
  history: [],
})

function fakeClient(rpcImpl: (fn: string, args?: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const bucket = {
    createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://x/${p}?t=1`, error: null })), error: null })),
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
  }
  const client = {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => ({ data: null, error: null, ...rpcImpl(fn, args) })),
    storage: { from: vi.fn(() => bucket) },
  }
  return { client: client as unknown as SupabaseClient, rpc: client.rpc, bucket, from: client.storage.from }
}

const image = (type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], 'f', { type })

describe('supabaseAcervo', () => {
  it('troca o caminho das fotos por URL assinada e reaproveita a assinatura', async () => {
    const f = fakeClient(() => ({ data: raw([{ id: 'p1', path: 'g1/a.jpg', isCover: true }]) }))
    const src = supabaseAcervo(f.client)
    const g = await src.getGarment('g1')
    expect(g!.photos).toEqual([{ id: 'p1', kind: 'frente', isCover: true, url: 'https://x/g1/a.jpg?t=1' }])
    expect(f.from).toHaveBeenCalledWith(PHOTO_BUCKET)
    await src.getGarment('g1')
    expect(f.bucket.createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('erro de regra do banco vira SourceError com campo e detalhe', async () => {
    const f = fakeClient(() => ({ error: { message: 'CONFLITO_AGENDA', details: 'from', hint: '10/01/2030 – 12/01/2030', code: 'P0001' } }))
    const err = await supabaseAcervo(f.client).blockGarment('g1', '2030-01-10', '2030-01-12', '').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err).toMatchObject({ code: 'CONFLITO_AGENDA', field: 'from', hint: '10/01/2030 – 12/01/2030' })
  })

  it('valida antes de chamar o banco (todos os problemas de uma vez)', async () => {
    const f = fakeClient(() => ({}))
    const err = await supabaseAcervo(f.client).updateGarment('g1', { name: 'A', rentalPrice: 0 }).catch((e: unknown) => e as SourceError)
    expect((err as SourceError).issues?.map((i) => i.code)).toEqual(['NOME_OBRIGATORIO', 'VALOR_LOCACAO_OBRIGATORIO'])
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('addPhoto envia para <peça>/<uuid>.jpg e registra no banco', async () => {
    const f = fakeClient((fn, args) => (fn === 'add_garment_photo' ? { data: raw([{ id: 'p1', path: args!.p_path as string, isCover: true }]) } : {}))
    const g = await supabaseAcervo(f.client).addPhoto('g1', image(), 'frente')
    const path = f.bucket.upload.mock.calls[0]![0]
    expect(path).toMatch(/^g1\/[0-9a-f-]{36}\.jpg$/)
    expect(f.rpc).toHaveBeenCalledWith('add_garment_photo', { p_garment: 'g1', p_kind: 'frente', p_path: path })
    expect(g.photos[0]!.url).toContain(path)
  })

  it('addPhoto recusado pelo banco apaga o arquivo enviado', async () => {
    const f = fakeClient(() => ({ error: { message: 'PARAMETRO_INVALIDO', details: 'photos', hint: '', code: 'P0001' } }))
    await expect(supabaseAcervo(f.client).addPhoto('g1', image(), 'frente')).rejects.toMatchObject({ code: 'PARAMETRO_INVALIDO', field: 'photos' })
    expect(f.bucket.remove).toHaveBeenCalledWith([f.bucket.upload.mock.calls[0]![0]])
  })

  it('addPhoto recusa tipo não aceito ou acima de 10 MB sem enviar', async () => {
    const f = fakeClient(() => ({}))
    const src = supabaseAcervo(f.client)
    await expect(src.addPhoto('g1', image('image/gif'), 'frente')).rejects.toMatchObject({ code: 'PARAMETRO_INVALIDO', field: 'file' })
    await expect(src.addPhoto('g1', image('image/png', 10 * 1024 * 1024 + 1), 'frente')).rejects.toMatchObject({ field: 'file' })
    expect(f.bucket.upload).not.toHaveBeenCalled()
  })

  it('removePhoto apaga o registro, depois o arquivo, e devolve a peça', async () => {
    const f = fakeClient((fn) => (fn === 'remove_garment_photo' ? { data: 'g1/a.jpg' } : { data: raw() }))
    const g = await supabaseAcervo(f.client).removePhoto('g1', 'p1')
    expect(f.bucket.remove).toHaveBeenCalledWith(['g1/a.jpg'])
    expect(g.photos).toEqual([])
  })
})

describe('createSupabaseSource', () => {
  it('manutenções da peça de link quebrado vêm vazias sem chamar o banco; o resto que não está no banco falha com NAO_DISPONIVEL', async () => {
    const src = createSupabaseSource(fakeClient(() => ({})).client)
    await expect(src.reservationsOfGarment('g1')).resolves.toEqual([])
    await expect(src.maintenancesOf('g1')).resolves.toEqual({ maintenances: [], inspections: [] })
    await expect(src.dashboardSummary('30')).rejects.toMatchObject({ code: 'NAO_DISPONIVEL' })
  })
})
