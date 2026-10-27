/**
 * Operação no Supabase: RPCs de `supabase/migrations/20261027000600_operacao.sql` (fila, checklist, inspeção,
 * conclusão de ordens, liberação, histórico da peça e fornecedores). As RPCs devolvem tudo no formato do app;
 * aqui só se assinam as fotos (peças e inspeção, bucket `pecas-fotos`) e se trocam os erros do banco por
 * `SourceError`. Custos (ordem, últimos 30 dias) chegam `null` sem `acervo.cost`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperacaoSource } from '../source-operacao'
import { SourceError, type Inspection, type InspectionResult, type Maintenance, type OperacaoQueue, type QueueRow } from '../types'
import { fromDbError, photoSigner, type PhotoSigner, type RawGarment } from './acervo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QUEUES = ['inspecao', 'higienizacao', 'ajuste', 'manutencao', 'bloqueado'] as const

type RawRow = Omit<QueueRow, 'garment'> & { garment: RawGarment }
type RawQueue = Omit<OperacaoQueue, (typeof QUEUES)[number]> & Record<(typeof QUEUES)[number], RawRow[]>
type RawInspection = Omit<Inspection, 'photos'> & { photos: { id: string; kind: Inspection['photos'][number]['kind']; path: string | null }[] }

export function supabaseOperacao(client: SupabaseClient, withUrls: PhotoSigner = photoSigner(client)): OperacaoSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }
  const one = async (raw: RawGarment) => (await withUrls([raw]))[0]!

  return {
    operacaoQueue: async () => {
      const raw = await rpc<RawQueue>('operacao_queue')
      const signed = await withUrls(QUEUES.flatMap((k) => raw[k].map((r) => r.garment)))
      let i = 0
      const out = { ...raw } as unknown as OperacaoQueue
      for (const k of QUEUES) out[k] = raw[k].map((r) => ({ ...r, garment: signed[i++]! }))
      return out
    },

    checklist: () => rpc('operacao_checklist'),

    inspectionTarget: async (garmentId) => (UUID.test(garmentId) ? rpc('inspection_target', { p_garment: garmentId }) : null),

    registerInspection: async (input) => {
      const r = await rpc<{ result: InspectionResult; garment: RawGarment }>('register_inspection', { p: input })
      return { result: r.result, garment: await one(r.garment) }
    },

    closeMaintenance: async (input) => one(await rpc<RawGarment>('close_maintenance', { p: input })),

    releaseGarment: async (garmentId, note) => {
      if (!UUID.test(garmentId)) throw new SourceError('PECA_NAO_ENCONTRADA')
      return one(await rpc<RawGarment>('release_garment', { p_garment: garmentId, p_note: note }))
    },

    // Link quebrado (`/acervo/abc`) não chega ao banco: peça sem histórico.
    maintenancesOf: async (garmentId) => {
      if (!UUID.test(garmentId)) return { maintenances: [], inspections: [] }
      const raw = await rpc<{ maintenances: Maintenance[]; inspections: RawInspection[] }>('maintenances_of', { p_garment: garmentId })
      const url = await withUrls.urls(raw.inspections.flatMap((i) => i.photos.flatMap((p) => (p.path ? [p.path] : []))))
      return {
        maintenances: raw.maintenances,
        // Foto registrada só pelo tipo (a tela ainda não envia arquivo) fica sem URL.
        inspections: raw.inspections.map(({ photos, ...i }) => ({ ...i, photos: photos.map((p) => ({ id: p.id, kind: p.kind, url: p.path ? (url.get(p.path) ?? '') : '' })) })),
      }
    },

    suppliers: () => rpc('operacao_suppliers'),
  }
}
