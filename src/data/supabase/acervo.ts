/**
 * Acervo no Supabase: RPCs de `supabase/migrations/20261027000100_acervo.sql` + fotos no bucket privado `pecas-fotos`.
 * As RPCs devolvem a peça já no formato do app; aqui só se trocam os caminhos das fotos por URLs assinadas
 * e os erros do banco por `SourceError` (código em `message`, campo em `details`, detalhe em `hint`).
 * As validações de formulário rodam antes (mesmas regras da prévia) para devolver todos os problemas de uma vez.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { garmentEconomics } from '@/domain/economics'
import { todayISO } from '@/lib/format'
import type { AcervoClientesSource } from '../source'
import { SourceError, type Category, type Garment, type GarmentPhoto, type PhotoKind, type SourceErrorCode, type SourceIssue } from '../types'
import { fitIssues, garmentIssues, measurementIssues } from '../validation'

export const PHOTO_BUCKET = 'pecas-fotos'
/** Igual ao `file_size_limit` do bucket. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }
const SIGNED_SECONDS = 60 * 60
/** URL assinada ainda serve se faltar mais que isto para expirar. */
const SIGNED_MARGIN_MS = 10 * 60 * 1000

type RawPhoto = { id: string; kind: PhotoKind; path: string; isCover: boolean }
export type RawGarment = Omit<Garment, 'photos'> & { photos: RawPhoto[] }

/** Troca o `path` das fotos por URL assinada. Com `forget`, esquece a assinatura de um arquivo apagado. */
export type PhotoSigner = ((raws: RawGarment[]) => Promise<Garment[]>) & { forget(path: string): void }

/**
 * Assinador de fotos do bucket `pecas-fotos`, com cache: reaproveita as URLs que ainda valem
 * (o navegador não baixa a foto de novo). Um por fonte, compartilhado por Acervo e Clientes (recomendações).
 */
export function photoSigner(client: SupabaseClient): PhotoSigner {
  const signed = new Map<string, { url: string; expires: number }>()
  const sign = async (raws: RawGarment[]): Promise<Garment[]> => {
    const now = Date.now()
    const missing = [...new Set(raws.flatMap((g) => g.photos.map((p) => p.path)))].filter((p) => (signed.get(p)?.expires ?? 0) - now < SIGNED_MARGIN_MS)
    if (missing.length) {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(missing, SIGNED_SECONDS)
      if (error) throw error
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, { url: s.signedUrl, expires: now + SIGNED_SECONDS * 1000 })
    }
    return raws.map(({ photos, ...g }) => ({
      ...g,
      photos: photos.map((p): GarmentPhoto => ({ id: p.id, kind: p.kind, isCover: p.isCover, url: signed.get(p.path)?.url ?? '' })),
    }))
  }
  return Object.assign(sign, { forget: (path: string) => void signed.delete(path) })
}

export type AcervoSource = Pick<
  AcervoClientesSource,
  | 'listCategories'
  | 'listBrands'
  | 'searchGarments'
  | 'garmentCounts'
  | 'garmentEconomics'
  | 'acervoInvestment'
  | 'getGarment'
  | 'createGarment'
  | 'updateGarment'
  | 'updateFit'
  | 'updateMeasurement'
  | 'addPhoto'
  | 'removePhoto'
  | 'setCover'
  | 'blockGarment'
  | 'releaseBlock'
>

/** Falha com todos os problemas de uma validação (o primeiro vira `code`/`field`). */
export function fail(issues: SourceIssue[]): never {
  const [first] = issues
  throw new SourceError(first!.code, { field: first!.field, issues })
}

/** Erro do banco → `SourceError` quando é um código das RPCs; senão `Error` com a mensagem (ex.: SEM_PERMISSAO). */
export function fromDbError(err: PostgrestError | Error): Error {
  const code = err.message
  if (!/^[A-Z][A-Z_]+$/.test(code)) return err instanceof Error ? err : new Error(code)
  const details = 'details' in err ? err.details : null
  const hint = 'hint' in err ? err.hint : null
  return new SourceError(code as SourceErrorCode, { field: details || undefined, hint: hint || undefined })
}

export function supabaseAcervo(client: SupabaseClient, withUrls: PhotoSigner = photoSigner(client)): AcervoSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }

  const one = async (raw: RawGarment) => (await withUrls([raw]))[0]!
  const garmentRpc = async (fn: string, args: Record<string, unknown>) => one(await rpc<RawGarment>(fn, args))

  return {
    listCategories: async () => {
      const rows = await rpc<{ slug: string; name: string; cleaning_days: number }[]>('list_garment_categories')
      return rows.map((r): Category => ({ slug: r.slug, name: r.name, cleaningDays: r.cleaning_days }))
    },

    listBrands: () => rpc<string[]>('list_brands'),

    searchGarments: async (f, page) => {
      const r = await rpc<{ items: RawGarment[]; total: number }>('search_garments', {
        p_q: f.q ?? '',
        p_cat: f.cat ?? null,
        p_state_group: f.stateGroup ?? null,
        p_size: f.size ?? null,
        p_limit: page.limit,
        p_offset: page.offset,
      })
      return { items: await withUrls(r.items), total: r.total }
    },

    garmentCounts: (f) => rpc('garment_counts', { p_q: f.q ?? '', p_cat: f.cat ?? null, p_size: f.size ?? null }),

    // Locações, receita, higienização e manutenção entram quando Reservas e Operação forem para o banco.
    garmentEconomics: async (ids) => {
      if (!ids.length) return []
      const rows = await rpc<{ garment_id: string; acquisition_cost: number | null }[]>('garment_costs', { p_ids: ids })
      const empty = { reservations: [], payables: [], finCategories: [] }
      return rows.map((r) => garmentEconomics({ id: r.garment_id, acquisitionCost: r.acquisition_cost }, empty, todayISO()))
    },

    acervoInvestment: async () => Number(await rpc<number | string>('acervo_investment')),

    getGarment: async (id) => {
      const raw = await rpc<RawGarment | null>('get_garment', { p_id: id })
      return raw ? one(raw) : null
    },

    createGarment: async (input) => {
      const issues = garmentIssues(input)
      if (issues.length) fail(issues)
      return garmentRpc('create_garment', { p: input })
    },

    updateGarment: async (id, input) => {
      const issues = garmentIssues(input, true)
      if (issues.length) fail(issues)
      return garmentRpc('update_garment', { p_id: id, p: input })
    },

    updateFit: async (id, input) => {
      const issues = fitIssues(input)
      if (issues.length) fail(issues)
      return garmentRpc('update_garment_fit', { p_id: id, p: input })
    },

    updateMeasurement: async (id, input) => {
      const issues = measurementIssues(input)
      if (issues.length) fail(issues)
      return garmentRpc('update_garment_measurement', { p_id: id, p: input })
    },

    addPhoto: async (id, file, kind) => {
      const ext = PHOTO_TYPES[file.type]
      if (!ext || file.size > PHOTO_MAX_BYTES) fail([{ code: 'PARAMETRO_INVALIDO', field: 'file' }])
      const path = `${id}/${crypto.randomUUID()}.${ext}`
      const up = await client.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw up.error
      try {
        return await garmentRpc('add_garment_photo', { p_garment: id, p_kind: kind, p_path: path })
      } catch (err) {
        // Registro recusado (limite de fotos, peça apagada): não deixa o arquivo órfão no bucket.
        await client.storage.from(PHOTO_BUCKET).remove([path])
        throw err
      }
    },

    removePhoto: async (id, photoId) => {
      const path = await rpc<string>('remove_garment_photo', { p_garment: id, p_photo: photoId })
      withUrls.forget(path)
      const { error } = await client.storage.from(PHOTO_BUCKET).remove([path])
      if (error) console.error('removePhoto: arquivo não apagado do bucket', { path, message: error.message })
      const g = await rpc<RawGarment | null>('get_garment', { p_id: id })
      if (!g) throw new SourceError('NAO_ENCONTRADO')
      return one(g)
    },

    setCover: (id, photoId) => garmentRpc('set_cover_photo', { p_garment: id, p_photo: photoId }),

    blockGarment: (id, from, to, note) => garmentRpc('block_garment', { p_garment: id, p_from: from || null, p_to: to || null, p_note: note }),

    releaseBlock: (id, blockId) => garmentRpc('release_block', { p_garment: id, p_block: blockId }),
  }
}
